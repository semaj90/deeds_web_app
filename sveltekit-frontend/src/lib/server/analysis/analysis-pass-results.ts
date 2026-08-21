import { createHash, randomUUID } from 'node:crypto';

import { db, pgRows } from '$lib/server/db/client.js';
import {
	analysisPassResults,
	resolveExecutionSemantics,
	type AnalysisPassLedgerInput,
	type AnalysisPassPersistResult,
	type AnalysisPassResultRow,
	normalizeAnalysisPassLedgerInput,
} from '$lib/server/db/schema/analysis-pass-results.js';
import { eq, sql } from 'drizzle-orm';
import { writeIntegrationEventOutboxRow } from '$lib/server/queue/outbox.js';
import {
	codeEvidencePersistedEventSchema,
	type CodeEvidencePersistedEventV1,
} from '$lib/server/queue/integration-events.js';
import type { EventFabricType } from '$lib/server/queue/event-fabric.js';
import type { EventRoutingKey } from '$lib/server/queue/topology.js';

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

export type AnalysisPassDuplicateClassification =
	| 'identical_retry'
	| 'stochastic_history'
	| 'revision_mixed'
	| 'ambiguous';

export interface AnalysisPassDuplicateGroup {
	passKey: string | null;
	packetKey: string | null;
	passType: string | null;
	inputHash: string | null;
	copies: number;
	firstSeen: string | null;
	lastSeen: string | null;
	outputVersions: number;
	provenanceVersions: number;
	sourceRevisionVersions: number;
	passRevisionVersions: number;
	classification: AnalysisPassDuplicateClassification;
	classificationReason: string;
}

export interface AnalysisPassLedgerProofSnapshot {
	generatedAt: string;
	totalRows: number;
	duplicateGroupCount: number;
	classificationCounts: Record<AnalysisPassDuplicateClassification, number>;
	duplicateGroups: AnalysisPassDuplicateGroup[];
}

export function classifyAnalysisPassDuplicateGroup(input: {
	outputVersions: number;
	provenanceVersions: number;
	sourceRevisionVersions: number;
	passRevisionVersions: number;
}): Pick<AnalysisPassDuplicateGroup, 'classification' | 'classificationReason'> {
	if (input.outputVersions > 1) {
		return {
			classification: 'stochastic_history',
			classificationReason: 'multiple output versions observed for the same logical duplicate group',
		};
	}

	if (input.sourceRevisionVersions > 1 || input.passRevisionVersions > 1) {
		return {
			classification: 'revision_mixed',
			classificationReason: 'duplicate group mixes more than one source or pass revision',
		};
	}

	if (input.provenanceVersions <= 1) {
		return {
			classification: 'identical_retry',
			classificationReason: 'same provenance observed with no output divergence',
		};
	}

	return {
		classification: 'ambiguous',
		classificationReason: 'duplicate group has multiple provenance values but no output divergence',
	};
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

export interface RecordAnalysisPassResultOptions {
	/**
	 * When supplied, an integration event outbox row is written in the SAME
	 * transaction as the ledger insert — atomic with the write it reports on.
	 * Never emitted on the deterministic_idempotent short-circuit path (no new
	 * row was persisted there, so there's nothing to notify about).
	 */
	emitIntegrationEvent?: {
		eventType: EventFabricType;
		routingKey: EventRoutingKey;
		traceId?: string;
		sourceRef?: string;
	};
}

function buildCodeEvidencePersistedEvent(
	row: AnalysisPassResultRow
): CodeEvidencePersistedEventV1 {
	const output = (row.output ?? {}) as Record<string, unknown>;
	const receipt = (output.codeEvidenceReceipt ?? {}) as Record<string, unknown>;
	const packet = (output.posConceptPacket ?? {}) as Record<string, unknown>;
	const provenance = (row.provenance ?? {}) as Record<string, unknown>;
	const sourceRef = row.sourceRef ?? (typeof provenance.sourceRef === 'string' ? provenance.sourceRef : null);
	const sourceRevision =
		row.sourceRevision ?? (typeof provenance.sourceRevision === 'string' ? provenance.sourceRevision : null);
	const treeNodeId = typeof receipt.treeNodeId === 'string' ? receipt.treeNodeId : null;
	const schemaRevision = typeof receipt.schemaVersion === 'string' ? receipt.schemaVersion : null;
	const producerId = typeof provenance.producerId === 'string' ? provenance.producerId : null;
	const producerRevision =
		typeof provenance.producerRevision === 'string' ? provenance.producerRevision : null;
	const createdAt: unknown = row.createdAt;
	const occurredAt =
		createdAt instanceof Date
			? createdAt.toISOString()
			: typeof createdAt === 'string'
				? new Date(createdAt).toISOString()
				: new Date().toISOString();

	if (!sourceRef || !sourceRevision || !schemaRevision || !producerId || !producerRevision) {
		throw new Error('Code evidence integration event is missing required identity fields');
	}

	return codeEvidencePersistedEventSchema.parse({
		eventId: randomUUID(),
		eventType: 'code.evidence.persisted',
		occurredAt,
		traceId: typeof provenance.traceId === 'string' ? provenance.traceId : undefined,
		sourceRef,
		payload: {
			evidenceId: String(row.id),
			passKey: row.passKey,
			sourceRef,
			sourceRevision,
			parseNodeId: treeNodeId,
			packetKey: row.packetKey,
			logicalEvidenceHash: row.passIdentityHash ?? row.passKey,
			synthesisReceiptHash: sha256Hex(stableStringify(receipt)),
			posConceptPacketHash: sha256Hex(stableStringify(packet)),
			producerId,
			producerRevision,
			schemaRevision,
		},
	});
}

export async function recordAnalysisPassResult(
	input: AnalysisPassLedgerInput,
	opts?: RecordAnalysisPassResultOptions
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

		if (opts?.emitIntegrationEvent) {
			const emit = opts.emitIntegrationEvent;
			return await db.transaction(async (tx) => {
				const [fresh] = await tx
					.insert(analysisPassResults)
					.values(row)
					.returning();

				const rowResult = fresh ?? (row as unknown as AnalysisPassResultRow);
				const codeEvidenceEvent = buildCodeEvidencePersistedEvent(rowResult);

				await writeIntegrationEventOutboxRow(tx, {
					runId: input.analysisJobId,
					eventType: emit.eventType,
					routingKey: emit.routingKey,
					payload: codeEvidenceEvent.payload,
					traceId: emit.traceId,
					sourceRef: emit.sourceRef,
				});

				return {
					inserted: true,
					idempotencyKey: row.passKey,
					row: rowResult,
				};
			});
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
		const rows = pgRows<Record<string, unknown>>(await db.execute(sql`
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
		`));

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
			...classifyAnalysisPassDuplicateGroup({
				outputVersions: Number(row.output_versions ?? 0),
				provenanceVersions: Number(row.provenance_versions ?? 0),
				sourceRevisionVersions: Number(row.source_revision_versions ?? 0),
				passRevisionVersions: Number(row.pass_revision_versions ?? 0),
			}),
		}));
	} catch (err) {
		if (isMissingAnalysisPassResultsTableError(err)) {
			markAnalysisPassResultsUnavailable();
			return [];
		}
		throw err;
	}
}

export async function buildAnalysisPassLedgerProofSnapshot(limit = 5000): Promise<AnalysisPassLedgerProofSnapshot | null> {
	if (analysisPassResultsTableMissing) return null;

	try {
		const totalRowsResult = pgRows<{ total_rows: string | number }>(await db.execute(sql`
			SELECT COUNT(*)::bigint AS total_rows
			FROM analysis_pass_results
		`));
		const totalRows = Number(totalRowsResult[0]?.total_rows ?? 0);
		const duplicateGroups = (await findAnalysisPassDuplicateGroups(limit)) as AnalysisPassDuplicateGroup[];
		const classificationCounts: Record<AnalysisPassDuplicateClassification, number> = {
			identical_retry: 0,
			stochastic_history: 0,
			revision_mixed: 0,
			ambiguous: 0,
		};

		for (const group of duplicateGroups) {
			classificationCounts[group.classification] += 1;
		}

		return {
			generatedAt: new Date().toISOString(),
			totalRows,
			duplicateGroupCount: duplicateGroups.length,
			classificationCounts,
			duplicateGroups,
		};
	} catch (err) {
		if (isMissingAnalysisPassResultsTableError(err)) {
			markAnalysisPassResultsUnavailable();
			return null;
		}
		throw err;
	}
}
