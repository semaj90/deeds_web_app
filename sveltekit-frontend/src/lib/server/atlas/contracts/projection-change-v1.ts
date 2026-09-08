import { createHash } from 'node:crypto';
import { z } from 'zod';

const revision = z.string().min(1);
const checksum = z.string().regex(/^[a-f0-9]{64}$/i);

export const ProjectionChangeV1Schema = z.object({
  schema: z.literal('atlas.projection-change.v1'),
  eventId: z.string().uuid(),
  aggregateType: z.string().min(1),
  aggregateId: z.string().uuid(),
  workspaceRevision: revision,
  sourceRevision: revision,
  graphRevision: revision,
  representationRevision: revision,
  featureRevision: revision,
  stageReceiptChecksum: checksum,
  changedPacketKeys: z.array(z.string().min(1)).min(1),
  candidateOrdinals: z.array(z.number().int().nonnegative()),
  projections: z.array(z.enum(['SEMANTIC', 'GRAPH', 'CENTROID', 'CACHE', 'ONTOLOGY', 'HYPERGRAPH'])).min(1),
  canonicalAuthority: z.literal(false),
  eventChecksum: checksum,
});

export type ProjectionChangeV1 = z.infer<typeof ProjectionChangeV1Schema>;
type ProjectionChangeInput = Omit<ProjectionChangeV1, 'schema' | 'canonicalAuthority' | 'eventChecksum'>;

function canonicalJson(value: unknown): string {
  return JSON.stringify(value, (_key, item) => {
    if (item && typeof item === 'object' && !Array.isArray(item)) {
      return Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b)));
    }
    return item;
  });
}

export function createProjectionChangeV1(input: ProjectionChangeInput): ProjectionChangeV1 {
  const base = { ...input, schema: 'atlas.projection-change.v1' as const, canonicalAuthority: false as const };
  const eventChecksum = createHash('sha256').update(canonicalJson(base)).digest('hex');
  return ProjectionChangeV1Schema.parse({ ...base, eventChecksum });
}

export function verifyProjectionChangeV1(value: unknown): boolean {
  const parsed = ProjectionChangeV1Schema.safeParse(value);
  if (!parsed.success) return false;
  const { eventChecksum, ...base } = parsed.data;
  return eventChecksum === createHash('sha256').update(canonicalJson(base)).digest('hex');
}
