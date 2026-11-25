import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { RequestHandler } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';
import { z } from 'zod';
import { pool } from '$lib/server/db/client.js';
import { canonicalSha256V1 } from '$lib/server/atlas/prefill/canonical-hash-v1.js';
import { defaultNormalizeRelativeSourceRef } from '$lib/server/atlas/authorization/actor-workspace-grant-v1.js';
import { findRepoRoot } from '$lib/server/atlas/admission/workspace-admission-panel-v1.js';
import { resolveTrustedWorkspaceAuthorityV1 } from '$lib/server/retrieval/trusted-workspace-authority-v1.js';

const CURRENT_FRAME_RECEIPT = path.join('.tmp', 'review', 'current-workspace-frame-admission-v1.json');
const MAX_FRAME_RECEIPT_AGE_MS = 5 * 60 * 1000;

type CurrentFrameReceipt = {
	schema?: unknown;
	generatedAt?: unknown;
	admittedWorkspaceRevision?: unknown;
	cohortRows?: unknown;
	currentWorkspaceMatches?: unknown;
	workspaceMismatches?: unknown;
	sourceAuthority?: { safeToPromote?: unknown; requiresSnapshotRefresh?: unknown };
	status?: unknown;
	writesPerformed?: unknown;
};

async function currentFrameGate(workspaceRevision: string): Promise<'CURRENT' | 'UNAVAILABLE' | 'STALE' | 'NOT_CURRENT'> {
	const root = await findRepoRoot();
	if (!root) return 'UNAVAILABLE';
	let receipt: CurrentFrameReceipt;
	try {
		receipt = JSON.parse(await readFile(path.join(root, CURRENT_FRAME_RECEIPT), 'utf8')) as CurrentFrameReceipt;
	} catch {
		return 'UNAVAILABLE';
	}
	if (receipt.schema !== 'atlas.current-workspace-frame-receipt.v1' || typeof receipt.generatedAt !== 'string') return 'UNAVAILABLE';
	const generatedAt = Date.parse(receipt.generatedAt);
	const ageMs = Date.now() - generatedAt;
	if (!Number.isFinite(generatedAt) || ageMs < -60_000 || ageMs > MAX_FRAME_RECEIPT_AGE_MS) return 'STALE';
	if (receipt.admittedWorkspaceRevision !== workspaceRevision
		|| typeof receipt.cohortRows !== 'number'
		|| receipt.cohortRows <= 0
		|| receipt.currentWorkspaceMatches !== receipt.cohortRows
		|| receipt.workspaceMismatches !== 0
		|| receipt.sourceAuthority?.safeToPromote !== true
		|| receipt.sourceAuthority?.requiresSnapshotRefresh !== false
		|| receipt.status !== 'CURRENT_WORKSPACE_FRAME_PROVEN'
		|| receipt.writesPerformed !== false) return 'NOT_CURRENT';
	return 'CURRENT';
}

const GrantActionSchema = z.discriminatedUnion('action', [
	z.object({
		action: z.literal('grant'),
		actorId: z.string().trim().min(1).max(128),
		workspaceId: z.string().uuid(),
		repositoryId: z.string().trim().min(1).max(256),
		sourceRefs: z.array(z.string().min(1).max(2048)).min(1).max(500),
		expiresAt: z.string().datetime().optional(),
	}).strict(),
	z.object({
		action: z.literal('revoke'),
		grantRevision: z.string().regex(/^sha256:[a-f0-9]{64}$/),
		reason: z.string().trim().min(1).max(500).optional(),
	}).strict(),
]);

function adminDenied(status: 401 | 403, error: 'Unauthorized' | 'Forbidden') {
	return json({ success: false, action: null, grantRevision: null, error, writesPerformed: false }, { status });
}

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) return adminDenied(401, 'Unauthorized');
	if ((locals.user.role !== 'admin' && locals.user.role !== 'superadmin') || locals.session?.id === 'dev-bypass-session') {
		return adminDenied(403, 'Forbidden');
	}

	let input: z.infer<typeof GrantActionSchema>;
	try {
		input = GrantActionSchema.parse(await request.json());
	} catch {
		return json({ success: false, action: null, grantRevision: null, error: 'INVALID_REQUEST', writesPerformed: false }, { status: 400 });
	}

	if (input.action === 'revoke') {
		try {
			const result = await pool.query(
				`UPDATE public.atlas_actor_workspace_source_grants_v1
				 SET status = 'DENIED', revoked_at = now(), revoked_by = $2, revocation_reason = $3
				 WHERE grant_revision = $1 AND status = 'GRANTED' AND revoked_at IS NULL
				 RETURNING grant_revision`,
				[input.grantRevision, String(locals.user.id), input.reason ?? 'Administrative revocation'],
			);
			if (result.rowCount !== 1) {
				return json({ success: false, action: 'revoke', grantRevision: input.grantRevision, error: 'GRANT_NOT_FOUND_OR_ALREADY_REVOKED', writesPerformed: false }, { status: 409 });
			}
			return json({ success: true, action: 'revoke', grantRevision: input.grantRevision, error: null, writesPerformed: true });
		} catch {
			return json({ success: false, action: 'revoke', grantRevision: input.grantRevision, error: 'GRANT_LEDGER_UNAVAILABLE', writesPerformed: false }, { status: 503 });
		}
	}

	const authority = await resolveTrustedWorkspaceAuthorityV1().catch(() => ({ status: 'UNAVAILABLE' as const }));
	if (authority.status !== 'TRUSTED') {
		return json({ success: false, action: 'grant', grantRevision: null, error: 'TRUSTED_WORKSPACE_AUTHORITY_UNAVAILABLE', writesPerformed: false }, { status: 503 });
	}
	const frame = await currentFrameGate(authority.workspaceRevision);
	if (frame !== 'CURRENT') {
		const error = frame === 'STALE' ? 'CURRENT_WORKSPACE_FRAME_AUDIT_STALE' : frame === 'UNAVAILABLE' ? 'CURRENT_WORKSPACE_FRAME_AUDIT_UNAVAILABLE' : 'CURRENT_SOURCE_AUTHORITY_NOT_PROVEN';
		return json({ success: false, action: 'grant', grantRevision: null, error, writesPerformed: false }, { status: frame === 'NOT_CURRENT' ? 409 : 503 });
	}
	if (input.expiresAt && new Date(input.expiresAt).getTime() <= Date.now()) {
		return json({ success: false, action: 'grant', grantRevision: null, error: 'GRANT_EXPIRY_MUST_BE_FUTURE', writesPerformed: false }, { status: 400 });
	}

	const normalizedRefs = input.sourceRefs.map((sourceRef) => defaultNormalizeRelativeSourceRef(sourceRef));
	if (normalizedRefs.some((sourceRef) => sourceRef === null)) {
		return json({ success: false, action: 'grant', grantRevision: null, error: 'SOURCE_REF_INVALID', writesPerformed: false }, { status: 400 });
	}
	const sourceRefs = normalizedRefs as string[];
	if (new Set(sourceRefs).size !== sourceRefs.length) {
		return json({ success: false, action: 'grant', grantRevision: null, error: 'DUPLICATE_SOURCE_REF', writesPerformed: false }, { status: 400 });
	}

	const client = await pool.connect().catch(() => null);
	if (!client) {
		return json({ success: false, action: 'grant', grantRevision: null, error: 'GRANT_LEDGER_UNAVAILABLE', writesPerformed: false }, { status: 503 });
	}
	let inTransaction = false;
	try {
		await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ');
		inTransaction = true;
		const workspace = await client.query('SELECT id FROM public.workspaces WHERE id = $1 LIMIT 1', [input.workspaceId]);
		if (workspace.rowCount !== 1) {
			await client.query('ROLLBACK');
			inTransaction = false;
			return json({ success: false, action: 'grant', grantRevision: null, error: 'WORKSPACE_NOT_FOUND', writesPerformed: false }, { status: 404 });
		}
		const currentSources = await client.query(
			`SELECT canonical_source_ref
			 FROM public.atlas_workspace_source_bindings
			 WHERE repo_id = $1 AND workspace_revision = $2
			   AND canonical_source_ref = ANY($3::text[])
			 ORDER BY canonical_source_ref`,
			[input.repositoryId, authority.workspaceRevision, sourceRefs],
		);
		const verifiedRefs = currentSources.rows.map((row) => String(row.canonical_source_ref));
		if (verifiedRefs.length !== sourceRefs.length || sourceRefs.some((sourceRef) => !verifiedRefs.includes(sourceRef))) {
			await client.query('ROLLBACK');
			inTransaction = false;
			return json({ success: false, action: 'grant', grantRevision: null, error: 'SOURCE_REFS_NOT_BOUND_TO_CURRENT_WORKSPACE_REVISION', writesPerformed: false }, { status: 409 });
		}

		const issuedAt = new Date().toISOString();
		const grantRevision = `sha256:${canonicalSha256V1({
			schema: 'atlas.actor-workspace-source-grant-revision.v1',
			nonce: randomUUID(),
			actorId: input.actorId,
			workspaceId: input.workspaceId,
			workspaceRevision: authority.workspaceRevision,
			repositoryId: input.repositoryId,
			permittedSourceRefs: sourceRefs,
			issuedBy: String(locals.user.id),
			issuedAt,
			expiresAt: input.expiresAt ?? null,
		})}`;
		await client.query(
			`INSERT INTO public.atlas_actor_workspace_source_grants_v1
			 (actor_id, actor_type, workspace_id, workspace_revision, repository_id,
			  permitted_source_refs, grant_revision, status, issued_by, issued_at, expires_at)
			 VALUES ($1, 'USER', $2, $3, $4, $5::text[], $6, 'GRANTED', $7, $8::timestamptz, $9::timestamptz)`,
			[input.actorId, input.workspaceId, authority.workspaceRevision, input.repositoryId, sourceRefs, grantRevision, String(locals.user.id), issuedAt, input.expiresAt ?? null],
		);
		await client.query('COMMIT');
		inTransaction = false;
		return json({ success: true, action: 'grant', grantRevision, error: null, writesPerformed: true });
	} catch (error) {
		if (inTransaction) await client.query('ROLLBACK').catch(() => undefined);
		const code = typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : '';
		return json({
			success: false,
			action: 'grant',
			grantRevision: null,
			error: code === '23505' ? 'ACTIVE_GRANT_ALREADY_EXISTS' : 'GRANT_LEDGER_OR_SOURCE_BINDING_UNAVAILABLE',
			writesPerformed: false,
		}, { status: code === '23505' ? 409 : 503 });
	} finally {
		client.release();
	}
};
