/**
 * VAL-10C: SummaryCandidateV1 / SummaryClaimSetV1 / SummaryEligibilityV1 - ONE immutable identity for a generated SUMMARY that threads unchanged through
 * generation -> claim extraction -> deterministic validation -> semantic judge -> resolution -> eligibility -> persistence.
 *
 *   THE SUMMARY THAT WAS VALIDATED  ===  THE SUMMARY THAT IS WRITTEN
 *
 * `candidateId` is derived deterministically from the immutable content/lineage (no timestamp, no attempt id). It is DERIVED-ANALYSIS identity, never
 * canonical document identity; `identityVersion` freezes which chunk-identity scheme the chunk pair belongs to (DOC-26's v2 is NOT applied here).
 *
 * Object keys are deliberately chosen so that no key is a case-insensitive prefix of another key in the same object: the TypeScript canonical encoder sorts
 * keys with localeCompare('en') while the Python port sorts by code point, and they disagree exactly in that situation (CANONICAL-HASH-SORT-HAZARD).
 * Derived evidence only; TypeScript owns these seals, the Python twin (python/atlas_summary_candidate_v1.py) is a parity verifier/producer of eligibility.
 */
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { canonicalSha256V1, sha256HexSchema } from '../prefill/canonical-hash-v1.js';
import { computeSummaryClaimChecksumV1 } from './summary-claim-validation-v1.js';

export const SUMMARY_CANDIDATE_SCHEMA = 'atlas.summary-candidate.v1' as const;
export const SUMMARY_CLAIM_SET_SCHEMA = 'atlas.summary-claim-set.v1' as const;
export const SUMMARY_ELIGIBILITY_SCHEMA = 'atlas.summary-eligibility.v1' as const;
/** The chunk-identity scheme the frozen VAL-10 cohort uses (the currently admitted `doc:<product>:<hash>:<ordinal>` ids). */
export const CHUNK_IDENTITY_VERSION_V1 = 'external-doc-chunk-id:v1' as const;

const rawSha256Hex = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex');
const nonEmpty = z.string().min(1);
const chunkRevision = z.string().regex(/^sha256:[a-f0-9]{64}$/);

const generationMetadataSchema = z.object({
	backend: nonEmpty, baseUrl: nonEmpty, temperature: z.number(), seed: z.number().int(), maxTokens: z.number().int().positive(),
	finishReason: nonEmpty, completionTokens: z.number().int().nonnegative(), productName: nonEmpty, versionLabel: nonEmpty
}).strict();

const candidateBody = {
	schema: z.literal(SUMMARY_CANDIDATE_SCHEMA),
	chunkId: nonEmpty,
	chunkEvidenceRevision: chunkRevision,
	identityVersion: nonEmpty,
	producerId: nonEmpty,
	producerRevision: nonEmpty,
	modelId: nonEmpty,
	modelRevision: nonEmpty,
	promptRevision: nonEmpty,
	inputChecksum: sha256HexSchema,
	summaryText: nonEmpty,
	outputChecksum: sha256HexSchema,
	generationMetadata: generationMetadataSchema,
	canonicalAuthority: z.literal(false)
};
export const SummaryCandidateV1BodySchema = z.object(candidateBody).strict();
export const SummaryCandidateV1Schema = z.object({ ...candidateBody, candidateId: z.string().regex(/^sc:[a-f0-9]{64}$/) }).strict();
export type SummaryCandidateV1 = z.infer<typeof SummaryCandidateV1Schema>;
export type SummaryCandidateV1Input = Omit<z.input<typeof SummaryCandidateV1BodySchema>, 'schema' | 'outputChecksum' | 'canonicalAuthority'>;

export function computeCandidateIdV1(body: z.infer<typeof SummaryCandidateV1BodySchema>): string {
	return `sc:${canonicalSha256V1(body)}`;
}

/** Builds and seals one candidate. `outputChecksum` is derived from the exact text (raw UTF-8 sha256, the same value the analysis row stores). */
export function buildSummaryCandidateV1(input: SummaryCandidateV1Input): SummaryCandidateV1 {
	const body = SummaryCandidateV1BodySchema.parse({ ...input, schema: SUMMARY_CANDIDATE_SCHEMA, outputChecksum: rawSha256Hex(input.summaryText), canonicalAuthority: false });
	return SummaryCandidateV1Schema.parse({ ...body, candidateId: computeCandidateIdV1(body) });
}

export type CandidateSealFailure = 'CANDIDATE_INVALID' | 'CANDIDATE_ID_MISMATCH' | 'SUMMARY_OUTPUT_CHECKSUM_MISMATCH';
/** Independent seal check: schema, the text hash, then the id recomputed from every immutable field. */
export function verifySummaryCandidateV1(candidate: unknown): { ok: true; candidate: SummaryCandidateV1 } | { ok: false; reason: CandidateSealFailure } {
	const parsed = SummaryCandidateV1Schema.safeParse(candidate);
	if (!parsed.success) return { ok: false, reason: 'CANDIDATE_INVALID' };
	const { candidateId, ...body } = parsed.data;
	if (parsed.data.outputChecksum !== rawSha256Hex(parsed.data.summaryText)) return { ok: false, reason: 'SUMMARY_OUTPUT_CHECKSUM_MISMATCH' };
	if (computeCandidateIdV1(body) !== candidateId) return { ok: false, reason: 'CANDIDATE_ID_MISMATCH' };
	return { ok: true, candidate: parsed.data };
}

// ---- claim set -----------------------------------------------------------------------------------------------------------------------------------

const claimMember = z.object({ claimOrdinal: z.number().int().min(0), claimText: nonEmpty, claimChecksum: sha256HexSchema }).strict();
const claimSetBody = {
	schema: z.literal(SUMMARY_CLAIM_SET_SCHEMA),
	candidateId: z.string().regex(/^sc:[a-f0-9]{64}$/),
	extractorRevision: nonEmpty,
	claimList: z.array(claimMember).min(1)
};
export const SummaryClaimSetV1BodySchema = z.object(claimSetBody).strict();
export const SummaryClaimSetV1Schema = z.object({ ...claimSetBody, claimSetChecksum: sha256HexSchema }).strict();
export type SummaryClaimSetV1 = z.infer<typeof SummaryClaimSetV1Schema>;

export function buildSummaryClaimSetV1(input: { candidateId: string; extractorRevision: string; claimTexts: string[] }): SummaryClaimSetV1 {
	const body = SummaryClaimSetV1BodySchema.parse({
		schema: SUMMARY_CLAIM_SET_SCHEMA, candidateId: input.candidateId, extractorRevision: input.extractorRevision,
		claimList: input.claimTexts.map((claimText, claimOrdinal) => ({ claimOrdinal, claimText, claimChecksum: computeSummaryClaimChecksumV1(claimText) }))
	});
	return SummaryClaimSetV1Schema.parse({ ...body, claimSetChecksum: canonicalSha256V1(body) });
}

/** Seal check: schema, contiguous ordinals, every claimChecksum recomputed from its text, then the set checksum. */
export function verifySummaryClaimSetV1(claimSet: unknown): { ok: true; claimSet: SummaryClaimSetV1 } | { ok: false } {
	const parsed = SummaryClaimSetV1Schema.safeParse(claimSet);
	if (!parsed.success) return { ok: false };
	const { claimSetChecksum, ...body } = parsed.data;
	if (!body.claimList.every((c, i) => c.claimOrdinal === i && c.claimChecksum === computeSummaryClaimChecksumV1(c.claimText))) return { ok: false };
	return canonicalSha256V1(body) === claimSetChecksum ? { ok: true, claimSet: parsed.data } : { ok: false };
}

// ---- eligibility ---------------------------------------------------------------------------------------------------------------------------------

const resolution = z.object({
	claimOrdinal: z.number().int().min(0), claimChecksum: sha256HexSchema, validationId: z.string().regex(/^scv:[a-f0-9]{64}$/), validationChecksum: sha256HexSchema,
	judgeInputChecksum: sha256HexSchema, decision: z.enum(['PENDING', 'ADMIT', 'REVIEW', 'REJECT']), resolutionLayer: nonEmpty
}).strict();
const eligibilityBody = {
	schema: z.literal(SUMMARY_ELIGIBILITY_SCHEMA),
	candidateId: z.string().regex(/^sc:[a-f0-9]{64}$/),
	claimSetChecksum: sha256HexSchema,
	validationContractRevision: nonEmpty,
	spineRevision: sha256HexSchema,
	judgePromptRevision: nonEmpty,
	judgeModelRevision: nonEmpty,
	resolverPolicyRevision: nonEmpty,
	resolutions: z.array(resolution),
	eligible: z.boolean()
};
export const SummaryEligibilityV1BodySchema = z.object(eligibilityBody).strict();
export const SummaryEligibilityV1Schema = z.object({ ...eligibilityBody, eligibilityChecksum: sha256HexSchema }).strict();
export type SummaryEligibilityV1 = z.infer<typeof SummaryEligibilityV1Schema>;

export const computeEligibilityChecksumV1 = (body: z.infer<typeof SummaryEligibilityV1BodySchema>): string => canonicalSha256V1(body);

// ---- cohort --------------------------------------------------------------------------------------------------------------------------------------

/** Order-independent checksum of the exact chunk/revision pairs of a cohort. */
export function computeChunkCohortChecksumV1(pairs: { chunkId: string; chunkEvidenceRevision: string }[]): string {
	return canonicalSha256V1({ schema: 'atlas.summary-chunk-cohort.v1', pairs: [...pairs].sort((a, b) => (a.chunkId + a.chunkEvidenceRevision < b.chunkId + b.chunkEvidenceRevision ? -1 : 1)) });
}
/** Order-independent checksum of the exact candidate ids of a cohort. */
export function computeCandidateCohortChecksumV1(candidateIds: string[]): string {
	return canonicalSha256V1({ schema: 'atlas.summary-candidate-cohort.v1', candidateIds: [...candidateIds].sort() });
}
