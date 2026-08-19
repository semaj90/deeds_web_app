import { z } from 'zod';
import {
	PageRankAlgorithmFamilySchema,
	PageRankExecutorIdSchema,
	PageRankVariantSchema,
} from './pagerank-execution-contract.js';

const finiteNonNegative = z.number().finite().nonnegative();

export const PageRankAuthorityV2Schema = z
	.object({
		schema: z.literal('atlas.pagerank-authority.v2'),
		runId: z.string().min(1),
		algorithmFamily: PageRankAlgorithmFamilySchema,
		algorithm: PageRankVariantSchema,
		executorId: PageRankExecutorIdSchema,
		canonicalId: z.string().min(1),
		packetKey: z.string().min(1).nullable().default(null),
		sourceRef: z.string().min(1).nullable().default(null),
		graphRevision: z.string().min(1),
		projectionRevision: z.string().min(1),
		projectionHash: z.string().min(1),
		projectionName: z.string().min(1),
		pagerankRaw: finiteNonNegative,
		pagerankL1: z.number().finite().min(0).max(1),
		authorityPercentile: z.number().finite().min(0).max(1),
		authorityNorm: z.number().finite().min(0).max(1),
		normalization: z.literal('ATLAS_L1_POSTPROCESS_V1'),
		producerRevision: z.string().min(1),
		createdAt: z.string().datetime(),
	})
	.strict()
	.superRefine((record, ctx) => {
		if (Math.abs(record.authorityNorm - record.authorityPercentile) > 1e-12) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				path: ['authorityNorm'],
				message: 'authorityNorm must equal authorityPercentile for v2',
			});
		}
	});
export type PageRankAuthorityV2 = z.infer<typeof PageRankAuthorityV2Schema>;

export const PageRankAuthorityBatchV2Schema = z
	.object({
		schema: z.literal('atlas.pagerank-authority-batch.v2'),
		runId: z.string().min(1),
		graphRevision: z.string().min(1),
		projectionRevision: z.string().min(1),
		projectionHash: z.string().min(1),
		projectionName: z.string().min(1),
		normalization: z.literal('ATLAS_L1_POSTPROCESS_V1'),
		records: z.array(PageRankAuthorityV2Schema).min(1),
	})
	.strict()
	.superRefine((batch, ctx) => {
		const ids = new Set<string>();
		let l1 = 0;
		for (const [index, record] of batch.records.entries()) {
			for (const field of ['runId','graphRevision','projectionRevision','projectionHash','projectionName'] as const) {
				if (record[field] !== batch[field]) {
					ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['records', index, field], message: `${field} must match batch` });
				}
			}
			if (ids.has(record.canonicalId)) {
				ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['records', index, 'canonicalId'], message: 'duplicate canonicalId' });
			}
			ids.add(record.canonicalId);
			l1 += Math.abs(record.pagerankL1);
		}
		if (Math.abs(l1 - 1) > 1e-6) {
			ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['records'], message: `pagerankL1 must sum to 1 ± 1e-6, got ${l1}` });
		}
	});
export type PageRankAuthorityBatchV2 = z.infer<typeof PageRankAuthorityBatchV2Schema>;
