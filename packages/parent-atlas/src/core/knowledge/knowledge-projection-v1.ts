import { z } from 'zod';
import { sha256HexV1, sha256TextV1 } from './stable-json-v1.js';

const id = z.string().trim().min(1);
const revision = z.string().trim().min(1);
const sha256Hex = z.string().regex(/^[a-f0-9]{64}$/);

export const knowledgeGeneratedProvenanceV1Schema = z.object({
  schema: z.literal('atlas.knowledge-generated-provenance.v1').default('atlas.knowledge-generated-provenance.v1'),
  pageId: id,
  bodyChecksum: sha256Hex,
  generatedBy: id,
  runId: id,
  programRevision: revision,
  modelRevision: revision,
  generatedAt: z.string().datetime(),
  canonicalAuthority: z.literal(false).default(false),
}).strict();
export type KnowledgeGeneratedProvenanceV1 = z.infer<typeof knowledgeGeneratedProvenanceV1Schema>;

export function reconcileKnowledgeGeneratedProvenanceV1(input: {
  pageId: string;
  beforeBody: string | null;
  afterBody: string;
  previous: KnowledgeGeneratedProvenanceV1 | null;
  generatedBy: string;
  runId: string;
  programRevision: string;
  modelRevision: string;
  generatedAt: string;
}): KnowledgeGeneratedProvenanceV1 | null {
  const beforeChecksum = input.beforeBody === null ? null : sha256TextV1(input.beforeBody);
  const afterChecksum = sha256TextV1(input.afterBody);
  if (beforeChecksum === afterChecksum) return input.previous;
  return knowledgeGeneratedProvenanceV1Schema.parse({
    schema: 'atlas.knowledge-generated-provenance.v1',
    pageId: input.pageId,
    bodyChecksum: afterChecksum,
    generatedBy: input.generatedBy,
    runId: input.runId,
    programRevision: input.programRevision,
    modelRevision: input.modelRevision,
    generatedAt: input.generatedAt,
    canonicalAuthority: false,
  });
}

export interface KnowledgeOkfSourceV1 { id: string; resource: string; producer?: string }
export interface KnowledgeVerificationEventV1 { by: string; at?: string; receiptChecksum?: string }

function ownedSourceId(resource: string): string {
  return `parent-atlas-source-${sha256TextV1(resource).slice(0, 24)}`;
}

export function reconcileKnowledgeOkfSourcesV1(
  current: readonly KnowledgeOkfSourceV1[],
  evidenceResources: readonly string[],
): KnowledgeOkfSourceV1[] {
  const retained = current.filter((entry) => !entry.id.startsWith('parent-atlas-source-'));
  const retainedResources = new Set(retained.map((entry) => entry.resource));
  const projected = [...new Set(evidenceResources)]
    .sort()
    .filter((resource) => !retainedResources.has(resource))
    .map((resource) => ({ id: ownedSourceId(resource), resource, producer: 'parent-atlas/knowledge-fabric-v1' }));
  return [...retained, ...projected];
}

export function reconcileKnowledgeVerificationEventsV1(
  current: readonly KnowledgeVerificationEventV1[],
  active: KnowledgeVerificationEventV1 | null,
): KnowledgeVerificationEventV1[] {
  const retained = current.filter((event) => !event.by.startsWith('parent-atlas/'));
  return active ? [...retained, { ...active }] : retained;
}

export const knowledgeIndexV1Schema = z.object({
  schema: z.literal('atlas.knowledge-index.v1').default('atlas.knowledge-index.v1'),
  knowledgeRevision: revision,
  pages: z.array(z.object({ pageId: id, path: id, title: id, description: z.string(), claimCount: z.number().int().nonnegative(), verifiedClaimCount: z.number().int().nonnegative() }).strict()),
  indexChecksum: sha256Hex,
  canonicalAuthority: z.literal(false).default(false),
}).strict();
export type KnowledgeIndexV1 = z.infer<typeof knowledgeIndexV1Schema>;

export function buildKnowledgeIndexV1(input: Omit<KnowledgeIndexV1, 'schema' | 'indexChecksum' | 'canonicalAuthority'>): KnowledgeIndexV1 {
  const pages = [...input.pages].sort((a, b) => a.path.localeCompare(b.path));
  const body = { schema: 'atlas.knowledge-index.v1' as const, knowledgeRevision: input.knowledgeRevision, pages, canonicalAuthority: false as const };
  return knowledgeIndexV1Schema.parse({ ...body, indexChecksum: sha256HexV1(body) });
}

export const knowledgeGraphProjectionV1Schema = z.object({
  schema: z.literal('atlas.knowledge-graph-projection.v1').default('atlas.knowledge-graph-projection.v1'),
  knowledgeRevision: revision,
  nodes: z.array(z.object({ nodeKey: id, nodeClass: z.enum(['KNOWLEDGE_PAGE', 'CLAIM', 'EVIDENCE', 'CONCEPT', 'OPENSPEC', 'RECEIPT', 'SOURCE']) }).strict()),
  edges: z.array(z.object({ sourceNodeKey: id, targetNodeKey: id, edgeType: z.enum(['ASSERTS', 'LINKS_TO', 'GENERATED_BY', 'GROUNDED_IN', 'MAPS_TO', 'PROMOTED_AS']) }).strict()),
  projectionChecksum: sha256Hex,
  canonicalAuthority: z.literal(false).default(false),
  writesPerformed: z.literal(false).default(false),
}).strict();
export type KnowledgeGraphProjectionV1 = z.infer<typeof knowledgeGraphProjectionV1Schema>;

export function buildKnowledgeGraphProjectionV1(input: Omit<KnowledgeGraphProjectionV1, 'schema' | 'projectionChecksum' | 'canonicalAuthority' | 'writesPerformed'>): KnowledgeGraphProjectionV1 {
  const nodes = [...input.nodes].sort((a, b) => a.nodeKey.localeCompare(b.nodeKey));
  const edges = [...input.edges].sort((a, b) => `${a.sourceNodeKey}:${a.edgeType}:${a.targetNodeKey}`.localeCompare(`${b.sourceNodeKey}:${b.edgeType}:${b.targetNodeKey}`));
  const body = { schema: 'atlas.knowledge-graph-projection.v1' as const, knowledgeRevision: input.knowledgeRevision, nodes, edges, canonicalAuthority: false as const, writesPerformed: false as const };
  return knowledgeGraphProjectionV1Schema.parse({ ...body, projectionChecksum: sha256HexV1(body) });
}
