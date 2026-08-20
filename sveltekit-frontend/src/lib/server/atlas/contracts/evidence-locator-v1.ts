import { z } from 'zod';

/**
 * EvidenceLocatorV1 keeps identity, physical location, and domain classification
 * separate. Do NOT create a composite source_ref_domain_class_url identifier.
 *
 * - sourceRef: stable source identity used by Parent Atlas joins/provenance.
 * - filePath/sourceUrl: optional physical locator facets.
 * - domain: revisioned derived classification, never part of source identity.
 */
export const DomainClassificationRefV1Schema = z
	.object({
		taxonomyRevision: z.string().min(1),
		labels: z.array(z.string().min(1)).min(1),
		evidenceRefs: z.array(z.string().min(1)).min(1),
		producerRevision: z.string().min(1),
	})
	.strict();

export const SourceSpanV1Schema = z
	.object({
		startByte: z.number().int().nonnegative(),
		endByte: z.number().int().nonnegative(),
	})
	.strict()
	.superRefine((span, ctx) => {
		if (span.endByte < span.startByte) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				path: ['endByte'],
				message: 'endByte must be >= startByte',
			});
		}
	});

export const EvidenceLocatorV1Schema = z
	.object({
		schema: z.literal('atlas.evidence-locator.v1'),
		canonicalId: z.string().min(1),
		packetKey: z.string().min(1).nullable(),
		sourceRef: z.string().min(1),
		sourceKind: z.enum(['code_file', 'document', 'url', 'generated', 'unknown']),
		filePath: z.string().min(1).nullable(),
		sourceUrl: z.string().url().nullable(),
		contentHash: z.string().min(1),
		workspaceRevision: z.string().min(1),
		sourceRevision: z.string().min(1),
		span: SourceSpanV1Schema.nullable(),
		domain: DomainClassificationRefV1Schema.nullable(),
	})
	.strict()
	.superRefine((locator, ctx) => {
		if (locator.sourceKind === 'code_file' && !locator.filePath) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				path: ['filePath'],
				message: 'code_file evidence requires filePath',
			});
		}
		if (locator.sourceKind === 'url' && !locator.sourceUrl) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				path: ['sourceUrl'],
				message: 'url evidence requires sourceUrl',
			});
		}
	});

export type DomainClassificationRefV1 = z.infer<typeof DomainClassificationRefV1Schema>;
export type EvidenceLocatorV1 = z.infer<typeof EvidenceLocatorV1Schema>;

export function parseEvidenceLocatorV1(value: unknown): EvidenceLocatorV1 {
	return EvidenceLocatorV1Schema.parse(value);
}
