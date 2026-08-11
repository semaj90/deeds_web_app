import { createHash } from 'node:crypto';

import { db } from '$lib/server/db/client.js';
import {
	analysisPassResults,
	resolveExecutionSemantics,
	type AnalysisPassLedgerInput,
	type AnalysisPassPersistResult,
	type AnalysisPassResultRow,
	normalizeAnalysisPassLedgerInput,
} from '$lib/server/db/schema/analysis-pass-results.js';
import { eq, sql } from 'drizzle-orm';

let analysisPassResultsTableMissing = false;
let loggedMissingAnalysisPassResultsTable = false;

function isMissingAnalysisPassResultsTableError(err: unknown): boolean {
	let current: unknown = err;
	for (let depth = 0; depth < 5 && current; depth++) {
		if (typeof current === 'object' && current !== null) {
			const code = 'code' in current ? String((current as { code?: unknown }).code ?? '') : '';
			const message = 'message' in current ? String((current as { message?: unknown }).message ?? '') : '';
			if (code === '42P01' || message.includes('relation "analysis_pass_results" does not exist')) {
				return true;
			}
			current = 'cause' in current ? (current as { cause?: unknown }).cause : null;
			continue;
		}
		const message = String(current ?? '');
		if (message.includes('relation "analysis_pass_results" does not exist')) {
			return true;
		}
		break;
	}
	return false;
}

function markAnalysisPassResultsUnavailable(): void {
	analysisPassResultsTableMissing = true;
	if (loggedMissingAnalysisPassResultsTable) return;
	loggedMissingAnalysisPassResultsTable = true;
	console.warn('[AnalysisPassResults] analysis_pass_results table is missing; pass ledger is disabled');
}

function stableStringify(value: unknown): string {
	if (value === null || typeof value !== 'object') {
		return JSON.stringify(value);
	}

	if (Array.isArray(value)) {
		return `[${value.map((item) => stableStringify(item)).join(',')}]`;
	}

	const entries = Object.entries(value as Record<string, unknown>)
		.sort(([left], [right]) => left.localeCompare(right))
		.map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`);
	return `{${entries.join(',')}}`;
}

function sha256Hex(value: string): string {
	return createHash('sha256').update(value).digest('hex');
}

export function buildAnalysisPassInputHash(input: AnalysisPassLedgerInput): string {
	const canonical = {
		analysisJobId: input.analysisJobId,
		evidenceId: input.evidenceId,
		caseId: input.caseId ?? null,
		jobType: input.jobType,
		packetKey: input.packetKey ?? null,
		sourceRef: input.sourceRef ?? input.packetKey ?? input.evidenceId,
		sourceRevision: input.sourceRevision ?? null,
		workspaceRevision: input.workspaceRevision ?? null,
		representationRevision: input.representationRevision ?? null,
		family: input.family,
		passName: input.passName,
		passRevision: input.passRevision,
		producerId: input.producerId ?? 'parent-atlas-analysis-worker',
		producerRevision: input.producerRevision ?? 'analysis-worker-v1',
		backend: input.backend,
		backendVersion: input.backendVersion,
		device: input.device,
	};

	return sha256Hex(stableStringify(canonical));
}

export function buildAnalysisPassOutputHash(payload: Record<string, unknown> | undefined): string {
	return sha256Hex(stableStringify(payload ?? {}));
}

export function buildAnalysisPassIdempotencyKey(input: AnalysisPassLedgerInput): string {
	return `analysis-pass:${buildAnalysisPassInputHash(input)}`;
}

export function buildAnalysisPassLedgerEntry(input: AnalysisPassLedgerInput) {
	return normalizeAnalysisPassLedgerInput(input);
}

export async function recordAnalysisPassResult(
	input: AnalysisPassLedgerInput
): Promise<AnalysisPassPersistResult | null> {
	if (analysisPassResultsTableMissing) return null;

	const row = normalizeAnalysisPassLedgerInput(input);
	const semantics = resolveExecutionSemantics(input.passName);

	try {
		// deterministic_idempotent: reuse an existing execution for the same
		// logical pass identity instead of inserting a new row. Anything else
		// (stochastic_history, observed_event) always inserts — see PF4C,
		// openspec/changes/parent-atlas-pass-fabric/tasks.md, for why: a
		// deterministic pass computing the same identity twice should produce
		// the same output, so re-running it is pure waste; a stochastic pass
		// computing the same identity twice legitimately produces different
		// outputs (confirmed this session: summarization, 5 distinct outputs
		// from identical input), so short-circuiting it would silently return
		// stale/wrong data.
		if (semantics === 'deterministic_idempotent' && row.passIdentityHash) {
			const [existing] = await db
				.select()
				.from(analysisPassResults)
				.where(eq(analysisPassResults.passIdentityHash, row.passIdentityHash))
				.orderBy(sql`created_at DESC, id DESC`)
				.limit(1);

			if (existing) {
				return {
					inserted: false,
					idempotencyKey: row.passKey,
					row: existing,
				};
			}
		}

		const [fresh] = await db
			.insert(analysisPassResults)
			.values(row)
			.returning();

		const rowResult = fresh ?? (await db
			.select()
			.from(analysisPassResults)
			.where(eq(analysisPassResults.passKey, row.passKey))
			.orderBy(sql`created_at DESC, id DESC`)
			.limit(1))[0] ?? (row as unknown as AnalysisPassResultRow);

		return {
			inserted: true,
			idempotencyKey: row.passKey,
			row: rowResult,
		};
	} catch (err) {
		if (isMissingAnalysisPassResultsTableError(err)) {
			markAnalysisPassResultsUnavailable();
			return null;
		}
		throw err;
	}
}

export async function getAnalysisPassResultByIdempotencyKey(idempotencyKey: string) {
	if (analysisPassResultsTableMissing) return null;
	try {
		const [row] = await db
			.select()
			.from(analysisPassResults)
			.where(eq(analysisPassResults.passKey, idempotencyKey))
			.limit(1);
		return row ?? null;
	} catch (err) {
		if (isMissingAnalysisPassResultsTableError(err)) {
			markAnalysisPassResultsUnavailable();
			return null;
		}
		throw err;
	}
}

export async function listAnalysisPassResultsForJobId(analysisJobId: string) {
	if (analysisPassResultsTableMissing) return [];
	try {
		return await db
			.select()
			.from(analysisPassResults)
			.where(sql`${analysisPassResults.provenance} ->> 'analysisJobId' = ${analysisJobId}`);
	} catch (err) {
		if (isMissingAnalysisPassResultsTableError(err)) {
			markAnalysisPassResultsUnavailable();
			return [];
		}
		throw err;
	}
}

export async function findAnalysisPassDuplicateGroups(limit = 100) {
	if (analysisPassResultsTableMissing) return [];

	try {
		const rows = await db.execute(sql`
			SELECT
				pass_key,
				packet_key,
				pass_type,
				input_hash,
				COUNT(*)::int AS copies,
				MIN(created_at) AS first_seen,
				MAX(created_at) AS last_seen,
				COUNT(DISTINCT output)::int AS output_versions,
				COUNT(DISTINCT provenance)::int AS provenance_versions,
				COUNT(DISTINCT source_revision)::int AS source_revision_versions,
				COUNT(DISTINCT pass_revision)::int AS pass_revision_versions
			FROM analysis_pass_results
			GROUP BY pass_key, packet_key, pass_type, input_hash
			HAVING COUNT(*) > 1
			ORDER BY copies DESC, last_seen DESC
			LIMIT ${Math.max(1, Math.floor(limit))}
		`);

		return (rows as Array<Record<string, unknown>>).map((row) => ({
			passKey: row.pass_key ?? null,
			packetKey: row.packet_key ?? null,
			passType: row.pass_type ?? null,
			inputHash: row.input_hash ?? null,
			copies: Number(row.copies ?? 0),
			firstSeen: row.first_seen ?? null,
			lastSeen: row.last_seen ?? null,
			outputVersions: Number(row.output_versions ?? 0),
			provenanceVersions: Number(row.provenance_versions ?? 0),
			sourceRevisionVersions: Number(row.source_revision_versions ?? 0),
			passRevisionVersions: Number(row.pass_revision_versions ?? 0),
		}));
	} catch (err) {
		if (isMissingAnalysisPassResultsTableError(err)) {
			markAnalysisPassResultsUnavailable();
			return [];
		}
		throw err;
	}
}
