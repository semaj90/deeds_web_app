import { createHash } from 'node:crypto';
import { z } from 'zod';
import { canonicalChunkV1Schema, type CanonicalChunkV1 } from './canonical-chunk-v1.js';

export const REPRESENTATION_DESCRIPTOR_V1 = 'atlas.representation-descriptor.v1' as const;

export const REPRESENTATION_KIND_VALUES = [
  'LEXICAL_FTS',
  'LEXICAL_TRIGRAM',
  'SPARSE_BM25',
  'SEMANTIC_768',
  'AST',
  'NLP',
  'ONTOLOGY',
  'GRAPH',
  'SUMMARY',
  'LOD',
  'OPENSPEC_TASK',
] as const;

export const representationKindSchema = z.enum(REPRESENTATION_KIND_VALUES);

const revision = z.string().min(1);
const sha256 = z.string().regex(/^sha256:[a-f0-9]{64}$/);

export const representationProjectionRefV1Schema = z.object({
  projectionKind: z.enum(['POSTGRES', 'QDRANT', 'NEO4J', 'VALKEY', 'BITFROST', 'CUVS', 'CUGRAPH', 'ARTIFACT']),
  locator: z.string().min(1),
  projectionRevision: revision.optional(),
  canonicalAuthority: z.literal(false).default(false),
}).strict();

export const representationDependencyV1Schema = z.object({
  dependencyKind: z.enum([
    'SOURCE_REVISION',
    'WORKSPACE_REVISION',
    'CHUNKER_REVISION',
    'PRODUCER_REVISION',
    'INPUT_REPRESENTATION_REVISION',
    'MODEL_REVISION',
    'POLICY_REVISION',
    'ONTOLOGY_REVISION',
    'GRAPH_REVISION',
  ]),
  dependencyId: z.string().min(1),
  revision,
}).strict();

export const representationDescriptorV1Schema = z.object({
  schema: z.literal(REPRESENTATION_DESCRIPTOR_V1).default(REPRESENTATION_DESCRIPTOR_V1),
  descriptorId: z.string().min(1),
  chunkDescriptorId: z.string().min(1),
  sourceRef: z.string().min(1),
  sourceRevision: revision,
  workspaceRevision: revision,
  kind: representationKindSchema,
  representationRevision: revision,
  producerId: z.string().min(1),
  producerRevision: revision,
  checksum: sha256,
  dependencies: z.array(representationDependencyV1Schema),
  projectionRefs: z.array(representationProjectionRefV1Schema).default([]),
  canonicalAuthority: z.literal(false).default(false),
}).strict();

export type RepresentationDescriptorV1 = z.infer<typeof representationDescriptorV1Schema>;
export type RepresentationDependencyV1 = z.infer<typeof representationDependencyV1Schema>;
export type RepresentationProjectionRefV1 = z.infer<typeof representationProjectionRefV1Schema>;

function hash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function normalizedDependencies(dependencies: readonly RepresentationDependencyV1[]): RepresentationDependencyV1[] {
  return [...dependencies]
    .map((dependency) => representationDependencyV1Schema.parse(dependency))
    .sort((a, b) =>
      a.dependencyKind.localeCompare(b.dependencyKind) ||
      a.dependencyId.localeCompare(b.dependencyId) ||
      a.revision.localeCompare(b.revision));
}

function normalizedProjectionRefs(refs: readonly RepresentationProjectionRefV1[]): RepresentationProjectionRefV1[] {
  return [...refs]
    .map((ref) => representationProjectionRefV1Schema.parse(ref))
    .sort((a, b) =>
      a.projectionKind.localeCompare(b.projectionKind) ||
      a.locator.localeCompare(b.locator) ||
      (a.projectionRevision ?? '').localeCompare(b.projectionRevision ?? ''));
}

export function representationLogicalKeyV1(input: Pick<RepresentationDescriptorV1,
  'chunkDescriptorId' | 'sourceRevision' | 'kind' | 'producerRevision'>): string {
  return [input.chunkDescriptorId, input.sourceRevision, input.kind, input.producerRevision].join('|');
}

export function buildRepresentationDescriptorV1(input: {
  chunk: CanonicalChunkV1;
  kind: z.infer<typeof representationKindSchema>;
  representationRevision: string;
  producerId: string;
  producerRevision: string;
  checksum: string;
  dependencies?: readonly RepresentationDependencyV1[];
  projectionRefs?: readonly RepresentationProjectionRefV1[];
}): RepresentationDescriptorV1 {
  const chunk = canonicalChunkV1Schema.parse(input.chunk);
  const dependencies = normalizedDependencies([
    { dependencyKind: 'SOURCE_REVISION', dependencyId: chunk.sourceRef, revision: chunk.sourceRevision },
    { dependencyKind: 'WORKSPACE_REVISION', dependencyId: 'workspace', revision: chunk.workspaceRevision },
    { dependencyKind: 'CHUNKER_REVISION', dependencyId: chunk.descriptorId, revision: chunk.chunkerRevision },
    { dependencyKind: 'PRODUCER_REVISION', dependencyId: input.producerId, revision: input.producerRevision },
    ...(input.dependencies ?? []),
  ]);
  const projectionRefs = normalizedProjectionRefs(input.projectionRefs ?? []);
  const logical = {
    chunkDescriptorId: chunk.descriptorId,
    sourceRevision: chunk.sourceRevision,
    kind: input.kind,
    producerRevision: input.producerRevision,
  };
  const descriptorId = `repr-desc:${hash([
    logical,
    input.representationRevision,
    input.checksum,
    dependencies,
    projectionRefs,
  ]).slice(0, 40)}`;

  return representationDescriptorV1Schema.parse({
    descriptorId,
    chunkDescriptorId: chunk.descriptorId,
    sourceRef: chunk.sourceRef,
    sourceRevision: chunk.sourceRevision,
    workspaceRevision: chunk.workspaceRevision,
    kind: input.kind,
    representationRevision: input.representationRevision,
    producerId: input.producerId,
    producerRevision: input.producerRevision,
    checksum: input.checksum,
    dependencies,
    projectionRefs,
    canonicalAuthority: false,
  });
}

export function registerRepresentationDescriptorsV1(
  descriptors: readonly RepresentationDescriptorV1[],
): Map<string, RepresentationDescriptorV1> {
  const registry = new Map<string, RepresentationDescriptorV1>();
  for (const raw of descriptors) {
    const descriptor = representationDescriptorV1Schema.parse(raw);
    const key = representationLogicalKeyV1(descriptor);
    const existing = registry.get(key);
    if (!existing) {
      registry.set(key, descriptor);
      continue;
    }
    if (JSON.stringify(existing) !== JSON.stringify(descriptor)) {
      throw new Error(`REPRESENTATION_LOGICAL_OWNER_CONFLICT:${key}`);
    }
  }
  return registry;
}

export function representationRegistryChecksumV1(descriptors: readonly RepresentationDescriptorV1[]): string {
  const normalized = [...registerRepresentationDescriptorsV1(descriptors).values()]
    .sort((a, b) => representationLogicalKeyV1(a).localeCompare(representationLogicalKeyV1(b)));
  return `sha256:${hash(normalized)}`;
}
