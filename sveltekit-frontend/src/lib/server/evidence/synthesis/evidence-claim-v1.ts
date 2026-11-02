import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { LangExtractDocumentationFact } from '../../atlas/ai/langextract-transport.js';

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);
const boundedText = (maximum: number) => z.string().trim().min(1).max(maximum);

const evidenceClaimFields = {
	claimId: z.string().uuid(),
	sourceId: boundedText(512),
	sourceSha256: sha256Schema,
	sourceRevision: boundedText(512),
	workspaceRevision: z.string().max(512).nullable(),
	caseId: z.string().uuid().nullable(),
	who: z.string().max(4_096),
	relationPredicate: boundedText(2_048),
	what: boundedText(8_192),
	why: z.string().max(8_192),
	how: z.string().max(8_192),
	assertion: boundedText(16_384),
	domainId: z.string().max(256).nullable(),
	taxonomyId: z.string().max(256).nullable(),
	observedAt: z.string().datetime().nullable(),
	validAt: z.string().datetime().nullable(),
	extraction: z.object({
		provider: boundedText(256),
		producerRevision: boundedText(512),
		modelId: z.string().max(512).nullable(),
		outputSha256: sha256Schema,
		method: boundedText(256),
		confidence: z.number().finite().min(0).max(1),
		productVersion: z.string().max(256),
	}).strict(),
	supportingClaimIds: z.array(z.string().uuid()).max(128),
	contradictingClaimIds: z.array(z.string().uuid()).max(128),
};

export const EvidenceClaimProposalV1Schema = z.object({
	...evidenceClaimFields,
	span: z.object({
		startChar: z.number().int().nonnegative(),
		endChar: z.number().int().positive(),
		exactText: z.string().min(1).max(16_384),
		textSourceSha256: sha256Schema,
	}).strict(),
	verificationStatus: z.literal('PROPOSED'),
}).strict();

export const EvidenceClaimV1Schema = z.object({
	...evidenceClaimFields,
	span: z.object({
		startChar: z.number().int().nonnegative(),
		endChar: z.number().int().positive(),
		startByte: z.number().int().nonnegative(),
		endByte: z.number().int().positive(),
		exactText: z.string().min(1).max(16_384),
		textSourceSha256: sha256Schema,
	}).strict(),
	verificationStatus: z.enum([
		'PROPOSED',
		'SOURCE_GROUNDED',
		'CORROBORATED',
		'CONFLICTED',
		'REJECTED',
	]),
}).strict().superRefine((claim, context) => {
	const uniqueContradictionIds = new Set(claim.contradictingClaimIds);
	if (uniqueContradictionIds.size !== claim.contradictingClaimIds.length) {
		context.addIssue({ code: 'custom', path: ['contradictingClaimIds'], message: 'Contradiction links must be unique.' });
	}
	if (claim.contradictingClaimIds.includes(claim.claimId)) {
		context.addIssue({ code: 'custom', path: ['contradictingClaimIds'], message: 'A claim cannot contradict itself.' });
	}
	if (claim.verificationStatus === 'CONFLICTED' && claim.contradictingClaimIds.length === 0) {
		context.addIssue({ code: 'custom', path: ['contradictingClaimIds'], message: 'Conflicted claims require an explicit contradiction link.' });
	}
});

export type EvidenceClaimV1 = z.infer<typeof EvidenceClaimV1Schema>;
export type EvidenceClaimProposalV1 = z.infer<typeof EvidenceClaimProposalV1Schema>;

export const EvidenceClaimSourceBindingV1Schema = z.object({
	sourceId: boundedText(512),
	sourceRevision: boundedText(512),
	workspaceRevision: z.string().max(512).nullable(),
	caseId: z.string().uuid().nullable(),
	contentSha256: sha256Schema,
	spanContentSha256: sha256Schema,
}).strict();

// Derived from the schema so the hand-written type and the validator cannot drift apart.
export type EvidenceClaimSourceBindingV1 = z.infer<typeof EvidenceClaimSourceBindingV1Schema>;

const langExtractFactAdapterSchema = z.object({
	schema: z.literal('atlas.documentation-fact.v1'),
	subject: z.string().max(4_096),
	predicate: boundedText(2_048),
	object: boundedText(8_192),
	statement: boundedText(16_384),
	evidenceText: z.string().min(1).max(16_384),
	sourceRevision: boundedText(512),
	startChar: z.number().int().nonnegative(),
	endChar: z.number().int().positive(),
	startByte: z.number().int().nonnegative(),
	endByte: z.number().int().positive(),
	alignmentStatus: z.literal('MATCH_EXACT'),
	productVersion: z.string().max(256),
	confidence: z.number().finite().min(0).max(1),
	extractionMethod: boundedText(256),
	canonicalAuthority: z.literal(false),
}).passthrough();

const langExtractProvenanceSchema = z.object({
	provider: boundedText(256),
	producerRevision: boundedText(512),
	modelId: z.string().max(512).nullable(),
	outputHash: sha256Schema,
}).strict();

export function groundEvidenceClaimV1(
	input: unknown,
	sourceBytes: Uint8Array,
	expected: EvidenceClaimSourceBindingV1,
	spanSourceBytes: Uint8Array = sourceBytes,
): EvidenceClaimV1 {
	const claim = EvidenceClaimProposalV1Schema.parse(input);
	expected = EvidenceClaimSourceBindingV1Schema.parse(expected);
	if (
		claim.sourceId !== expected.sourceId
		|| claim.sourceRevision !== expected.sourceRevision
		|| claim.workspaceRevision !== expected.workspaceRevision
		|| claim.caseId !== expected.caseId
		|| claim.sourceSha256 !== expected.contentSha256
	) {
		throw new Error('EVIDENCE_CLAIM_SOURCE_BINDING_MISMATCH');
	}

	const bytes = Buffer.from(sourceBytes);
	const actualDigest = createHash('sha256').update(bytes).digest('hex');
	if (actualDigest !== expected.contentSha256) {
		throw new Error('EVIDENCE_CLAIM_SOURCE_DIGEST_MISMATCH');
	}

	const spanBytes = Buffer.from(spanSourceBytes);
	const decodedSpanSource = spanBytes.toString('utf8');
	if (!Buffer.from(decodedSpanSource, 'utf8').equals(spanBytes)) {
		throw new Error('EVIDENCE_CLAIM_SPAN_SOURCE_INVALID_UTF8');
	}
	const spanSourceDigest = createHash('sha256').update(spanBytes).digest('hex');
	if (spanSourceDigest !== expected.spanContentSha256) {
		throw new Error('EVIDENCE_CLAIM_SPAN_SOURCE_DIGEST_MISMATCH');
	}

	const codePoints = Array.from(decodedSpanSource);
	const { startChar, endChar, exactText } = claim.span;
	if (
		claim.span.textSourceSha256 !== expected.spanContentSha256
		|| endChar <= startChar
		|| endChar > codePoints.length
	) {
		throw new Error('EVIDENCE_CLAIM_SPAN_OUT_OF_BOUNDS');
	}
	const actualText = codePoints.slice(startChar, endChar).join('');
	const actualStartByte = Buffer.byteLength(codePoints.slice(0, startChar).join(''), 'utf8');
	const actualEndByte = actualStartByte + Buffer.byteLength(actualText, 'utf8');
	if (actualText !== exactText) {
		throw new Error('EVIDENCE_CLAIM_SPAN_MISMATCH');
	}

	return EvidenceClaimV1Schema.parse({
		...claim,
		span: { ...claim.span, startByte: actualStartByte, endByte: actualEndByte, textSourceSha256: spanSourceDigest },
		verificationStatus: 'SOURCE_GROUNDED',
	});
}

export function mapLangExtractFactToEvidenceClaimV1(input: {
	fact: LangExtractDocumentationFact;
	claimId: string;
	sourceId: string;
	sourceUrl: string;
	sourceRevision: string;
	workspaceRevision: string | null;
	caseId: string | null;
	sourceBytes: Uint8Array;
	spanSourceBytes?: Uint8Array;
	provenance: unknown;
}): EvidenceClaimV1 {
	const fact = langExtractFactAdapterSchema.parse(input.fact);
	const provenance = langExtractProvenanceSchema.parse(input.provenance);
	const spanSourceBytes = input.spanSourceBytes ?? input.sourceBytes;
	const spanSourceSha256 = createHash('sha256').update(spanSourceBytes).digest('hex');
	if (fact.sourceUrl !== input.sourceUrl) {
		throw new Error('EVIDENCE_CLAIM_SOURCE_BINDING_MISMATCH');
	}
	const sourceSha256 = createHash('sha256').update(input.sourceBytes).digest('hex');
	if (fact.sourceRevision !== `sha256:${spanSourceSha256}`) {
		throw new Error('EVIDENCE_CLAIM_SOURCE_BINDING_MISMATCH');
	}
	const grounded = groundEvidenceClaimV1({
		claimId: input.claimId,
		sourceId: input.sourceId,
		sourceSha256,
		sourceRevision: input.sourceRevision,
		workspaceRevision: input.workspaceRevision,
		caseId: input.caseId,
		span: {
			startChar: fact.startChar,
			endChar: fact.endChar,
			exactText: fact.evidenceText,
			textSourceSha256: spanSourceSha256,
		},
		who: fact.subject,
		relationPredicate: fact.predicate,
		what: fact.object,
		why: '',
		how: '',
		assertion: fact.statement,
		domainId: null,
		taxonomyId: null,
		observedAt: null,
		validAt: null,
		extraction: {
			provider: provenance.provider,
			producerRevision: provenance.producerRevision,
			modelId: provenance.modelId ?? null,
			outputSha256: provenance.outputHash,
			method: fact.extractionMethod,
			confidence: fact.confidence,
			productVersion: fact.productVersion,
		},
		verificationStatus: 'PROPOSED',
		supportingClaimIds: [],
		contradictingClaimIds: [],
	}, input.sourceBytes, {
		sourceId: input.sourceId,
		sourceRevision: input.sourceRevision,
		workspaceRevision: input.workspaceRevision,
		caseId: input.caseId,
		contentSha256: sourceSha256,
		spanContentSha256: spanSourceSha256,
	}, spanSourceBytes);
	if (grounded.span.startByte !== fact.startByte || grounded.span.endByte !== fact.endByte) {
		throw new Error('EVIDENCE_CLAIM_LANGEXTRACT_BYTE_SPAN_MISMATCH');
	}
	return grounded;
}
