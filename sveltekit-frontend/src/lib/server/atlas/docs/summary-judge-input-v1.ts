/** VAL-06: frozen, bounded input contract for judging one claim against only its own chunk. */
import { z } from 'zod';
import { canonicalSha256V1, sha256HexSchema } from '../prefill/canonical-hash-v1.js';
import {
	computeSummaryClaimChecksumV1,
	NumericSlotV1Schema,
	SourceSpanSlotV1Schema,
	SummaryClaimValidationV1Schema,
	TechnicalTokenSlotV1Schema,
	VersionSlotV1Schema,
	type SummaryClaimValidationV1
} from './summary-claim-validation-v1.js';

export const SUMMARY_JUDGE_INPUT_SCHEMA = 'atlas.summary-judge-input.v1' as const;
export const SUMMARY_JUDGE_INPUT_MAX_CHUNK_BYTES = 32 * 1024;

const nonEmpty = z.string().trim().min(1);
const explicitRevision = nonEmpty.refine((value) => !['latest', 'unknown'].includes(value.toLowerCase()));
const boundedChunkText = z.string().min(1).refine(
	(value) => new TextEncoder().encode(value).byteLength <= SUMMARY_JUDGE_INPUT_MAX_CHUNK_BYTES,
	`canonical chunk text exceeds ${SUMMARY_JUDGE_INPUT_MAX_CHUNK_BYTES} UTF-8 bytes`
);

const baseShape = {
	schema: z.literal(SUMMARY_JUDGE_INPUT_SCHEMA),
	chunkId: nonEmpty,
	chunkEvidenceRevision: z.string().regex(/^sha256:[a-f0-9]{64}$/),
	summaryOutputChecksum: sha256HexSchema,
	canonicalChunkText: boundedChunkText,
	promptVisibleMetadata: z.object({
		product: nonEmpty.nullable(),
		productVersion: nonEmpty.nullable(),
		title: nonEmpty.nullable(),
		headingPath: z.array(nonEmpty).max(24)
	}).strict(),
	claim: z.object({
		claimOrdinal: z.number().int().nonnegative(),
		claimText: nonEmpty,
		claimChecksum: sha256HexSchema
	}).strict(),
	deterministicFindings: z.object({
		technical: TechnicalTokenSlotV1Schema,
		numeric: NumericSlotV1Schema,
		version: VersionSlotV1Schema,
		sourceSpan: SourceSpanSlotV1Schema
	}).strict(),
	promptRevision: explicitRevision,
	canonicalAuthority: z.literal(false)
};

export const SummaryJudgeInputV1BodySchema = z.object(baseShape).strict().superRefine((value, ctx) => {
	if (value.claim.claimChecksum !== computeSummaryClaimChecksumV1(value.claim.claimText)) {
		ctx.addIssue({ code: 'custom', message: 'claimChecksum does not match claimText', path: ['claim', 'claimChecksum'] });
	}
});
export type SummaryJudgeInputV1Body = z.infer<typeof SummaryJudgeInputV1BodySchema>;

export const SummaryJudgeInputV1Schema = z.object({
	...baseShape,
	judgeInputChecksum: sha256HexSchema
}).strict().superRefine((value, ctx) => {
	if (value.claim.claimChecksum !== computeSummaryClaimChecksumV1(value.claim.claimText)) {
		ctx.addIssue({ code: 'custom', message: 'claimChecksum does not match claimText', path: ['claim', 'claimChecksum'] });
	}
	const { judgeInputChecksum, ...body } = value;
	if (judgeInputChecksum !== canonicalSha256V1(body)) {
		ctx.addIssue({ code: 'custom', message: 'judgeInputChecksum does not match the frozen input', path: ['judgeInputChecksum'] });
	}
});
export type SummaryJudgeInputV1 = z.infer<typeof SummaryJudgeInputV1Schema>;

const CanonicalChunkReadbackV1Schema = z.object({
	chunk_id: nonEmpty,
	evidence_revision: z.string().regex(/^sha256:[a-f0-9]{64}$/),
	text: boundedChunkText
}).strict();

export type SummaryJudgeInputV1BuildInput = {
	validation: SummaryClaimValidationV1;
	canonicalChunkRow: z.input<typeof CanonicalChunkReadbackV1Schema>;
	promptVisibleMetadata: SummaryJudgeInputV1Body['promptVisibleMetadata'];
	promptRevision: string;
};

/**
 * Construct and seal one bounded judge input from a sealed validation artifact and an exact chunk
 * readback. The caller owns the read-only query by (chunkId, chunkEvidenceRevision); this pure
 * builder verifies the returned row identity and performs no retrieval or model execution.
 */
export function buildSummaryJudgeInputV1(input: SummaryJudgeInputV1BuildInput): SummaryJudgeInputV1 {
	const validation = SummaryClaimValidationV1Schema.parse(input.validation);
	const chunk = CanonicalChunkReadbackV1Schema.parse(input.canonicalChunkRow);
	if (chunk.chunk_id !== validation.chunkId || chunk.evidence_revision !== validation.chunkEvidenceRevision) {
		throw new Error('SUMMARY_JUDGE_CANONICAL_CHUNK_IDENTITY_MISMATCH');
	}
	const body = SummaryJudgeInputV1BodySchema.parse({
		schema: SUMMARY_JUDGE_INPUT_SCHEMA,
		chunkId: validation.chunkId,
		chunkEvidenceRevision: validation.chunkEvidenceRevision,
		summaryOutputChecksum: validation.summaryOutputChecksum,
		canonicalChunkText: chunk.text,
		promptVisibleMetadata: input.promptVisibleMetadata,
		claim: { claimOrdinal: validation.claimOrdinal, claimText: validation.claimText, claimChecksum: validation.claimChecksum },
		deterministicFindings: {
			technical: validation.technical,
			numeric: validation.numeric,
			version: validation.version,
			sourceSpan: validation.sourceSpan
		},
		promptRevision: input.promptRevision,
		canonicalAuthority: false
	});
	return SummaryJudgeInputV1Schema.parse({ ...body, judgeInputChecksum: canonicalSha256V1(body) });
}
