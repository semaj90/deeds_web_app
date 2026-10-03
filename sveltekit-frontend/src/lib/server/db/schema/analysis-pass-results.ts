import { createHash } from 'node:crypto';
import { PACKET_KEY_ALIAS_EVIDENCE_VERSION } from '../../atlas/identity/packet-key-resolution-v2.js';
import type { PacketKeyResolutionV2 } from '../../atlas/identity/packet-key-resolution-v2.js';
import { PACKET_KEY_V2_PATTERN } from '../../atlas/identity/packet-key-v2.js';

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

export type AnalysisPassAdmissionStateV1 = 'OBSERVATION_ONLY' | 'ELIGIBLE_FOR_REVIEW' | 'ADMITTED' | 'REJECTED';
export type AnalysisPassAdmissionReasonV1 =
	| 'QUALIFIED'
	| 'MISSING_PACKET_KEY'
	| 'MISSING_PASS_EXECUTION_ID'
	| 'MISSING_SOURCE_REF'
	| 'MISSING_SOURCE_REVISION'
	| 'MISSING_WORKSPACE_REVISION'
	| 'MISSING_PRODUCER_REVISION'
	| 'MISSING_INPUT_CHECKSUM'
	| 'MISSING_OUTPUT_CHECKSUM'
	| 'EXECUTION_NOT_SUCCEEDED'
	| 'EVIDENCE_NOT_GROUNDED'
	| 'INVALID_PACKET_KEY'
	| 'IDENTITY_FALLBACK_FORBIDDEN';

export interface AnalysisPassAdmissionEnvelopeV1 {
	schema: 'atlas.analysis-pass-admission.v1';
	passExecutionId: string;
	passType: string;
	packetKey: string | null;
	sourceRef: string | null;
	sourceRevision: string | null;
	workspaceRevision: string | null;
	producerRevision: string | null;
	inputChecksum: string | null;
	outputChecksum: string | null;
	executionStatus: 'SUCCEEDED' | 'FAILED' | 'SKIPPED';
	admissionState: AnalysisPassAdmissionStateV1;
	reasons: AnalysisPassAdmissionReasonV1[];
	lineageQualified: boolean;
	evidenceQualified: boolean;
	canonicalAuthority: false;
	persistenceAuthorized: false;
	checksum: string;
}

export interface AnalysisPassAdmissionOptionsV1 {
	packetIdentityResolution?: PacketKeyResolutionV2;
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

function isGroundedAnalysisPassEvidence(
	evidence: AnalysisPassEvidence | undefined,
	sourceRef: string | null,
	sourceRevision: string | null,
): boolean {
	return Boolean(
		evidence?.length && sourceRef && sourceRevision && evidence.every((span) =>
			typeof span.sourceRef === 'string'
			&& span.sourceRef.trim() === sourceRef
			&& typeof span.sourceRevision === 'string'
			&& span.sourceRevision.trim() === sourceRevision
			&& typeof span.startByte === 'number'
			&& Number.isInteger(span.startByte)
			&& span.startByte >= 0
			&& typeof span.endByte === 'number'
			&& Number.isInteger(span.endByte)
			&& span.endByte > span.startByte
			&& typeof span.excerpt === 'string'
			&& span.excerpt.length > 0
		),
	);
}

export function classifyAnalysisPassAdmissionV1(
	input: AnalysisPassLedgerInput,
	options: AnalysisPassAdmissionOptionsV1 = {},
): AnalysisPassAdmissionEnvelopeV1 {
	const packetKey = input.packetKey?.trim() || null;
	const sourceRef = input.sourceRef?.trim() || null;
	const sourceRevision = input.sourceRevision?.trim() || null;
	const workspaceRevision = input.workspaceRevision?.trim() || null;
	const producerRevision = input.producerRevision?.trim() || null;
	const inputChecksum = input.inputHash?.trim() || null;
	const outputChecksum = input.outputHash?.trim() || null;
	const executionStatus = input.status === 'succeeded' ? 'SUCCEEDED'
		: input.status === 'failed' ? 'FAILED' : 'SKIPPED';
	const passExecutionId = input.analysisJobId.trim();
	const packetResolution = options.packetIdentityResolution;
	const packetResolutionMatchesInput = Boolean(
		packetResolution
		&& packetKey
		&& (packetKey === packetResolution.canonicalPacketKey || packetKey === packetResolution.storagePacketKey)
		&& PACKET_KEY_V2_PATTERN.test(packetResolution.canonicalPacketKey)
		&& packetResolution.storagePacketKey.trim().length > 0
		&& (packetResolution.resolutionSource === 'V2_DIRECT'
			? packetResolution.storagePacketKey === packetResolution.canonicalPacketKey
				&& packetResolution.aliasEvidenceVersion === null
			: packetResolution.aliasEvidenceVersion === PACKET_KEY_ALIAS_EVIDENCE_VERSION),
	);
	const canonicalPacketKey = packetResolutionMatchesInput ? packetResolution!.canonicalPacketKey : packetKey;
	const lineageQualified = Boolean(
		canonicalPacketKey && packetResolutionMatchesInput && sourceRef && sourceRevision && workspaceRevision,
	);
	const evidenceQualified = isGroundedAnalysisPassEvidence(input.evidence, sourceRef, sourceRevision);
	const reasons: AnalysisPassAdmissionReasonV1[] = [];

	if (executionStatus !== 'SUCCEEDED') reasons.push('EXECUTION_NOT_SUCCEEDED');
	if (!passExecutionId) reasons.push('MISSING_PASS_EXECUTION_ID');
	if (!packetKey) reasons.push('MISSING_PACKET_KEY');
	else if (!PACKET_KEY_V2_PATTERN.test(packetResolution?.canonicalPacketKey ?? packetKey)) reasons.push('INVALID_PACKET_KEY');
	else if (!packetResolutionMatchesInput) reasons.push('IDENTITY_FALLBACK_FORBIDDEN');
	if (!sourceRef) reasons.push('MISSING_SOURCE_REF');
	if (!sourceRevision) reasons.push('MISSING_SOURCE_REVISION');
	if (!workspaceRevision) reasons.push('MISSING_WORKSPACE_REVISION');
	if (!producerRevision) reasons.push('MISSING_PRODUCER_REVISION');
	if (!inputChecksum) reasons.push('MISSING_INPUT_CHECKSUM');
	if (!outputChecksum) reasons.push('MISSING_OUTPUT_CHECKSUM');
	if (!evidenceQualified) reasons.push('EVIDENCE_NOT_GROUNDED');
	if (reasons.length === 0) reasons.push('QUALIFIED');

	const admissionState: AnalysisPassAdmissionStateV1 = executionStatus !== 'SUCCEEDED'
		? 'REJECTED'
		: reasons.length === 1 && reasons[0] === 'QUALIFIED'
			? 'ELIGIBLE_FOR_REVIEW'
			: 'OBSERVATION_ONLY';
	const unsigned = {
		schema: 'atlas.analysis-pass-admission.v1' as const,
		passExecutionId,
		passType: (input.passType ?? input.passName).trim(),
		packetKey: canonicalPacketKey,
		sourceRef,
		sourceRevision,
		workspaceRevision,
		producerRevision,
		inputChecksum,
		outputChecksum,
		executionStatus,
		admissionState,
		reasons,
		lineageQualified,
		evidenceQualified,
		canonicalAuthority: false as const,
		persistenceAuthorized: false as const,
	};
	return { ...unsigned, checksum: sha256Hex(stableStringify(unsigned)) };
}

export function verifyAnalysisPassAdmissionEnvelopeV1(envelope: AnalysisPassAdmissionEnvelopeV1): boolean {
	const { checksum, ...unsigned } = envelope;
	return Boolean(checksum && checksum === sha256Hex(stableStringify(unsigned))
		&& envelope.canonicalAuthority === false
		&& envelope.persistenceAuthorized === false
		&& envelope.admissionState !== 'ADMITTED');
}

export type NlpCohortRevisionStateV1 = 'REVISION_QUALIFIED' | 'REVISION_PARTIAL';

export interface NlpStagingCohortPacketRefV1 {
	packetKey: string;
	storagePacketKey: string;
	sourceRef: string;
	sourceRevision: string | null;
	revisionState: NlpCohortRevisionStateV1;
}

export interface NlpStagingCohortV1 {
	schema: 'atlas.nlp-staging-cohort.v1';
	cohortId: string;
	workspaceRevision: string;
	packetRefs: NlpStagingCohortPacketRefV1[];
	selectionPolicyRevision: string;
	cohortChecksum: string;
}

export interface NlpStagingCohortCandidateV1 {
	packetKey: string;
	sourceRef: string | null;
	sourceRevision: string | null;
	workspaceRevision: string;
	packetIdentityResolution: PacketKeyResolutionV2;
}

export interface BuildNlpStagingCohortInputV1 {
	cohortId: string;
	workspaceRevision: string;
	selectionPolicyRevision: string;
	candidates: NlpStagingCohortCandidateV1[];
}

const NLPCOHORT_ALLOWED_SIZES = new Set([8, 16, 32]);

function normalizeCohortSourceRef(sourceRef: string): string {
	return sourceRef.trim().replaceAll('\\', '/');
}

export function buildNlpStagingCohortV1(input: BuildNlpStagingCohortInputV1): NlpStagingCohortV1 {
	const cohortId = input.cohortId.trim();
	const workspaceRevision = input.workspaceRevision.trim();
	const selectionPolicyRevision = input.selectionPolicyRevision.trim();
	if (!cohortId || !workspaceRevision || !selectionPolicyRevision) {
		throw new Error('NLP_STAGING_COHORT_IDENTITY_REQUIRED');
	}
	if (!NLPCOHORT_ALLOWED_SIZES.has(input.candidates.length)) {
		throw new Error('NLP_STAGING_COHORT_SIZE_MUST_BE_8_16_OR_32');
	}

	const seenPacketKeys = new Set<string>();
	const seenSources = new Set<string>();
	const packetRefs = input.candidates.map((candidate): NlpStagingCohortPacketRefV1 => {
		const suppliedPacketKey = candidate.packetKey.trim();
		const sourceRef = candidate.sourceRef ? normalizeCohortSourceRef(candidate.sourceRef) : '';
		const sourceRevision = candidate.sourceRevision?.trim() || null;
		const memberWorkspaceRevision = candidate.workspaceRevision.trim();
		const resolution = candidate.packetIdentityResolution;
		const resolutionMatches = Boolean(
			resolution
			&& suppliedPacketKey
			&& (suppliedPacketKey === resolution.canonicalPacketKey || suppliedPacketKey === resolution.storagePacketKey)
			&& PACKET_KEY_V2_PATTERN.test(resolution.canonicalPacketKey)
			&& resolution.storagePacketKey.trim()
			&& (resolution.resolutionSource === 'V2_DIRECT'
				? resolution.storagePacketKey === resolution.canonicalPacketKey && resolution.aliasEvidenceVersion === null
				: resolution.aliasEvidenceVersion === PACKET_KEY_ALIAS_EVIDENCE_VERSION),
		);
		if (!resolutionMatches) throw new Error('NLP_STAGING_COHORT_PACKET_IDENTITY_UNRESOLVED');
		if (memberWorkspaceRevision !== workspaceRevision) {
			throw new Error('NLP_STAGING_COHORT_WORKSPACE_REVISION_MISMATCH');
		}
		if (!sourceRef) throw new Error('NLP_STAGING_COHORT_SOURCE_REF_REQUIRED');
		if (seenPacketKeys.has(resolution.canonicalPacketKey)) {
			throw new Error('NLP_STAGING_COHORT_DUPLICATE_PACKET_IDENTITY');
		}
		const sourceKey = normalizeCohortSourceRef(sourceRef);
		if (seenSources.has(sourceKey)) throw new Error('NLP_STAGING_COHORT_DUPLICATE_LOGICAL_SOURCE');
		seenPacketKeys.add(resolution.canonicalPacketKey);
		seenSources.add(sourceKey);
		return {
			packetKey: resolution.canonicalPacketKey,
			storagePacketKey: resolution.storagePacketKey,
			sourceRef,
			sourceRevision,
			revisionState: sourceRevision ? 'REVISION_QUALIFIED' : 'REVISION_PARTIAL',
		};
	}).sort((left, right) => left.packetKey.localeCompare(right.packetKey));

	const unsigned = {
		schema: 'atlas.nlp-staging-cohort.v1' as const,
		cohortId,
		workspaceRevision,
		packetRefs,
		selectionPolicyRevision,
	};
	return { ...unsigned, cohortChecksum: sha256Hex(stableStringify(unsigned)) };
}

export function verifyNlpStagingCohortV1(cohort: NlpStagingCohortV1): boolean {
	const { cohortChecksum, ...unsigned } = cohort;
	if (!cohortChecksum || cohort.schema !== 'atlas.nlp-staging-cohort.v1'
		|| !NLPCOHORT_ALLOWED_SIZES.has(cohort.packetRefs.length)) return false;
	const packetKeys = cohort.packetRefs.map((ref) => ref.packetKey);
	const sourceRefs = cohort.packetRefs.map((ref) => normalizeCohortSourceRef(ref.sourceRef));
	if (new Set(packetKeys).size !== packetKeys.length || new Set(sourceRefs).size !== sourceRefs.length) return false;
	if (cohort.packetRefs.some((ref) => !PACKET_KEY_V2_PATTERN.test(ref.packetKey)
		|| !ref.storagePacketKey.trim()
		|| !ref.sourceRef.trim()
		|| (ref.sourceRevision === null ? ref.revisionState !== 'REVISION_PARTIAL' : ref.revisionState !== 'REVISION_QUALIFIED'))) return false;
	return cohortChecksum === sha256Hex(stableStringify(unsigned));
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

export interface StagedAnalysisPassObservationV1 {
	schema: 'atlas.staged-analysis-pass-observation.v1';
	packetKey: string;
	resolvedStoragePacketKey: string;
	packetIdentityResolution: 'DIRECT_STORAGE_ROW' | 'EXISTING_ALIAS';
	suppliedPacketKey: string;
	sourceRef: string | null;
	sourceRevision: string | null;
	workspaceRevision: string | null;
	passName: string;
	passRevision: string;
	producerId: string;
	producerRevision: string;
	executionStatus: 'succeeded';
	admissionDisposition: 'CANDIDATE_ONLY';
	declaredInputHash: string | null;
	ledgerInputChecksum: string;
	outputChecksum: string;
	canonicalAuthority: false;
	writesCanonicalState: false;
}

export interface StagedPacketIdentityV1 {
	suppliedPacketKey: string;
	resolvedStoragePacketKey: string;
}

export function buildStagedAnalysisPassInputChecksumV1(
	input: AnalysisPassLedgerInput,
	packetIdentity: StagedPacketIdentityV1,
): string {
	return sha256Hex(stableStringify({
		schema: 'atlas.staged-analysis-pass-input.v1',
		packetKey: packetIdentity.resolvedStoragePacketKey.trim(),
		suppliedPacketKey: packetIdentity.suppliedPacketKey.trim(),
		sourceRef: input.sourceRef?.trim() || null,
		sourceRevision: input.sourceRevision?.trim() || null,
		workspaceRevision: input.workspaceRevision?.trim() || null,
		passName: input.passName.trim(),
		passRevision: input.passRevision.trim(),
		producerId: input.producerId?.trim() || null,
		producerRevision: input.producerRevision?.trim() || null,
		backend: input.backend,
		backendVersion: input.backendVersion,
		device: input.device,
		declaredInputHash: input.inputHash?.trim() || null,
	}));
}

export function buildStagedAnalysisPassObservationV1(
	input: AnalysisPassLedgerInput,
	packetIdentity: StagedPacketIdentityV1,
): StagedAnalysisPassObservationV1 {
	const packetKey = input.packetKey?.trim();
	const passName = input.passName.trim();
	const passRevision = input.passRevision.trim();
	const producerId = input.producerId?.trim();
	const producerRevision = input.producerRevision?.trim();

	if (!packetKey) {
		throw new Error('STAGED_ANALYSIS_PASS_PACKET_KEY_REQUIRED');
	}
	if (!packetIdentity?.suppliedPacketKey?.trim() || !packetIdentity.resolvedStoragePacketKey?.trim()) {
		throw new Error('STAGED_ANALYSIS_PASS_PACKET_IDENTITY_UNRESOLVED');
	}
	if (packetKey !== packetIdentity.suppliedPacketKey.trim()) {
		throw new Error('STAGED_ANALYSIS_PASS_PACKET_IDENTITY_MISMATCH');
	}
	if (input.status !== 'succeeded') {
		throw new Error('STAGED_ANALYSIS_PASS_EXECUTION_NOT_SUCCEEDED');
	}
	if (!passName || !passRevision || !producerId || !producerRevision) {
		throw new Error('STAGED_ANALYSIS_PASS_PROVENANCE_REQUIRED');
	}

	return {
		schema: 'atlas.staged-analysis-pass-observation.v1',
		packetKey: packetIdentity.resolvedStoragePacketKey.trim(),
		resolvedStoragePacketKey: packetIdentity.resolvedStoragePacketKey.trim(),
		packetIdentityResolution: packetKey === packetIdentity.resolvedStoragePacketKey.trim()
			? 'DIRECT_STORAGE_ROW'
			: 'EXISTING_ALIAS',
		suppliedPacketKey: packetKey,
		sourceRef: input.sourceRef?.trim() || null,
		sourceRevision: input.sourceRevision?.trim() || null,
		workspaceRevision: input.workspaceRevision?.trim() || null,
		passName,
		passRevision,
		producerId,
		producerRevision,
		executionStatus: 'succeeded',
		admissionDisposition: 'CANDIDATE_ONLY',
		declaredInputHash: input.inputHash?.trim() || null,
		ledgerInputChecksum: buildStagedAnalysisPassInputChecksumV1(input, packetIdentity),
		outputChecksum: buildAnalysisPassOutputHash(input.payload),
		canonicalAuthority: false,
		writesCanonicalState: false,
	};
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
export function buildAnalysisPassIdentityHash(input: AnalysisPassLedgerInput): string | null {
	const inputHash = input.inputHash?.trim();
	if (!inputHash) return null;

	const canonical = {
		packetKey: input.packetKey ?? null,
		sourceRevision: input.sourceRevision ?? null,
		passName: input.passName,
		passRevision: input.passRevision,
		inputHash,
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
	lexical_features: 'deterministic_idempotent',
	pos_tagging: 'deterministic_idempotent',
	spacy_entities: 'deterministic_idempotent',
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
	// The stored inputHash fallback is execution-scoped. Never promote it to a
	// logical identity, because it includes analysisJobId/evidenceId.
	const passIdentityHash = buildAnalysisPassIdentityHash(input);
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

export function buildStagedAnalysisPassLedgerEntryV1(
	input: AnalysisPassLedgerInput,
	packetIdentity: StagedPacketIdentityV1,
): NewAnalysisPassResultRow {
	const resolvedInput = { ...input, packetKey: packetIdentity.resolvedStoragePacketKey };
	const stagedObservation = buildStagedAnalysisPassObservationV1(input, packetIdentity);
	const row = normalizeAnalysisPassLedgerInput(resolvedInput);
	row.provenance = {
		...(row.provenance as Record<string, unknown>),
		stagedObservation,
	};
	return row;
}
