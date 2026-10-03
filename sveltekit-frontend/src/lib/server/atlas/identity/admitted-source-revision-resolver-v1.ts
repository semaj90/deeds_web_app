import { pool } from '$lib/server/db/client.js';

const SHA256 = /^sha256:[a-f0-9]{64}$/i;
const DIGEST = /^(?:sha256:)?([a-f0-9]{64})$/i;

export interface AdmittedSourceRevisionV1 {
	repoId: string;
	sourceRef: string;
	sourceRevision: string;
	workspaceRevision: string;
	contentDigest: string;
	bindingChecksum: string;
}

export class AdmittedSourceRevisionError extends Error {
	constructor(readonly code: string) { super(code); }
}

export function validateAdmittedSourceRevisionRowV1(
	row: { repo_id?: string; canonical_source_ref?: string; workspace_revision?: string; source_revision?: string; content_digest?: string; binding_checksum?: string } | undefined,
	expected: { sourceRef: string; workspaceRevision: string },
): AdmittedSourceRevisionV1 {
	if (!row) throw new AdmittedSourceRevisionError('SOURCE_BINDING_NOT_FOUND');
	const digestMatch = String(row.content_digest ?? '').match(DIGEST);
	const sourceRevision = String(row.source_revision ?? '');
	if (row.canonical_source_ref !== expected.sourceRef || row.workspace_revision !== expected.workspaceRevision) {
		throw new AdmittedSourceRevisionError('SOURCE_BINDING_SCOPE_MISMATCH');
	}
	if (!row.repo_id || !SHA256.test(sourceRevision) || !digestMatch ||
		`sha256:${digestMatch[1]}`.toLowerCase() !== sourceRevision.toLowerCase()) {
		throw new AdmittedSourceRevisionError('SOURCE_BINDING_DIGEST_MISMATCH');
	}
	if (!row.binding_checksum || !DIGEST.test(row.binding_checksum)) {
		throw new AdmittedSourceRevisionError('SOURCE_BINDING_CHECKSUM_MISSING');
	}
	return {
		repoId: row.repo_id,
		sourceRef: expected.sourceRef,
		sourceRevision: sourceRevision.toLowerCase(),
		workspaceRevision: expected.workspaceRevision,
		contentDigest: digestMatch[1].toLowerCase(),
		bindingChecksum: row.binding_checksum.toLowerCase(),
	};
}

/** Resolve, never infer, one source revision from the existing admitted binding owner. */
export async function resolveAdmittedSourceRevisionV1(input: {
	sourceRef: string;
	workspaceRevision: string;
}): Promise<AdmittedSourceRevisionV1> {
	const sourceRef = input.sourceRef.trim();
	const workspaceRevision = input.workspaceRevision.trim();
	if (!sourceRef || !SHA256.test(workspaceRevision)) throw new AdmittedSourceRevisionError('SOURCE_SCOPE_REQUIRED');

	const result = await pool.query<{
		repo_id: string;
		canonical_source_ref: string;
		workspace_revision: string;
		source_revision: string;
		content_digest: string;
		binding_checksum: string;
	}>(
		`SELECT repo_id, canonical_source_ref, workspace_revision, source_revision, content_digest, binding_checksum
		   FROM public.atlas_workspace_source_bindings
		  WHERE canonical_source_ref = $1 AND workspace_revision = $2
		  ORDER BY repo_id`,
		[sourceRef, workspaceRevision],
	);
	if (result.rows.length === 0) throw new AdmittedSourceRevisionError('SOURCE_BINDING_NOT_FOUND');
	if (result.rows.length !== 1) throw new AdmittedSourceRevisionError('SOURCE_BINDING_AMBIGUOUS');

	return validateAdmittedSourceRevisionRowV1(result.rows[0], { sourceRef, workspaceRevision });
}
