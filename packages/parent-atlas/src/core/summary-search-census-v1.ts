import { z } from 'zod';

const sha256 = z.string().regex(/^sha256:[0-9a-f]{64}$/);
const nullableText = z.string().nullable();

export const summarySearchCensusRowV1Schema = z.object({
	schema: z.literal('atlas.summary-search-census-row.v1'),
	ordinal: z.number().int().nonnegative(),
	identity: z.object({
		chunkRowId: z.string().uuid(),
		canonicalChunkId: nullableText,
		packetKey: nullableText,
		sourceRef: nullableText,
		sourceRevision: nullableText,
		workspaceRevision: nullableText,
		observedSourceRef: nullableText,
		observedPacketKey: nullableText,
		state: z.enum(['REVISION_QUALIFIED', 'LEGACY_IDENTITY_UNQUALIFIED']),
	}).strict(),
	summary: z.object({
		source: z.literal('LEGACY_CHUNK_SUMMARY'),
		text: z.string().min(1),
		digest: sha256,
		byteLength: z.number().int().positive(),
		state: z.enum(['LEGACY_HINT_LINEAGE_BOUND', 'LEGACY_HINT_UNQUALIFIED', 'QUARANTINED', 'CONTAMINATED']),
		qualityClean: z.boolean(),
		quarantined: z.boolean(),
		detectorRevision: z.string().min(1),
	}).strict(),
	representation: z.object({
		representationId: z.literal('semantic_768'),
		canonicalSummaryVectorAvailable: z.literal(false),
		legacyVectorPresent: z.boolean(),
		hintRepresentationAvailable: z.boolean(),
		hintRepresentationRef: z.string().nullable(),
		hintVectorDigest: sha256.nullable(),
		representationRevision: z.string().nullable(),
	}).strict(),
	routing: z.object({
		domainClass: nullableText,
		language: nullableText,
		fileKind: nullableText,
		communityId: z.union([z.number().int(), z.null()]),
		clusterId: z.union([z.number().int(), z.null()]),
		somCell: z.tuple([z.number().int(), z.number().int()]).nullable(),
		pageRank: z.number().finite().nullable(),
		provenance: z.literal('UNVERSIONED_PROJECTION_HINT'),
	}).strict(),
	evidenceRefs: z.array(z.string().min(1)).min(1),
	canonicalAuthority: z.literal(false),
}).strict().superRefine((row, ctx) => {
	const qualified = row.identity.state === 'REVISION_QUALIFIED';
	const identityFields = [row.identity.canonicalChunkId, row.identity.packetKey, row.identity.sourceRef,
		row.identity.sourceRevision, row.identity.workspaceRevision];
	if (qualified && identityFields.some((value) => value === null)) {
		ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['identity'], message: 'REVISION_QUALIFIED requires the complete exact identity tuple' });
	}
	if (!qualified && identityFields.some((value) => value !== null)) {
		ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['identity'], message: 'Unqualified rows cannot carry canonical identity fields' });
	}
	if (row.summary.state === 'QUARANTINED' && !row.summary.quarantined) {
		ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['summary', 'quarantined'], message: 'QUARANTINED requires the persisted quarantine flag' });
	}
	if (row.summary.state === 'LEGACY_HINT_LINEAGE_BOUND' && !qualified) {
		ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['summary', 'state'], message: 'LEGACY_HINT_LINEAGE_BOUND requires exact current identity' });
	}
	if (row.summary.state === 'CONTAMINATED' && row.summary.qualityClean) {
		ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['summary', 'qualityClean'], message: 'CONTAMINATED cannot be marked qualityClean' });
	}
	if (row.representation.hintRepresentationAvailable !== (row.representation.hintRepresentationRef !== null && row.representation.hintVectorDigest !== null)) {
		ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['representation'], message: 'Hint representation availability requires an exact artifact reference and vector digest' });
	}
	if (Buffer.byteLength(row.summary.text, 'utf8') !== row.summary.byteLength) {
		ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['summary', 'byteLength'], message: 'byteLength must describe exact UTF-8 summary bytes' });
	}
});

export type SummarySearchCensusRowV1 = z.infer<typeof summarySearchCensusRowV1Schema>;
