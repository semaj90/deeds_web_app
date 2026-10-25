import { createHash } from 'node:crypto';
import { z } from 'zod';
import { EvidenceLocatorV1Schema, SourceSpanV1Schema, type EvidenceLocatorV1 } from './evidence-locator-v1.js';

const digest = z.string().regex(/^(?:sha256:)?[a-f0-9]{64}$/i);

export const FeatureDescriptionEvidenceV1Schema = z.object({
	evidenceRef: z.string().min(1),
	canonicalId: z.string().min(1),
	packetKey: z.string().min(1).nullable(),
	sourceRef: z.string().min(1),
	sourceKind: z.enum(['code_file', 'document', 'url', 'generated', 'unknown']),
	filePath: z.string().min(1).nullable(),
	sourceRevision: z.string().min(1),
	workspaceRevision: z.string().min(1),
	contentHash: digest,
	spanDigest: digest,
	span: SourceSpanV1Schema,
	role: z.enum(['AST', 'CST', 'TREE_LINEAGE', 'TEST', 'DOCUMENTATION', 'ONTOLOGY_CANDIDATE', 'MODEL_PROPOSAL']),
}).strict();

export const FeatureDescriptionV1Schema = z.object({
	schema: z.literal('atlas.feature-description.v1'),
	canonicalId: z.string().min(1),
	packetKey: z.string().min(1).nullable(),
	sourceRef: z.string().min(1),
	featureRevision: z.string().min(1),
	workspaceRevision: z.string().min(1),
	summary: z.string().trim().min(1).max(2000),
	status: z.enum(['PROPOSAL_ONLY', 'REVIEWED']),
	producer: z.enum(['DETERMINISTIC', 'DSPY_PROPOSAL', 'HUMAN_REVIEW']),
	evidence: z.array(FeatureDescriptionEvidenceV1Schema).min(1),
	relatedFiles: z.array(z.object({
		filePath: z.string().min(1),
		canonicalId: z.string().min(1),
		sourceRef: z.string().min(1),
		sourceRevision: z.string().min(1),
		workspaceRevision: z.string().min(1),
		evidenceRefs: z.array(z.string().min(1)).min(1),
	}).strict()),
}).strict().superRefine((description, ctx) => {
	if (description.status === 'REVIEWED' && description.producer !== 'HUMAN_REVIEW') {
		ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['producer'], message: 'REVIEWED_DESCRIPTION_REQUIRES_HUMAN_REVIEW' });
	}
	const evidenceRefs = new Set(description.evidence.map((item) => item.evidenceRef));
	if (evidenceRefs.size !== description.evidence.length) {
		ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['evidence'], message: 'DUPLICATE_DESCRIPTION_EVIDENCE_REF' });
	}
	const primaryEvidence = description.evidence.filter((item) =>
		item.canonicalId === description.canonicalId &&
		item.packetKey === description.packetKey &&
		item.sourceRef === description.sourceRef
	);
	if (primaryEvidence.length === 0) {
		ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['evidence'], message: 'DESCRIPTION_PRIMARY_EVIDENCE_MISSING' });
	}
	for (const [index, evidence] of description.evidence.entries()) {
		if (evidence.workspaceRevision !== description.workspaceRevision) {
			ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['evidence', index, 'workspaceRevision'], message: 'DESCRIPTION_EVIDENCE_WORKSPACE_REVISION_MISMATCH' });
		}
		const isPrimary = primaryEvidence.includes(evidence);
		if (!isPrimary && !description.relatedFiles.some((file) => file.evidenceRefs.includes(evidence.evidenceRef))) {
			ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['evidence', index], message: 'DESCRIPTION_EVIDENCE_NOT_LINKED_TO_RELATED_FILE' });
		}
		if (isPrimary && primaryEvidence.some((candidate) =>
			candidate.sourceRevision !== evidence.sourceRevision ||
			candidate.contentHash.toLowerCase() !== evidence.contentHash.toLowerCase()
		)) {
			ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['evidence', index], message: 'DESCRIPTION_PRIMARY_EVIDENCE_REVISION_MISMATCH' });
		}
	}
	for (const [index, file] of description.relatedFiles.entries()) {
		if (file.workspaceRevision !== description.workspaceRevision) {
			ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['relatedFiles', index, 'workspaceRevision'], message: 'RELATED_FILE_WORKSPACE_REVISION_MISMATCH' });
		}
		for (const ref of file.evidenceRefs) {
			if (!evidenceRefs.has(ref)) {
				ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['relatedFiles', index, 'evidenceRefs'], message: 'RELATED_FILE_EVIDENCE_REF_NOT_PRESENT' });
				continue;
			}
			const evidence = description.evidence.find((item) => item.evidenceRef === ref);
			if (evidence && (evidence.canonicalId !== file.canonicalId || evidence.sourceRef !== file.sourceRef || evidence.sourceRevision !== file.sourceRevision || evidence.workspaceRevision !== file.workspaceRevision || evidence.filePath !== file.filePath)) {
				ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['relatedFiles', index, 'evidenceRefs'], message: 'RELATED_FILE_EVIDENCE_IDENTITY_MISMATCH' });
			}
		}
	}
});

export type FeatureDescriptionEvidenceV1 = z.infer<typeof FeatureDescriptionEvidenceV1Schema>;
export type FeatureDescriptionV1 = z.infer<typeof FeatureDescriptionV1Schema>;

export const FeatureDescriptionByteVerificationV1Schema = z.object({
	schema: z.literal('atlas.feature-description-byte-verification.v1'),
	status: z.literal('BYTES_AND_SPANS_MATCHED'),
	descriptionDigest: digest,
	verifiedEvidenceRefs: z.array(z.string().min(1)).min(1),
}).strict();
export type FeatureDescriptionByteVerificationV1 = z.infer<typeof FeatureDescriptionByteVerificationV1Schema>;

function sha256(bytes: Uint8Array): string {
	return createHash('sha256').update(bytes).digest('hex');
}

function digestHex(value: string): string {
	return value.replace(/^sha256:/i, '').toLowerCase();
}

export function verifyFeatureDescriptionSourceBytesV1(
	description: FeatureDescriptionV1,
	sourceBytesByEvidenceRef: ReadonlyMap<string, Uint8Array>,
): FeatureDescriptionByteVerificationV1 {
	const parsed = FeatureDescriptionV1Schema.parse(description);
	for (const evidence of parsed.evidence) {
		const bytes = sourceBytesByEvidenceRef.get(evidence.evidenceRef);
		if (!bytes) throw new Error(`FEATURE_DESCRIPTION_SOURCE_BYTES_MISSING:${evidence.evidenceRef}`);
		if (evidence.span.endByte > bytes.byteLength || evidence.span.startByte >= evidence.span.endByte) {
			throw new Error(`FEATURE_DESCRIPTION_SOURCE_SPAN_OUT_OF_BOUNDS:${evidence.evidenceRef}`);
		}
		if (sha256(bytes) !== digestHex(evidence.contentHash)) {
			throw new Error(`FEATURE_DESCRIPTION_SOURCE_DIGEST_MISMATCH:${evidence.evidenceRef}`);
		}
		const spanBytes = bytes.subarray(evidence.span.startByte, evidence.span.endByte);
		if (sha256(spanBytes) !== digestHex(evidence.spanDigest)) {
			throw new Error(`FEATURE_DESCRIPTION_SPAN_DIGEST_MISMATCH:${evidence.evidenceRef}`);
		}
	}
	return FeatureDescriptionByteVerificationV1Schema.parse({
		schema: 'atlas.feature-description-byte-verification.v1',
		status: 'BYTES_AND_SPANS_MATCHED',
		descriptionDigest: sha256(new TextEncoder().encode(JSON.stringify(parsed))),
		verifiedEvidenceRefs: parsed.evidence.map((item) => item.evidenceRef).sort(),
	});
}

export function buildFeatureDescriptionV1(input: {
	locator: EvidenceLocatorV1;
	featureRevision: string;
	summary: string;
	producer?: 'DETERMINISTIC' | 'DSPY_PROPOSAL';
	evidence: readonly FeatureDescriptionEvidenceV1[];
	relatedFiles?: FeatureDescriptionV1['relatedFiles'];
}): FeatureDescriptionV1 {
	const locator = EvidenceLocatorV1Schema.parse(input.locator);
	for (const [index, item] of input.evidence.entries()) {
		if (item.workspaceRevision !== locator.workspaceRevision) {
			throw new Error(`FEATURE_DESCRIPTION_WORKSPACE_REVISION_MISMATCH:${index}`);
		}
		if (item.canonicalId === locator.canonicalId && item.sourceRef === locator.sourceRef && item.sourceRevision !== locator.sourceRevision) {
			throw new Error(`FEATURE_DESCRIPTION_SOURCE_REVISION_MISMATCH:${index}`);
		}
	}
	const primaryEvidenceMatches = input.evidence.some((item) =>
		item.canonicalId === locator.canonicalId &&
		item.packetKey === locator.packetKey &&
		item.sourceRef === locator.sourceRef &&
		item.sourceRevision === locator.sourceRevision &&
		item.workspaceRevision === locator.workspaceRevision &&
		item.contentHash.toLowerCase() === locator.contentHash.toLowerCase() &&
		item.filePath === locator.filePath
	);
	if (!primaryEvidenceMatches) throw new Error('FEATURE_DESCRIPTION_PRIMARY_EVIDENCE_MISMATCH');
	return FeatureDescriptionV1Schema.parse({
		schema: 'atlas.feature-description.v1',
		canonicalId: locator.canonicalId,
		packetKey: locator.packetKey,
		sourceRef: locator.sourceRef,
		featureRevision: input.featureRevision,
		workspaceRevision: locator.workspaceRevision,
		summary: input.summary,
		status: 'PROPOSAL_ONLY',
		producer: input.producer ?? 'DETERMINISTIC',
		evidence: input.evidence,
		relatedFiles: input.relatedFiles ?? [],
	});
}
