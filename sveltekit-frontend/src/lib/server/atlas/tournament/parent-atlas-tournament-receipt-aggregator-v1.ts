import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import {
	PARENT_ATLAS_TOURNAMENT_GATES_V1,
	calculateTournamentProgressV1,
	type TournamentGateId,
	type TournamentGateState,
	type TournamentGateV1,
	type TournamentProgressV1,
	type TournamentRunEfficiencyV1
} from './parent-atlas-tournament-progress-v1.js';

const PROMOTION_COHORT_TARGET_V1 = 128;
const GATE_IDS = new Set<TournamentGateId>(PARENT_ATLAS_TOURNAMENT_GATES_V1.map((gate) => gate.id));
const STATES = new Set<TournamentGateState>(['UNPROVEN', 'CREATED', 'WIRED', 'PARTIAL', 'PROVEN', 'DONE', 'BLOCKED']);

export type TournamentGateEvidenceV1 = {
	gateId: TournamentGateId;
	state: TournamentGateState;
	completion?: number;
	receiptRef: string;
	observedAt?: string;
	reason: string;
	filesEdited?: string[];
	openspecChange?: string;
	openspecTaskIds?: string[];
};

export type TournamentReceiptSourceV1 = {
	path: string;
	schema: string | null;
	status: string | null;
	accepted: boolean;
	gateIds: TournamentGateId[];
	diagnostics: string[];
};

export type ParentAtlasTournamentSnapshotV1 = {
	schema: 'atlas.parent-tournament-snapshot.v1';
	generatedAt: string;
	promotionCohortTarget: number;
	progress: TournamentProgressV1;
	gates: TournamentGateV1[];
	sources: TournamentReceiptSourceV1[];
	diagnostics: string[];
};

type JsonRecord = Record<string, unknown>;

type ReceiptAdapterResult = {
	source: TournamentReceiptSourceV1;
	evidence: TournamentGateEvidenceV1[];
	efficiency?: TournamentRunEfficiencyV1;
};

const REPORT_PATHS = [
	'docs/reports/structural-intelligence-integration-proof.json',
	'docs/reports/lineage-qualified-current-candidate-map-v2.json',
	'docs/reports/lineage-semantic-768-cohort-v1.json',
	'docs/reports/lineage-pgvector-qdrant-parity-v1.json',
	'docs/reports/lineage-qdrant-semantic-canary-v1.json',
	'docs/reports/go-retrieval-chunk-stream-replay-v1.json',
	'docs/reports/atlas-candidate-shortlist-receipt-v1.json',
	'docs/reports/parent-atlas-tournament-gate-receipts-v1.json',
	'docs/reports/parent-atlas-tournament-efficiency-v1.json'
] as const;

function asRecord(value: unknown): JsonRecord | null {
	return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : null;
}

function asString(value: unknown): string | null {
	return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function asNumber(value: unknown): number | null {
	return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function asBoolean(value: unknown): boolean | null {
	return typeof value === 'boolean' ? value : null;
}

function clampCompletion(value: number): number {
	return Math.max(0, Math.min(0.95, value));
}

function cohortCompletion(count: number): number {
	return clampCompletion(count / PROMOTION_COHORT_TARGET_V1);
}

function source(path: string, record: JsonRecord | null, accepted: boolean, evidence: TournamentGateEvidenceV1[], diagnostics: string[]): TournamentReceiptSourceV1 {
	return {
		path,
		schema: asString(record?.schema),
		status: asString(record?.status),
		accepted,
		gateIds: [...new Set(evidence.map((item) => item.gateId))],
		diagnostics
	};
}

function structuralAdapter(path: string, record: JsonRecord): ReceiptAdapterResult | null {
	if (record.schema !== 'atlas.structural-intelligence-integration-proof.v1') return null;
	const status = asString(record.status);
	const evidence: TournamentGateEvidenceV1[] = [];
	if (status === 'PROVEN_WITH_LIVE_8095') {
		evidence.push(
			{ gateId: 'treesitter_ast', state: 'PROVEN', receiptRef: path, observedAt: asString(record.generatedAt) ?? undefined, reason: 'Live 8095 Tree-sitter structural integration proof passed.' },
			{ gateId: 'ast_grep_structural', state: 'PROVEN', receiptRef: path, observedAt: asString(record.generatedAt) ?? undefined, reason: 'AST-grep is included in the proven structural integration boundary.' }
		);
	} else if (status?.includes('WIRED')) {
		evidence.push(
			{ gateId: 'treesitter_ast', state: 'WIRED', receiptRef: path, observedAt: asString(record.generatedAt) ?? undefined, reason: `Structural integration is wired but not live-proven (${status}).` },
			{ gateId: 'ast_grep_structural', state: 'WIRED', receiptRef: path, observedAt: asString(record.generatedAt) ?? undefined, reason: `Structural integration is wired but not live-proven (${status}).` }
		);
	}
	return { source: source(path, record, evidence.length > 0, evidence, evidence.length ? [] : ['STRUCTURAL_STATUS_NOT_PROMOTABLE']), evidence };
}

function candidateMapAdapter(path: string, record: JsonRecord): ReceiptAdapterResult | null {
	if (record.schema !== 'atlas.lineage-qualified-candidate-map-receipt.v1') return null;
	const lineage = asRecord(record.lineage);
	const map = asRecord(record.map);
	const count = asNumber(record.actualCandidateCount) ?? 0;
	const valid = count > 0
		&& asBoolean(lineage?.sourceRefEquality) === true
		&& asBoolean(lineage?.packetChunkContentHashEquality) === true
		&& asBoolean(lineage?.uniqueGraphifySourceRow) === true
		&& asBoolean(lineage?.syntheticRevisionFallbacks) === false
		&& asNumber(map?.rowCount) === count
		&& map?.schema === 'atlas.candidate-ordinal-map.v1';
	const evidence: TournamentGateEvidenceV1[] = valid ? [
		{ gateId: 'source_identity', state: 'PARTIAL', completion: cohortCompletion(count), receiptRef: path, observedAt: asString(record.generatedAt) ?? undefined, reason: `${count}/${PROMOTION_COHORT_TARGET_V1} exact lineage-qualified candidates admitted without synthetic revisions.` },
		{ gateId: 'candidate_ordinal', state: 'PARTIAL', completion: cohortCompletion(count), receiptRef: path, observedAt: asString(record.generatedAt) ?? undefined, reason: `${count}/${PROMOTION_COHORT_TARGET_V1} CandidateOrdinal rows are checksum-bound to the exact lineage cohort.` },
		{ gateId: 'postgres18_canonical', state: 'WIRED', receiptRef: path, observedAt: asString(record.generatedAt) ?? undefined, reason: 'Canonical lineage cohort is read from PostgreSQL, but this receipt is explicitly read-only and does not prove write/readback.' }
	] : [];
	return { source: source(path, record, valid, evidence, valid ? [] : ['LINEAGE_CANARY_VALIDATION_FAILED']), evidence };
}

function semanticAdapter(path: string, record: JsonRecord): ReceiptAdapterResult | null {
	if (record.schema !== 'atlas.lineage-semantic-768-cohort.v1') return null;
	const contract = asRecord(record.contract);
	const counts = asRecord(record.counts);
	const candidates = asNumber(counts?.candidates) ?? 0;
	const qualified = asNumber(counts?.semanticQualified) ?? 0;
	const valid = contract?.representationId === 'semantic_768'
		&& asNumber(contract?.dimensions) === 768
		&& contract?.canonicalAuthority === 'postgres'
		&& candidates > 0
		&& qualified === candidates
		&& asNumber(counts?.missingChunkRows) === 0
		&& asNumber(counts?.ambiguousChunkRows) === 0;
	const evidence: TournamentGateEvidenceV1[] = valid ? [
		{ gateId: 'semantic_768', state: 'PARTIAL', completion: cohortCompletion(qualified), receiptRef: path, observedAt: asString(record.generatedAt) ?? undefined, reason: `${qualified}/${PROMOTION_COHORT_TARGET_V1} exact lineage-qualified semantic_768 rows have vector + producer metadata.` }
	] : [];
	return { source: source(path, record, valid, evidence, valid ? [] : ['SEMANTIC_768_COHORT_VALIDATION_FAILED']), evidence };
}

function pgvectorQdrantAdapter(path: string, record: JsonRecord): ReceiptAdapterResult | null {
	if (record.schema !== 'atlas.lineage-pgvector-qdrant-parity.v1') return null;
	const counts = asRecord(record.counts);
	const count = asNumber(counts?.candidates) ?? 0;
	const valid = record.status === 'PGVECTOR_QDRANT_EXACT_PARITY_PROVEN'
		&& count > 0
		&& asNumber(counts?.identityMatches) === count
		&& asNumber(counts?.vectorMatches) === count
		&& asNumber(counts?.scoreMatches) === count
		&& asBoolean(record.rankParity) === true;
	const evidence: TournamentGateEvidenceV1[] = valid ? [
		{ gateId: 'qdrant_revisioned_fanout', state: 'PARTIAL', completion: cohortCompletion(count), receiptRef: path, observedAt: asString(record.generatedAt) ?? undefined, reason: `${count}/${PROMOTION_COHORT_TARGET_V1} candidates have exact PostgreSQL↔Qdrant identity/vector/score parity; broad fan-out remains a later gate.` }
	] : [];
	return { source: source(path, record, valid, evidence, valid ? [] : ['PGVECTOR_QDRANT_PARITY_VALIDATION_FAILED']), evidence };
}

function qdrantCanaryAdapter(path: string, record: JsonRecord): ReceiptAdapterResult | null {
	if (record.schema !== 'atlas.lineage-qdrant-semantic-canary.v1') return null;
	const count = asNumber(record.candidateCount) ?? 0;
	const exact = asNumber(record.exactMatches) ?? 0;
	const valid = record.status === 'CANARY_QDRANT_IDENTITY_PROVEN'
		&& asBoolean(record.promotionEligible) === true
		&& count > 0
		&& exact === count
		&& Array.isArray(record.mismatches) && record.mismatches.length === 0
		&& Array.isArray(record.missingPacketKeys) && record.missingPacketKeys.length === 0;
	const evidence: TournamentGateEvidenceV1[] = valid ? [
		{ gateId: 'qdrant_revisioned_fanout', state: 'PARTIAL', completion: cohortCompletion(count), receiptRef: path, reason: `${count}/${PROMOTION_COHORT_TARGET_V1} Qdrant points preserve packet/source/workspace/representation lineage.` }
	] : [];
	return { source: source(path, record, valid, evidence, valid ? [] : ['QDRANT_CANARY_VALIDATION_FAILED']), evidence };
}

function goRetrievalAdapter(path: string, record: JsonRecord): ReceiptAdapterResult | null {
	if (record.schema !== 'atlas.go-retrieval-chunk-stream-replay.v1') return null;
	const observed = asRecord(record.observed);
	const contract = asRecord(record.contract);
	const authority = asRecord(record.authority);
	const events = asNumber(observed?.chunkEvents) ?? 0;
	const valid = record.status === 'LIVE_PACKET_FILTERED_LINEAGE_PROVEN'
		&& events > 0
		&& asNumber(observed?.packetKeyPresent) === events
		&& asNumber(observed?.sourceRefPresent) === events
		&& asNumber(observed?.workspaceRevisionPresent) === events
		&& asNumber(observed?.sourceRevisionPresent) === events
		&& asNumber(observed?.representationRevisionPresent) === events
		&& asBoolean(contract?.liveRevisionQualifiedStream) === true
		&& asNumber(authority?.canonicalWrites) === 0;
	const evidence: TournamentGateEvidenceV1[] = valid ? [
		{ gateId: 'go_retrieval_indexed_readback', state: 'PROVEN', receiptRef: path, observedAt: asString(record.generatedAt) ?? undefined, reason: `${events} live packet-filtered chunk events preserved packet/source/workspace/source/representation lineage with zero canonical writes.` }
	] : [];
	return { source: source(path, record, valid, evidence, valid ? [] : ['GO_RETRIEVAL_STREAM_VALIDATION_FAILED']), evidence };
}

function shortlistAdapter(path: string, record: JsonRecord): ReceiptAdapterResult | null {
	if (record.schema !== 'atlas.candidate-shortlist-receipt.v1') return null;
	const lowRank = asRecord(record.lowRank);
	const valid = lowRank?.policy === 'TANG_INSPIRED_LOW_RANK_SHORTLIST'
		&& asNumber(record.inputCount) === 512
		&& asNumber(record.targetCount) === 96
		&& asString(lowRank?.output_checksum) !== null;
	const state: TournamentGateState = record.status === 'PROVEN' || record.status === 'DONE' ? 'PROVEN' : 'CREATED';
	const evidence: TournamentGateEvidenceV1[] = valid ? [
		{ gateId: 'svd_pca_reference', state, receiptRef: path, observedAt: asString(record.generatedAt) ?? undefined, reason: state === 'PROVEN' ? 'Low-rank shortlist passed an explicit promotion proof.' : 'Low-rank shortlist executed, but its receipt is not promotion-proven.' },
		{ gateId: 'ewin_tang_nomination', state, receiptRef: path, observedAt: asString(record.generatedAt) ?? undefined, reason: state === 'PROVEN' ? 'Tang-inspired nomination passed an explicit promotion proof.' : 'Tang-inspired nomination artifact exists, but the current receipt is EXECUTED_UNPROVEN.' }
	] : [];
	return { source: source(path, record, valid, evidence, valid ? [] : ['LOW_RANK_SHORTLIST_VALIDATION_FAILED']), evidence };
}

function normalizedGateReceiptAdapter(path: string, record: JsonRecord): ReceiptAdapterResult | null {
	if (record.schema !== 'atlas.tournament-gate-receipts.v1') return null;
	const rows = Array.isArray(record.gates) ? record.gates : [];
	const diagnostics: string[] = [];
	const evidence: TournamentGateEvidenceV1[] = [];
	for (const row of rows) {
		const item = asRecord(row);
		const gateId = asString(item?.gateId) as TournamentGateId | null;
		const state = asString(item?.state) as TournamentGateState | null;
		if (!gateId || !GATE_IDS.has(gateId) || !state || !STATES.has(state)) {
			diagnostics.push('INVALID_NORMALIZED_GATE_RECEIPT_ROW');
			continue;
		}
		const completion = asNumber(item?.completion);
		const filesEdited = Array.isArray(item?.filesEdited) ? item.filesEdited.filter((value): value is string => typeof value === 'string') : undefined;
		const openspecTaskIds = Array.isArray(item?.openspecTaskIds) ? item.openspecTaskIds.filter((value): value is string => typeof value === 'string') : undefined;
		evidence.push({
			gateId,
			state,
			completion: completion === null ? undefined : Math.max(0, Math.min(1, completion)),
			receiptRef: asString(item?.receiptRef) ?? path,
			observedAt: asString(item?.observedAt) ?? asString(record.generatedAt) ?? undefined,
			reason: asString(item?.reason) ?? 'Normalized tournament gate receipt.',
			filesEdited,
			openspecChange: asString(item?.openspecChange) ?? undefined,
			openspecTaskIds
		});
	}
	return { source: source(path, record, evidence.length > 0 && diagnostics.length === 0, evidence, diagnostics), evidence };
}

function efficiencyAdapter(path: string, record: JsonRecord): ReceiptAdapterResult | null {
	if (record.schema !== 'atlas.tournament-efficiency.v1') return null;
	const raw = asRecord(record.efficiency) ?? record;
	const keys: Array<keyof TournamentRunEfficiencyV1> = [
		'agentTurns', 'inputTokens', 'outputTokens', 'baselineInputTokens', 'baselineOutputTokens',
		'kvCacheReadTokens', 'kvCacheWriteTokens', 'prefillTokensAvoided', 'wallTimeMs', 'baselineWallTimeMs',
		'filesEdited', 'filesReused', 'valkeyHits', 'valkeyMisses', 'bitfrostHits', 'bitfrostMisses'
	];
	const efficiency: TournamentRunEfficiencyV1 = {};
	for (const key of keys) {
		const value = asNumber(raw[key]);
		if (value !== null && value >= 0) efficiency[key] = value;
	}
	return { source: source(path, record, true, [], []), evidence: [], efficiency };
}

function adaptReceipt(path: string, record: JsonRecord): ReceiptAdapterResult {
	const adapters = [
		structuralAdapter,
		candidateMapAdapter,
		semanticAdapter,
		pgvectorQdrantAdapter,
		qdrantCanaryAdapter,
		goRetrievalAdapter,
		shortlistAdapter,
		normalizedGateReceiptAdapter,
		efficiencyAdapter
	];
	for (const adapter of adapters) {
		const result = adapter(path, record);
		if (result) return result;
	}
	return { source: source(path, record, false, [], ['UNSUPPORTED_RECEIPT_SCHEMA']), evidence: [] };
}

function stateScore(state: TournamentGateState): number {
	switch (state) {
		case 'DONE': return 6;
		case 'PROVEN': return 5;
		case 'PARTIAL': return 4;
		case 'WIRED': return 3;
		case 'CREATED': return 2;
		case 'UNPROVEN': return 1;
		case 'BLOCKED': return 0;
	}
}

function mergeEvidence(base: TournamentGateV1, candidates: TournamentGateEvidenceV1[]): TournamentGateV1 {
	if (candidates.length === 0) return base;
	const ordered = [...candidates].sort((a, b) => {
		const timeA = a.observedAt ? Date.parse(a.observedAt) : Number.NaN;
		const timeB = b.observedAt ? Date.parse(b.observedAt) : Number.NaN;
		if (Number.isFinite(timeA) && Number.isFinite(timeB) && timeA !== timeB) return timeB - timeA;
		return stateScore(b.state) - stateScore(a.state);
	});
	const selected = ordered[0];
	return {
		...base,
		state: selected.state,
		completion: selected.completion,
		receiptRef: selected.receiptRef,
		filesEdited: selected.filesEdited
	};
}

export function aggregateParentAtlasTournamentReceiptsV1(
	results: ReceiptAdapterResult[],
	overrideEfficiency: TournamentRunEfficiencyV1 = {}
): ParentAtlasTournamentSnapshotV1 {
	const allEvidence = results.flatMap((result) => result.evidence);
	const receiptEfficiency = results.reduce<TournamentRunEfficiencyV1>((acc, result) => ({ ...acc, ...(result.efficiency ?? {}) }), {});
	const efficiency = { ...receiptEfficiency, ...overrideEfficiency };
	const gates: TournamentGateV1[] = PARENT_ATLAS_TOURNAMENT_GATES_V1.map((gate) => mergeEvidence(
		{ ...gate, state: 'UNPROVEN' },
		allEvidence.filter((item) => item.gateId === gate.id)
	));
	return {
		schema: 'atlas.parent-tournament-snapshot.v1',
		generatedAt: new Date().toISOString(),
		promotionCohortTarget: PROMOTION_COHORT_TARGET_V1,
		progress: calculateTournamentProgressV1(gates, efficiency),
		gates,
		sources: results.map((result) => result.source),
		diagnostics: results.flatMap((result) => result.source.diagnostics.map((message) => `${result.source.path}:${message}`))
	};
}

async function readJson(path: string): Promise<{ record: JsonRecord | null; error: string | null }> {
	try {
		const raw = await readFile(path, 'utf8');
		const parsed = JSON.parse(raw) as unknown;
		return { record: asRecord(parsed), error: asRecord(parsed) ? null : 'JSON_ROOT_MUST_BE_OBJECT' };
	} catch (error) {
		const code = asRecord(error)?.code;
		if (code === 'ENOENT') return { record: null, error: null };
		return { record: null, error: error instanceof Error ? error.message : String(error) };
	}
}

export async function loadParentAtlasTournamentSnapshotV1(
	repoRoot: string,
	efficiency: TournamentRunEfficiencyV1 = {}
): Promise<ParentAtlasTournamentSnapshotV1> {
	const results: ReceiptAdapterResult[] = [];
	for (const relativePath of REPORT_PATHS) {
		const absolutePath = resolve(repoRoot, relativePath);
		const { record, error } = await readJson(absolutePath);
		if (error) {
			results.push({
				source: { path: relativePath, schema: null, status: null, accepted: false, gateIds: [], diagnostics: [`READ_FAILED:${error}`] },
				evidence: []
			});
			continue;
		}
		if (!record) continue;
		results.push(adaptReceipt(relativePath, record));
	}
	return aggregateParentAtlasTournamentReceiptsV1(results, efficiency);
}

export const PARENT_ATLAS_TOURNAMENT_REPORT_PATHS_V1 = REPORT_PATHS;
