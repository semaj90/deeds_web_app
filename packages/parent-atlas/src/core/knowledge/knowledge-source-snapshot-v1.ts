import { z } from 'zod';
import { sha256HexV1 } from './stable-json-v1.js';

const id = z.string().trim().min(1);
const revision = z.string().trim().min(1);
const sha256Hex = z.string().regex(/^[a-f0-9]{64}$/);

export const knowledgeSourceSnapshotV1Schema = z.object({
  schema: z.literal('atlas.knowledge-source-snapshot.v1').default('atlas.knowledge-source-snapshot.v1'),
  snapshotRevision: revision,
  workspaceRevision: revision,
  sources: z.array(z.object({ sourceRef: id, sourceRevision: revision, sourceContentChecksum: sha256Hex }).strict()),
  openspecRevision: revision,
  testRevision: revision,
  reportRevisions: z.array(revision),
  rawWorktreeFingerprint: sha256Hex.nullable(),
  sourceSetChecksum: sha256Hex,
  canonicalAuthority: z.literal(false).default(false),
}).strict();
export type KnowledgeSourceSnapshotV1 = z.infer<typeof knowledgeSourceSnapshotV1Schema>;

export function buildKnowledgeSourceSnapshotV1(
  input: Omit<KnowledgeSourceSnapshotV1, 'schema' | 'sourceSetChecksum' | 'canonicalAuthority'>,
): KnowledgeSourceSnapshotV1 {
  const sources = [...input.sources].sort((a, b) => a.sourceRef.localeCompare(b.sourceRef) || a.sourceRevision.localeCompare(b.sourceRevision));
  const reportRevisions = [...input.reportRevisions].sort();
  const checksumBody = { workspaceRevision: input.workspaceRevision, sources, openspecRevision: input.openspecRevision, testRevision: input.testRevision, reportRevisions };
  const body = { schema: 'atlas.knowledge-source-snapshot.v1' as const, ...input, sources, reportRevisions, sourceSetChecksum: sha256HexV1(checksumBody), canonicalAuthority: false as const };
  return knowledgeSourceSnapshotV1Schema.parse(body);
}
