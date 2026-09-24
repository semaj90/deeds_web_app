/**
 * VAL-10B: same-candidate persistence admission + persistence for SUMMARY analyses.
 *
 * This module has NO model, synthesis or generation dependency and cannot regenerate a summary: it consumes an already FROZEN SummaryCandidateV1 plus its
 * SummaryClaimSetV1 and SummaryEligibilityV1 and persists `candidate.summaryText` EXACTLY. Every check runs BEFORE the injected mutation boundary
 * (`insertAnalysis`); a candidate that fails any of them never reaches it.
 *
 *   generateSummaryCandidateV1 (writer script, the only model call)  ->  evaluateSummaryCandidateV1 (python spine)  ->  persistEligibleSummaryCandidatesV1 (this file)
 */
import { ExternalDocAnalysisV1Schema, externalDocAnalysisId, type ExternalDocAnalysisV1 } from './external-doc-intelligence-contracts-v1.js';
import { CHUNK_IDENTITY_VERSION_V1, SummaryEligibilityV1Schema, computeEligibilityChecksumV1, verifySummaryCandidateV1, verifySummaryClaimSetV1, type SummaryCandidateV1, type SummaryClaimSetV1, type SummaryEligibilityV1 } from './summary-candidate-v1.js';

export interface SummaryPersistencePolicyV1 {
	allowedResolverPolicyRevisions: readonly string[];
	allowedValidationContractRevisions: readonly string[];
	allowedExtractorRevisions: readonly string[];
	allowedJudgePromptRevisions: readonly string[];
	allowedIdentityVersions: readonly string[];
}

/** The revisions this writer recognizes. Anything else (an older resolver, a different validation contract, another chunk-identity scheme such as DOC-26's v2) is refused, never migrated. */
export const SUMMARY_PERSISTENCE_POLICY_V1: SummaryPersistencePolicyV1 = {
	allowedResolverPolicyRevisions: ['summary-claim-resolution:val-09-v1'],
	allowedValidationContractRevisions: ['summary-claim-validator:val-10-candidate-v1'],
	allowedExtractorRevisions: ['claims-of:sentence-regex-v1'],
	allowedJudgePromptRevisions: ['summary-claim-judge-prompt:val-07-v1'],
	allowedIdentityVersions: [CHUNK_IDENTITY_VERSION_V1]
};

export type PersistenceRefusal =
	| 'MISSING_EVIDENCE' | 'CANDIDATE_INVALID' | 'CANDIDATE_ID_MISMATCH' | 'SUMMARY_OUTPUT_CHECKSUM_MISMATCH' | 'IDENTITY_VERSION_NOT_ALLOWED'
	| 'CLAIM_SET_INVALID' | 'CLAIM_SET_CANDIDATE_MISMATCH' | 'EXTRACTOR_REVISION_STALE'
	| 'ELIGIBILITY_INVALID' | 'ELIGIBILITY_UNSEALED' | 'ELIGIBILITY_CANDIDATE_MISMATCH' | 'CLAIM_SET_CHECKSUM_MISMATCH'
	| 'RESOLVER_POLICY_STALE' | 'VALIDATION_CONTRACT_STALE' | 'JUDGE_PROMPT_STALE'
	| 'RESOLUTIONS_INCOMPLETE' | 'CLAIM_REJECT' | 'CLAIM_REVIEW' | 'CLAIM_NOT_ADMIT' | 'NOT_ELIGIBLE' | 'ELIGIBILITY_FLAG_INCONSISTENT'
	| 'STALE_CHUNK_REVISION' | 'ABOVE_LIMIT_CEILING';

export interface FrozenSummaryEvidence { candidate: unknown; claimSet: unknown; eligibility: unknown }
export type AdmissionDecision = { decision: 'MAY_PERSIST'; candidate: SummaryCandidateV1; claimSet: SummaryClaimSetV1; eligibility: SummaryEligibilityV1 }
	| { decision: 'PERSISTENCE_NOT_AUTHORIZED'; candidateId: string | null; reasons: PersistenceRefusal[] };

/** Pure admission of ONE frozen candidate. No I/O. `PERSISTENCE_NOT_AUTHORIZED` is a per-candidate refusal, never an error. */
export function admitFrozenSummaryCandidateV1(evidence: Partial<FrozenSummaryEvidence>, policy: SummaryPersistencePolicyV1): AdmissionDecision {
	const idOf = (c: unknown) => (c && typeof c === 'object' && typeof (c as { candidateId?: unknown }).candidateId === 'string' ? (c as { candidateId: string }).candidateId : null);
	if (!evidence.candidate || !evidence.claimSet || !evidence.eligibility) return { decision: 'PERSISTENCE_NOT_AUTHORIZED', candidateId: idOf(evidence.candidate), reasons: ['MISSING_EVIDENCE'] };
	const cand = verifySummaryCandidateV1(evidence.candidate);
	if (cand.ok === false) return { decision: 'PERSISTENCE_NOT_AUTHORIZED', candidateId: idOf(evidence.candidate), reasons: [cand.reason] };
	const reasons = new Set<PersistenceRefusal>();
	const candidate = cand.candidate;
	if (!policy.allowedIdentityVersions.includes(candidate.identityVersion)) reasons.add('IDENTITY_VERSION_NOT_ALLOWED');

	const cs = verifySummaryClaimSetV1(evidence.claimSet);
	if (cs.ok === false) return { decision: 'PERSISTENCE_NOT_AUTHORIZED', candidateId: candidate.candidateId, reasons: [...reasons, 'CLAIM_SET_INVALID'] };
	const claimSet = cs.claimSet;
	if (claimSet.candidateId !== candidate.candidateId) reasons.add('CLAIM_SET_CANDIDATE_MISMATCH');
	if (!policy.allowedExtractorRevisions.includes(claimSet.extractorRevision)) reasons.add('EXTRACTOR_REVISION_STALE');

	const el = SummaryEligibilityV1Schema.safeParse(evidence.eligibility);
	if (!el.success) return { decision: 'PERSISTENCE_NOT_AUTHORIZED', candidateId: candidate.candidateId, reasons: [...reasons, 'ELIGIBILITY_INVALID'] };
	const eligibility = el.data;
	const { eligibilityChecksum, ...body } = eligibility;
	if (computeEligibilityChecksumV1(body) !== eligibilityChecksum) return { decision: 'PERSISTENCE_NOT_AUTHORIZED', candidateId: candidate.candidateId, reasons: [...reasons, 'ELIGIBILITY_UNSEALED'] };
	if (eligibility.candidateId !== candidate.candidateId) reasons.add('ELIGIBILITY_CANDIDATE_MISMATCH');
	if (eligibility.claimSetChecksum !== claimSet.claimSetChecksum) reasons.add('CLAIM_SET_CHECKSUM_MISMATCH');
	if (!policy.allowedResolverPolicyRevisions.includes(eligibility.resolverPolicyRevision)) reasons.add('RESOLVER_POLICY_STALE');
	if (!policy.allowedValidationContractRevisions.includes(eligibility.validationContractRevision)) reasons.add('VALIDATION_CONTRACT_STALE');
	if (!policy.allowedJudgePromptRevisions.includes(eligibility.judgePromptRevision)) reasons.add('JUDGE_PROMPT_STALE');

	// every claim of the frozen claim set must have exactly one resolution bound to the same claim checksum
	const complete = eligibility.resolutions.length === claimSet.claimList.length
		&& claimSet.claimList.every((c, i) => { const r = eligibility.resolutions[i]; return r !== undefined && r.claimOrdinal === c.claimOrdinal && r.claimChecksum === c.claimChecksum; });
	if (!complete) reasons.add('RESOLUTIONS_INCOMPLETE');
	for (const r of eligibility.resolutions) {
		if (r.decision === 'REJECT') reasons.add('CLAIM_REJECT');
		else if (r.decision === 'REVIEW') reasons.add('CLAIM_REVIEW');
		else if (r.decision !== 'ADMIT') reasons.add('CLAIM_NOT_ADMIT');
	}
	const allAdmit = complete && eligibility.resolutions.every((r) => r.decision === 'ADMIT');
	if (eligibility.eligible !== allAdmit) reasons.add('ELIGIBILITY_FLAG_INCONSISTENT');
	if (!eligibility.eligible) reasons.add('NOT_ELIGIBLE');
	return reasons.size === 0 ? { decision: 'MAY_PERSIST', candidate, claimSet, eligibility } : { decision: 'PERSISTENCE_NOT_AUTHORIZED', candidateId: candidate.candidateId, reasons: [...reasons] };
}

/** Builds the analysis row for an admitted candidate. Pure and deterministic apart from `createdAt` (supplied by the caller). Reproduces the writer's analysis identity. */
export function buildAnalysisRowFromCandidateV1(a: Extract<AdmissionDecision, { decision: 'MAY_PERSIST' }>, createdAt: string): ExternalDocAnalysisV1 {
	const c = a.candidate;
	const base = { chunkEvidenceRevision: c.chunkEvidenceRevision, analysisType: 'SUMMARY' as const, producerId: c.producerId, producerRevision: c.producerRevision, modelId: c.modelId, modelRevision: c.modelRevision, promptRevision: c.promptRevision, inputChecksum: c.inputChecksum };
	const m = c.generationMetadata;
	return ExternalDocAnalysisV1Schema.parse({
		schema: 'atlas.external-doc-analysis.v1', analysisId: externalDocAnalysisId(base), chunkId: c.chunkId, ...base, outputChecksum: c.outputChecksum, summaryText: c.summaryText,
		metadata: { backend: m.backend, baseUrl: m.baseUrl, temperature: m.temperature, seed: m.seed, maxTokens: m.maxTokens, finishReason: m.finishReason, completionTokens: m.completionTokens, product: m.productName, productVersion: m.versionLabel,
			admission: { candidateId: c.candidateId, claimSetChecksum: a.claimSet.claimSetChecksum, eligibilityChecksum: a.eligibility.eligibilityChecksum, resolverPolicyRevision: a.eligibility.resolverPolicyRevision, identityVersion: c.identityVersion } },
		canonicalAuthority: false, createdAt
	});
}

export interface PersistenceDeps {
	/** true only if (chunkId, chunkEvidenceRevision) is currently the canonical chunk at that exact revision */
	chunkRevisionIsCurrent(chunkId: string, chunkEvidenceRevision: string): Promise<boolean>;
	/** the ONLY mutation boundary; returns rows inserted */
	insertAnalysis(row: ExternalDocAnalysisV1): Promise<number>;
	now(): string;
}
export interface PersistenceResult {
	persisted: { candidateId: string; analysisId: string; chunkId: string }[];
	refused: { candidateId: string | null; reasons: PersistenceRefusal[] }[];
	insertCalls: number;
}

/**
 * Persists the admitted candidates' exact text. `limit` is a CEILING (expected writes = admitted count, not the limit). All admission is decided before the first
 * insert; a candidate whose chunk revision is no longer current is refused before its insert.
 */
export async function persistEligibleSummaryCandidatesV1(items: Partial<FrozenSummaryEvidence>[], policy: SummaryPersistencePolicyV1, deps: PersistenceDeps, limit: number): Promise<PersistenceResult> {
	const result: PersistenceResult = { persisted: [], refused: [], insertCalls: 0 };
	const admitted: Extract<AdmissionDecision, { decision: 'MAY_PERSIST' }>[] = [];
	for (const item of items) {
		const decision = admitFrozenSummaryCandidateV1(item, policy);
		if (decision.decision === 'MAY_PERSIST') admitted.push(decision); else result.refused.push({ candidateId: decision.candidateId, reasons: decision.reasons });
	}
	const seen = new Set<string>();
	for (const a of admitted) {
		if (result.persisted.length >= limit) { result.refused.push({ candidateId: a.candidate.candidateId, reasons: ['ABOVE_LIMIT_CEILING'] }); continue; }
		if (seen.has(a.candidate.candidateId)) continue; // duplicate logical candidate: never written twice
		seen.add(a.candidate.candidateId);
		if (!(await deps.chunkRevisionIsCurrent(a.candidate.chunkId, a.candidate.chunkEvidenceRevision))) { result.refused.push({ candidateId: a.candidate.candidateId, reasons: ['STALE_CHUNK_REVISION'] }); continue; }
		const row = buildAnalysisRowFromCandidateV1(a, deps.now());
		result.insertCalls += 1;
		await deps.insertAnalysis(row);
		result.persisted.push({ candidateId: a.candidate.candidateId, analysisId: row.analysisId, chunkId: row.chunkId });
	}
	return result;
}
