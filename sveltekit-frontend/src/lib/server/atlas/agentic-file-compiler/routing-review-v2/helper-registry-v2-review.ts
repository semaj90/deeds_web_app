import { z } from 'zod';
import { DEFAULT_ROUTER_MATRIX } from '../../../retrieval/router-matrix.js';
import type { LogicalRetrievalLane } from '../../../retrieval/search-runtime.js';
import type { SignalType } from '../../../retrieval/router-matrix.js';
import { sha256Stable } from '../contracts.js';

/** Isolated review candidate. Not exported through the AFC production index. */
export const HELPER_REGISTRY_REVIEW_SCHEMA = 'atlas.helper-registry.review.v2' as const;
const logicalLaneValues: Record<LogicalRetrievalLane, true> = {
	dense: true, lexical: true, exact: true, ast: true, schema: true, rg: true, bm42: true,
};
export const REVIEW_LOGICAL_LANES = Object.keys(logicalLaneValues) as [LogicalRetrievalLane, ...LogicalRetrievalLane[]];
export const ReviewLogicalLaneSchema = z.enum(REVIEW_LOGICAL_LANES);
export const ReviewRouterSignalSchema = z.custom<SignalType>((value) =>
	typeof value === 'string' && Object.hasOwn(DEFAULT_ROUTER_MATRIX, value),
);
export const ReviewExecutorKindSchema = z.enum(['CLI_SUBPROCESS', 'NODE_IN_PROCESS', 'HTTP_SERVICE', 'PYTHON_SCRIPT', 'LSP_SERVER']);
export const ReviewCostClassSchema = z.enum(['CHEAP', 'MEDIUM', 'EXPENSIVE']);

export const HelperRegistryEntryReviewV2Schema = z.object({
	helperId: z.string().min(1),
	helperRevision: z.string().regex(/^[a-f0-9]{64}$/),
	logicalLane: ReviewLogicalLaneSchema,
	executor: z.object({
		kind: ReviewExecutorKindSchema,
		id: z.string().min(1),
		ownerRef: z.string().min(1),
	}).strict(),
	ownerProofRefs: z.array(z.string().min(1)).min(1),
	routerSignal: ReviewRouterSignalSchema.nullable(),
	intents: z.array(z.string().min(1)),
	languages: z.array(z.string().min(1)),
	requires: z.array(z.string().min(1)),
	produces: z.array(z.string().min(1)),
	costClass: ReviewCostClassSchema,
	mutationClass: z.literal('READ_ONLY'),
}).strict();
export type HelperRegistryEntryReviewV2 = z.infer<typeof HelperRegistryEntryReviewV2Schema>;

export const HelperRegistryReviewV2Schema = z.object({
	schema: z.literal(HELPER_REGISTRY_REVIEW_SCHEMA),
	helperRegistryRevision: z.string().min(1),
	entries: z.array(HelperRegistryEntryReviewV2Schema).min(1),
	canonicalAuthority: z.literal(false),
	writesPerformed: z.literal(false),
	checksum: z.string().regex(/^[a-f0-9]{64}$/),
}).strict().superRefine((registry, ctx) => {
	const ids = new Set<string>();
	registry.entries.forEach((entry, index) => {
		if (ids.has(entry.helperId)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['entries', index, 'helperId'], message: `DUPLICATE_HELPER_ID:${entry.helperId}` });
		ids.add(entry.helperId);
	});
});
export type HelperRegistryReviewV2 = z.infer<typeof HelperRegistryReviewV2Schema>;

type HelperRegistryEntryInput = Omit<HelperRegistryEntryReviewV2, 'helperRevision'>;

export function buildHelperRegistryReviewV2(input: {
	helperRegistryRevision: string;
	entries: readonly HelperRegistryEntryInput[];
}): HelperRegistryReviewV2 {
	const entries = input.entries.map((entry) => {
		const canonicalEntry = {
			...entry,
			ownerProofRefs: [...new Set(entry.ownerProofRefs)].sort(),
			intents: [...new Set(entry.intents)].sort(),
			languages: [...new Set(entry.languages)].sort(),
			requires: [...new Set(entry.requires)].sort(),
			produces: [...new Set(entry.produces)].sort(),
		};
		return HelperRegistryEntryReviewV2Schema.parse({ ...canonicalEntry, helperRevision: sha256Stable(canonicalEntry) });
	}).sort((a, b) => a.helperId < b.helperId ? -1 : a.helperId > b.helperId ? 1 : 0);
	const body = {
		schema: HELPER_REGISTRY_REVIEW_SCHEMA,
		helperRegistryRevision: input.helperRegistryRevision,
		entries,
		canonicalAuthority: false as const,
		writesPerformed: false as const,
	};
	return HelperRegistryReviewV2Schema.parse({ ...body, checksum: sha256Stable(body) });
}

export function assertHelperRegistryReviewV2(value: HelperRegistryReviewV2): HelperRegistryReviewV2 {
	const registry = HelperRegistryReviewV2Schema.parse(value);
	const { checksum, ...body } = registry;
	if (sha256Stable(body) !== checksum) throw new Error('HELPER_REGISTRY_REVIEW_CHECKSUM_MISMATCH');
	return registry;
}
