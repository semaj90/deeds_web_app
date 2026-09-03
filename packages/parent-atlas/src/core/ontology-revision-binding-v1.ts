import { z } from 'zod';

const id = z.string().min(1);
const checksum = z.string().regex(/^[a-f0-9]{64}$/);

/** Explicit, non-canonical binding for an ontology artifact and vocabulary. */
export const ontologyRevisionBindingV1Schema = z.object({
  schema: z.literal('atlas.ontology-revision-binding.v1').default('atlas.ontology-revision-binding.v1'),
  ontologyId: id,
  ontologyRevision: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  schemaId: id,
  schemaChecksum: checksum,
  mappingRevision: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  evidenceRefs: z.array(id).min(1),
  status: z.enum(['DECLARED', 'PROVEN']).default('DECLARED'),
  canonicalAuthority: z.literal(false).default(false),
}).strict();

export type OntologyRevisionBindingV1 = z.infer<typeof ontologyRevisionBindingV1Schema>;

export function buildOntologyRevisionBindingV1(input: {
  ontologyId: string;
  ontologyRevision: string;
  schemaId: string;
  schemaChecksum: string;
  mappingRevision: string;
  evidenceRefs: string[];
  status?: 'DECLARED' | 'PROVEN';
}): OntologyRevisionBindingV1 {
  return ontologyRevisionBindingV1Schema.parse({
    schema: 'atlas.ontology-revision-binding.v1',
    ...input,
    status: input.status ?? 'DECLARED',
    canonicalAuthority: false,
  });
}
