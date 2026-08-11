import { createHash } from 'node:crypto';

import {
	bigserial,
	index,
	integer,
	jsonb,
	pgTable,
	real,
	text,
	timestamp,
} from 'drizzle-orm/pg-core';

/**
 * Durable analysis pass ledger.
 *
 * This stores completed analysis pass results with explicit source / revision
 * identity and an idempotency key so rerunning the same pass input is a no-op.
 * It is deliberately pass-specific instead of reusing the generic execution
 * journal so the worker can answer "what pass wrote this result?" directly.
 */
export const analysisPassResults = pgTable(
	'analysis_pass_results',
	{
		id: bigserial('id', { mode: 'number' }).primaryKey(),

		passKey: text('pass_key').notNull(),
		// Logical pass identity — packetKey+sourceRevision+passName+passRevision+
		// inputHash ONLY, deliberately excludes analysisJobId/evidenceId (unlike
		// passKey, which is a per-job execution key). Query THIS for "has this
		// logical pass already been computed", not passKey — passKey structurally
		// cannot answer that question since two different jobs computing the same
		// logical pass get different passKey values. See PF4C in
		// openspec/changes/parent-atlas-pass-fabric/tasks.md.
		passIdentityHash: text('pass_identity_hash'),
		packetKey: text('packet_key').notNull(),
		sourceRef: text('source_ref'),
		featureId: text('feature_id'),
		passType: text('pass_type').notNull(),
		status: text('status').notNull(),
		inputHash: text('input_hash'),
		promptHash: text('prompt_hash'),
		modelName: text('model_name'),
		temperature: real('temperature'),
		maxTokens: integer('max_tokens'),
		output: jsonb('output').default({}).notNull(),
		scores: jsonb('scores').default({}).notNull(),
		indexPush: jsonb('index_push').default({}).notNull(),
		provenance: jsonb('provenance').default({}).notNull(),
		sourceRevision: text('source_revision'),
		passRevision: text('pass_revision'),
		createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).defaultNow(),
		updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' }).defaultNow(),
	},
	(table) => ({
		passKeyIdx: index('analysis_pass_results_pass_key_idx').on(table.passKey),
		passIdentityHashIdx: index('analysis_pass_results_pass_identity_hash_idx').on(
			table.passIdentityHash
		),
		packetIdx: index('analysis_pass_results_packet_idx').on(table.packetKey),
		sourceIdx: index('analysis_pass_results_source_idx').on(table.sourceRef, table.sourceRevision),
		passTypeIdx: index('analysis_pass_results_pass_type_idx').on(table.passType),
		statusIdx: index('analysis_pass_results_status_idx').on(table.status),
		createdIdx: index('analysis_pass_results_created_idx').on(table.createdAt),
	})
);

export type AnalysisPassResultRow = typeof analysisPassResults.$inferSelect;
export type NewAnalysisPassResultRow = typeof analysisPassResults.$inferInsert;

export type AnalysisPassPayload = Record<string, unknown>;
export type AnalysisPassEvidence = Array<Record<string, unknown>>;

export interface AnalysisPassLedgerInput {
	analysisJobId: string;
	evidenceId: string;
	caseId?: string | null;
	jobType: string;
	passKey?: string | null;
	packetKey?: string | null;
	sourceRef?: string | null;
	sourceRevision?: string | null;
	workspaceRevision?: string | null;
	representationRevision?: string | null;
	family: string;
	passName: string;
	passRevision: string;
	passType?: string | null;
	featureId?: string | null;
	promptHash?: string | null;
	modelName?: string | null;
	temperature?: number | null;
	maxTokens?: number | null;
	producerId?: string;
	producerRevision?: string;
	backend: string;
	backendVersion: string;
	device: 'cpu' | 'cuda' | 'external';
	inputHash?: string | null;
	outputHash?: string | null;
	status: 'succeeded' | 'skipped' | 'failed';
	startedAt: string;
	completedAt: string;
	durationMs?: number | null;
	payload?: AnalysisPassPayload;
	features?: Record<string, unknown>;
	indexPush?: Record<string, unknown>;
	artifacts?: Record<string, unknown>;
	evidence?: AnalysisPassEvidence;
	warnings?: string[];
	modelId?: string | null;
	modelRevision?: string | null;
}

export interface AnalysisPassPersistResult {
	inserted: boolean;
	idempotencyKey: string;
	row: AnalysisPassResultRow;
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
		passKey: input.passKey ?? null,
		packetKey: input.packetKey ?? null,
		sourceRef: input.sourceRef ?? input.packetKey ?? input.evidenceId,
		sourceRevision: input.sourceRevision ?? null,
		workspaceRevision: input.workspaceRevision ?? null,
		representationRevision: input.representationRevision ?? null,
		family: input.family,
		passName: input.passName,
		passRevision: input.passRevision,
		passType: input.passType ?? input.passName ?? input.family,
		featureId: input.featureId ?? null,
		promptHash: input.promptHash ?? null,
		modelName: input.modelName ?? null,
		temperature: input.temperature ?? null,
		maxTokens: input.maxTokens ?? null,
		producerId: input.producerId ?? 'parent-atlas-analysis-worker',
		producerRevision: input.producerRevision ?? 'analysis-worker-v1',
		backend: input.backend,
		backendVersion: input.backendVersion,
		device: input.device,
	};

	return sha256Hex(stableStringify(canonical));
}

export function buildAnalysisPassOutputHash(payload: AnalysisPassPayload | undefined): string {
	return sha256Hex(stableStringify(payload ?? {}));
}

/**
 * Logical pass identity — deliberately excludes analysisJobId/evidenceId,
 * unlike buildAnalysisPassInputHash() (which is a per-JOB execution key).
 *
 * Query THIS hash to answer "has this logical pass (this packet, at this
 * source revision, for this pass name/revision, given this input) already
 * been computed" — the property PF9 (incremental eligibility) needs.
 * passKey/buildAnalysisPassInputHash cannot answer that question: two
 * different jobs computing the identical logical pass get different
 * passKey values because job/evidence identity is baked into that hash.
 *
 * See PF4C in openspec/changes/parent-atlas-pass-fabric/tasks.md for the
 * full reasoning — this was found by reading buildAnalysisPassInputHash's
 * exact field list, not assumed.
 */
export function buildAnalysisPassIdentityHash(input: AnalysisPassLedgerInput): string {
	const canonical = {
		packetKey: input.packetKey ?? null,
		sourceRevision: input.sourceRevision ?? null,
		passName: input.passName,
		passRevision: input.passRevision,
		inputHash: input.inputHash ?? buildAnalysisPassInputHash(input),
	};

	return sha256Hex(stableStringify(canonical));
}

/**
 * Governs whether a new PassExecution should be short-circuited when a
 * prior execution already exists for the same passIdentityHash.
 *
 * - deterministic_idempotent: same identity → same output expected → reuse
 *   the existing receipt, do not re-execute (e.g. ast_symbols, pos_tagging)
 * - stochastic_history: same identity → NEW execution is legitimate and
 *   expected to differ (e.g. summarization — confirmed this session: 5
 *   distinct outputs from identical input, all real, none are bugs)
 * - observed_event: dedupe only by an explicit event/execution identity,
 *   never by pass identity alone (e.g. tool_execution — every invocation
 *   is a distinct observed event even with identical arguments)
 */
export type PassExecutionSemantics = 'deterministic_idempotent' | 'stochastic_history' | 'observed_event';

/**
 * Minimal known-pass registry. Extend as new pass families are wired.
 * Unlisted pass names default to 'observed_event' (the safest default —
 * never silently short-circuits a real execution) via
 * resolveExecutionSemantics() below, so this registry only needs entries
 * where the safe default is wrong.
 */
export const KNOWN_PASS_EXECUTION_SEMANTICS: Record<string, PassExecutionSemantics> = {
	ast_symbols: 'deterministic_idempotent',
	pos_tagging: 'deterministic_idempotent',
	'pos-concept-tagging-lane.v1': 'deterministic_idempotent',
	summarization: 'stochastic_history',
	entity_extraction: 'stochastic_history',
	forensics: 'stochastic_history',
	tool_execution: 'observed_event',
};

export function resolveExecutionSemantics(passName: string): PassExecutionSemantics {
	return KNOWN_PASS_EXECUTION_SEMANTICS[passName] ?? 'observed_event';
}

export function buildAnalysisPassIdempotencyKey(input: AnalysisPassLedgerInput): string {
	return `analysis-pass:${buildAnalysisPassInputHash(input)}`;
}

export function normalizeAnalysisPassLedgerInput(input: AnalysisPassLedgerInput): NewAnalysisPassResultRow {
	const passKey = (input.passKey ?? buildAnalysisPassIdempotencyKey(input)).trim();
	const inputHash = input.inputHash?.trim() || buildAnalysisPassInputHash(input);
	const passIdentityHash = buildAnalysisPassIdentityHash({ ...input, inputHash });
	const promptHash = input.promptHash?.trim() || null;
	const passType = (input.passType ?? input.passName ?? input.family).trim();
	const payload = input.payload ?? {};
	const features = input.features ?? {};
	const indexPush = input.indexPush ?? input.artifacts ?? {};
	const artifacts = input.artifacts ?? {};
	const evidence = input.evidence ?? [];
	const warnings = input.warnings ?? [];
	const output = payload;
	const scores = features;
	const provenance = {
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
		passType,
		producerId: input.producerId ?? 'parent-atlas-analysis-worker',
		producerRevision: input.producerRevision ?? 'analysis-worker-v1',
		backend: input.backend,
		backendVersion: input.backendVersion,
		device: input.device,
		durationMs: input.durationMs ?? null,
		startedAt: input.startedAt,
		completedAt: input.completedAt,
		warnings,
		modelId: input.modelId ?? null,
		modelRevision: input.modelRevision ?? null,
		artifacts,
		evidence,
	};

	return {
		passKey,
		passIdentityHash,
		packetKey: (input.packetKey ?? input.evidenceId).trim(),
		sourceRef: input.sourceRef?.trim() ?? null,
		featureId: input.featureId?.trim() ?? null,
		passType,
		status: input.status,
		inputHash,
		promptHash,
		modelName: input.modelName?.trim() ?? null,
		temperature: input.temperature ?? null,
		maxTokens: input.maxTokens ?? null,
		output,
		scores,
		indexPush,
		provenance,
		sourceRevision: input.sourceRevision ?? null,
		passRevision: input.passRevision,
		createdAt: input.completedAt,
		updatedAt: input.completedAt,
	};
}
