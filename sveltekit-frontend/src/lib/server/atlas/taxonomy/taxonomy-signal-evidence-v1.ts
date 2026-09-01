import { createHash } from 'node:crypto';
import { z } from 'zod';

const revision = z.string().min(1);

export const TaxonomySignalKindV1Schema = z.enum([
	'semantic',
	'lexical',
	'graph',
	'community',
	'nlp',
]);
export type TaxonomySignalKindV1 = z.infer<typeof TaxonomySignalKindV1Schema>;

export const TaxonomySignalEvidenceV1Schema = z.object({
	schema: z.literal('atlas.taxonomy-signal-evidence.v1'),
	signalKind: TaxonomySignalKindV1Schema,
	score: z.number().finite().min(0).max(1),
	evidenceRefs: z.array(z.string().min(1)).min(1),
	producerRevision: revision,
	workspaceRevision: revision,
	sourceRevision: revision.nullable(),
	graphRevision: revision.nullable(),
	checksum: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();
export type TaxonomySignalEvidenceV1 = z.infer<typeof TaxonomySignalEvidenceV1Schema>;

function sha256(value: unknown): string {
	return createHash('sha256').update(JSON.stringify(value), 'utf8').digest('hex');
}

export function buildTaxonomySignalEvidenceV1(input: Omit<TaxonomySignalEvidenceV1, 'schema' | 'checksum'>): TaxonomySignalEvidenceV1 {
	const body = {
		schema: 'atlas.taxonomy-signal-evidence.v1' as const,
		...input,
	};
	return TaxonomySignalEvidenceV1Schema.parse({ ...body, checksum: sha256(body) });
}
