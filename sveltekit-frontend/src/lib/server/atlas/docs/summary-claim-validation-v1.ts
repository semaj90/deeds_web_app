/**
 * SummaryClaimValidationV1 (LDR-VALIDATION-SPINE-01 / VAL-01): the typed, checksum-sealed RESULT of validating ONE claim of one derived
 * SUMMARY against its own canonical chunk. It is DERIVED validation evidence, never source identity or canonical authority.
 *
 * Reused primitives (census 2026-09-23, nothing re-invented):
 *  - `canonicalSha256V1` / `sha256HexSchema` (prefill/canonical-hash-v1.ts): the canonical-encoding checksum owner.
 *  - chunk identity = `chunkId` + `chunkEvidenceRevision` (ExternalDocChunkEvidenceV1, external-doc-intelligence-contracts-v1.ts). The
 *    optional `analysisId` links to the ExternalDocAnalysisV1 row (`eda:...`) the claim came from; it is provenance, not identity.
 *  - NOT reused, deliberately: `verifiedSourceByteSpanSchema` (packages/parent-atlas lsp-semantic-observation.ts) is SOURCE-FILE grain
 *    (source_ref + LSP position encoding); a doc-chunk support span is CHUNK grain (byte offsets inside the canonical chunk text).
 *
 * Structure: technical / numeric / version / sourceSpan / semantic / ontology are SEPARATE typed slots. The final `decision` is
 * structurally represented for downstream compatibility; VAL-09 owns the decision algorithm. VAL-01 only validates the result
 * taxonomy and does not infer whether a claim should be admitted, reviewed, or rejected.
 * The semantic slot holds future judge output (VAL-07) as typed fields only; the ontology slot applies to typed ontology assertions
 * only (OaK is a frozen typed kernel, not a prose judge).
 */
import { z } from 'zod';
import { createHash } from 'node:crypto';
import { canonicalSha256V1, sha256HexSchema } from '../prefill/canonical-hash-v1.js';

export const SUMMARY_CLAIM_VALIDATION_SCHEMA = 'atlas.summary-claim-validation.v1' as const;

const chunkEvidenceRevisionSchema = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const nonEmpty = z.string().min(1);
const explicitRevision = nonEmpty.refine((value) => !['latest', 'unknown'].includes(value.trim().toLowerCase()), 'revision must be explicit, not latest/unknown');

/** Claimed chunk-relative UTF-8 byte span plus exact-text checksum; VAL-05 independently verifies it against canonical bytes. */
export const ChunkByteSpanV1Schema = z.object({
	startByte: z.number().int().nonnegative(),
	endByte: z.number().int().positive(),
	textChecksum: sha256HexSchema
}).strict().refine((s) => s.endByte > s.startByte, { message: 'endByte must exceed startByte', path: ['endByte'] });
export type ChunkByteSpanV1 = z.infer<typeof ChunkByteSpanV1Schema>;

const deterministicStatus = z.enum(['NOT_RUN', 'PASS', 'FAIL', 'REVIEW']);

export const TechnicalTokenSlotV1Schema = z.object({
	status: deterministicStatus,
	sourceTokens: z.array(nonEmpty),
	claimTokens: z.array(nonEmpty),
	missingTechnicalTokens: z.array(nonEmpty),
	unexpectedTechnicalTokens: z.array(nonEmpty)
}).strict();

export const NumericSlotV1Schema = z.object({
	status: deterministicStatus,
	sourceValues: z.array(nonEmpty),
	claimValues: z.array(nonEmpty),
	unsupportedValues: z.array(nonEmpty)
}).strict();

export const VersionSlotV1Schema = z.object({
	status: deterministicStatus,
	sourceVersions: z.array(nonEmpty),
	claimVersions: z.array(nonEmpty),
	unsupportedVersions: z.array(nonEmpty)
}).strict();

export const SourceSpanSlotV1Schema = z.object({
	status: z.enum(['NOT_RUN', 'VERIFIED', 'UNVERIFIED', 'NO_CLAIMED_SPAN']),
	spans: z.array(ChunkByteSpanV1Schema)
}).strict();

export const SEMANTIC_VERDICT_VALUES = [
	'SUPPORTED', 'SUPPORTED_PARAPHRASE', 'SUPPORTED_WITH_OMISSION',
	'PARTIALLY_SUPPORTED', 'UNSUPPORTED_CLAIM', 'CONTRADICTED',
	'INSUFFICIENT_EVIDENCE', 'UNKNOWN'
] as const;
export const JUDGE_INDEPENDENCE_VALUES = ['SAME_MODEL_SEMANTIC_JUDGE', 'INDEPENDENT_MODEL_JUDGE'] as const;

export const SemanticSlotV1Schema = z.object({
	status: z.enum(['NOT_RUN', 'JUDGED', 'JUDGE_ERROR']),
	verdict: z.enum(SEMANTIC_VERDICT_VALUES).nullable(),
	/** Spans the judge CITED; only meaningful once the source-span slot verifies them. */
	citedSpans: z.array(ChunkByteSpanV1Schema),
	unsupportedFragment: z.string().nullable(),
	judgeModelId: z.string().nullable(),
	judgeModelRevision: explicitRevision.nullable(),
	judgePromptRevision: explicitRevision.nullable(),
	independenceClass: z.enum(JUDGE_INDEPENDENCE_VALUES).nullable()
}).strict().superRefine((v, ctx) => {
	const judged = v.status === 'JUDGED';
	if (judged && v.verdict === null) ctx.addIssue({ code: 'custom', message: 'JUDGED requires a verdict', path: ['verdict'] });
	if (!judged && v.verdict !== null) ctx.addIssue({ code: 'custom', message: 'a verdict is only valid when JUDGED', path: ['verdict'] });
	if (judged && (!v.judgeModelId || !v.judgeModelRevision || !v.judgePromptRevision || !v.independenceClass)) {
		ctx.addIssue({ code: 'custom', message: 'JUDGED requires judge model id/revision, prompt revision and independenceClass', path: ['judgeModelId'] });
	}
	if (v.status === 'NOT_RUN' && (v.citedSpans.length || v.unsupportedFragment !== null)) {
		ctx.addIssue({ code: 'custom', message: 'NOT_RUN semantic slot must be empty', path: ['status'] });
	}
});

export const OntologyAssertionV1Schema = z.object({
	subject: nonEmpty,
	predicate: nonEmpty,
	object: nonEmpty,
	status: z.enum(['SUPPORTED', 'REVIEW', 'REJECTED']),
	evidenceRef: nonEmpty
}).strict();

export const OntologySlotV1Schema = z.object({
	status: z.enum(['NOT_RUN', 'NOT_APPLICABLE', 'PASS', 'FAIL']),
	kernelRevision: explicitRevision.nullable(),
	assertions: z.array(OntologyAssertionV1Schema)
}).strict().superRefine((v, ctx) => {
	if ((v.status === 'PASS' || v.status === 'FAIL') && !v.kernelRevision) ctx.addIssue({ code: 'custom', message: 'a run ontology slot requires kernelRevision', path: ['kernelRevision'] });
	if ((v.status === 'NOT_RUN' || v.status === 'NOT_APPLICABLE') && v.assertions.length) ctx.addIssue({ code: 'custom', message: 'no assertions without a run', path: ['assertions'] });
});

export const CLAIM_DECISION_VALUES = ['PENDING', 'ADMIT', 'REVIEW', 'REJECT'] as const;

export const ClaimDecisionV1Schema = z.object({
	decision: z.enum(CLAIM_DECISION_VALUES),
	/** Revision of the VAL-09 escalation DAG that computed the decision; null while PENDING. */
	escalationRevision: explicitRevision.nullable()
}).strict();

const body = {
	schema: z.literal(SUMMARY_CLAIM_VALIDATION_SCHEMA),
	chunkId: nonEmpty,
	chunkEvidenceRevision: chunkEvidenceRevisionSchema,
	analysisId: z.string().regex(/^eda:[a-f0-9]{64}$/).nullable(),
	summaryInputChecksum: sha256HexSchema,
	summaryOutputChecksum: sha256HexSchema,
	/** Coordinate of the claim inside its summary only; not an identity. */
	claimOrdinal: z.number().int().nonnegative(),
	claimText: nonEmpty,
	claimChecksum: sha256HexSchema,
	technical: TechnicalTokenSlotV1Schema,
	numeric: NumericSlotV1Schema,
	version: VersionSlotV1Schema,
	sourceSpan: SourceSpanSlotV1Schema,
	semantic: SemanticSlotV1Schema,
	ontology: OntologySlotV1Schema,
	result: ClaimDecisionV1Schema,
	resolutionLayer: z.enum(['NOT_RESOLVED', 'TECHNICAL', 'NUMERIC', 'VERSION', 'SOURCE_SPAN', 'SEMANTIC', 'ONTOLOGY', 'COMPOSITE']),
	validatorRevision: explicitRevision,
	canonicalAuthority: z.literal(false)
};

const { claimChecksum: _claimChecksum, ...inputBody } = body;

/** Input shape omits the derived claim checksum and whole-envelope seals. */
export const SummaryClaimValidationInputV1Schema = z.object(inputBody).strict();
export type SummaryClaimValidationInputV1 = z.input<typeof SummaryClaimValidationInputV1Schema>;

export const SummaryClaimValidationV1Schema = z.object({
	...body,
	validationId: z.string().regex(/^scv:[a-f0-9]{64}$/),
	validationChecksum: sha256HexSchema
}).strict().superRefine((v, ctx) => {
	if (v.claimChecksum !== computeSummaryClaimChecksumV1(v.claimText)) {
		ctx.addIssue({ code: 'custom', message: 'claimChecksum does not match claimText', path: ['claimChecksum'] });
	}
	const { validationId, validationChecksum } = sealSummaryClaimValidationV1(v as unknown as SummaryClaimValidationInputV1);
	if (v.validationId !== validationId) ctx.addIssue({ code: 'custom', message: 'validationId does not match the recomputed identity', path: ['validationId'] });
	if (v.validationChecksum !== validationChecksum) ctx.addIssue({ code: 'custom', message: 'validationChecksum does not match the recomputed content', path: ['validationChecksum'] });
});
export type SummaryClaimValidationV1 = z.infer<typeof SummaryClaimValidationV1Schema>;

/**
 * Derived validation receipt identity: chunk evidence + summary output + execution-local claim ordinal + validator revision. This is
 * not canonical source identity. The separate claimChecksum hashes only claim text and is independent of claimOrdinal.
 */
export function computeSummaryClaimChecksumV1(claimText: string): string {
	return canonicalSha256V1({ schema: 'atlas.summary-claim.v1', claimText });
}

/** Independently verify a claimed support span against the exact canonical chunk bytes (VAL-05). */
export function verifySummaryClaimByteSpanV1(input: {
	canonicalChunkEvidenceRevision: string;
	claimedChunkEvidenceRevision: string;
	canonicalChunkBytes: Uint8Array;
	span: ChunkByteSpanV1;
}): { verified: boolean; status: 'VERIFIED' | 'UNVERIFIED'; reason: 'EXACT' | 'REVISION_MISMATCH' | 'OUT_OF_BOUNDS' | 'INVALID_UTF8' | 'CHECKSUM_MISMATCH' } {
	const parsedSpan = ChunkByteSpanV1Schema.safeParse(input.span);
	if (!parsedSpan.success) return { verified: false, status: 'UNVERIFIED', reason: 'OUT_OF_BOUNDS' };
	const canonicalRevision = chunkEvidenceRevisionSchema.safeParse(input.canonicalChunkEvidenceRevision);
	const claimedRevision = chunkEvidenceRevisionSchema.safeParse(input.claimedChunkEvidenceRevision);
	if (!canonicalRevision.success || !claimedRevision.success || canonicalRevision.data !== claimedRevision.data) {
		return { verified: false, status: 'UNVERIFIED', reason: 'REVISION_MISMATCH' };
	}
	const { startByte, endByte, textChecksum } = parsedSpan.data;
	if (endByte > input.canonicalChunkBytes.byteLength) return { verified: false, status: 'UNVERIFIED', reason: 'OUT_OF_BOUNDS' };
	const selectedBytes = input.canonicalChunkBytes.subarray(startByte, endByte);
	try {
		new TextDecoder('utf-8', { fatal: true }).decode(selectedBytes);
	} catch {
		return { verified: false, status: 'UNVERIFIED', reason: 'INVALID_UTF8' };
	}
	const actualChecksum = createHash('sha256').update(selectedBytes).digest('hex');
	if (actualChecksum !== textChecksum) return { verified: false, status: 'UNVERIFIED', reason: 'CHECKSUM_MISMATCH' };
	return { verified: true, status: 'VERIFIED', reason: 'EXACT' };
}

export function sealSummaryClaimValidationV1(input: SummaryClaimValidationInputV1): { claimChecksum: string; validationId: string; validationChecksum: string } {
	const i = input as Record<string, unknown> & { chunkEvidenceRevision: string; summaryOutputChecksum: string; claimOrdinal: number; validatorRevision: string };
	const claimChecksum = computeSummaryClaimChecksumV1(i.claimText as string);
	const validationId = `scv:${canonicalSha256V1({ schema: SUMMARY_CLAIM_VALIDATION_SCHEMA, chunkEvidenceRevision: i.chunkEvidenceRevision, summaryOutputChecksum: i.summaryOutputChecksum, claimOrdinal: i.claimOrdinal, validatorRevision: i.validatorRevision })}`;
	const { validationId: _id, validationChecksum: _ck, claimChecksum: _priorClaimChecksum, ...rest } = i as Record<string, unknown>;
	return { claimChecksum, validationId, validationChecksum: canonicalSha256V1({ ...rest, claimChecksum, validationId }) };
}

export function buildSummaryClaimValidationV1(input: SummaryClaimValidationInputV1): SummaryClaimValidationV1 {
	const parsed = SummaryClaimValidationInputV1Schema.parse(input);
	return SummaryClaimValidationV1Schema.parse({ ...parsed, ...sealSummaryClaimValidationV1(parsed) });
}

/** A claim with every validator slot NOT_RUN and decision PENDING: the starting point the VAL-03..09 validators fill in. */
export function pendingSummaryClaimValidationV1(base: Pick<SummaryClaimValidationInputV1, 'chunkId' | 'chunkEvidenceRevision' | 'analysisId' | 'summaryInputChecksum' | 'summaryOutputChecksum' | 'claimOrdinal' | 'claimText' | 'validatorRevision'>): SummaryClaimValidationV1 {
	return buildSummaryClaimValidationV1({
		...base,
		schema: SUMMARY_CLAIM_VALIDATION_SCHEMA,
		technical: { status: 'NOT_RUN', sourceTokens: [], claimTokens: [], missingTechnicalTokens: [], unexpectedTechnicalTokens: [] },
		numeric: { status: 'NOT_RUN', sourceValues: [], claimValues: [], unsupportedValues: [] },
		version: { status: 'NOT_RUN', sourceVersions: [], claimVersions: [], unsupportedVersions: [] },
		sourceSpan: { status: 'NOT_RUN', spans: [] },
		semantic: { status: 'NOT_RUN', verdict: null, citedSpans: [], unsupportedFragment: null, judgeModelId: null, judgeModelRevision: null, judgePromptRevision: null, independenceClass: null },
		ontology: { status: 'NOT_RUN', kernelRevision: null, assertions: [] },
		result: { decision: 'PENDING', escalationRevision: null },
		resolutionLayer: 'NOT_RESOLVED',
		canonicalAuthority: false
	});
}
