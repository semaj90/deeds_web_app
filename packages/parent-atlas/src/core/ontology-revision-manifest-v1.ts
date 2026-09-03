import { createHash } from 'node:crypto';
import { z } from 'zod';

const id = z.string().min(1);
const checksum = z.string().regex(/^[a-f0-9]{64}$/);

export const ontologyRevisionManifestV1Schema = z.object({
  schema: z.literal('atlas.ontology-revision-manifest.v1').default('atlas.ontology-revision-manifest.v1'),
  ontologyId: id,
  ontologyRevision: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  schemaId: id,
  schemaChecksum: checksum,
  mappingRevision: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  admittedClassIds: z.array(id),
  producerRevision: id,
  status: z.enum(['DECLARED', 'PROVEN']).default('DECLARED'),
  canonicalAuthority: z.literal(false).default(false),
}).strict();

export type OntologyRevisionManifestV1 = z.infer<typeof ontologyRevisionManifestV1Schema>;

function stableJson(value: unknown): string {
  return JSON.stringify(value, (_key, item) => {
    if (item && typeof item === 'object' && !Array.isArray(item)) {
      return Object.keys(item as Record<string, unknown>).sort().reduce<Record<string, unknown>>((out, key) => {
        out[key] = (item as Record<string, unknown>)[key];
        return out;
      }, {});
    }
    return item;
  });
}

function sha256(value: unknown): string {
  return createHash('sha256').update(stableJson(value), 'utf8').digest('hex');
}

export function buildOntologyRevisionManifestV1(input: {
  ontologyId: string;
  schemaId: string;
  schemaChecksum: string;
  mappingRevision: string;
  admittedClassIds: string[];
  producerRevision: string;
  status?: 'DECLARED' | 'PROVEN';
}): OntologyRevisionManifestV1 {
  const body = {
    schema: 'atlas.ontology-revision-manifest.v1' as const,
    ontologyId: input.ontologyId,
    schemaId: input.schemaId,
    schemaChecksum: input.schemaChecksum,
    mappingRevision: input.mappingRevision,
    admittedClassIds: [...input.admittedClassIds].sort(),
    producerRevision: input.producerRevision,
    status: input.status ?? 'DECLARED' as const,
    canonicalAuthority: false as const,
  };
  return ontologyRevisionManifestV1Schema.parse({ ...body, ontologyRevision: `sha256:${sha256(body)}` });
}
