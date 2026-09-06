import { z } from 'zod';
import { sha256HexV1, sha256TextV1 } from './stable-json-v1.js';

const id = z.string().trim().min(1);
const revision = z.string().trim().min(1);
const sha256Hex = z.string().regex(/^[a-f0-9]{64}$/);

export const knowledgePageJobV1Schema = z.object({
  schema: z.literal('atlas.knowledge-page-job.v1').default('atlas.knowledge-page-job.v1'),
  jobId: id,
  pageId: id,
  path: id,
  title: id,
  purpose: id,
  sourceSetChecksum: sha256Hex,
  relatedPageIds: z.array(id),
  instructions: z.array(id),
  status: z.enum(['PENDING', 'SKIPPED', 'COMPLETE']),
  completedBy: id.nullable().default(null),
}).strict();
export type KnowledgePageJobV1 = z.infer<typeof knowledgePageJobV1Schema>;

export const knowledgePageSnapshotV1Schema = z.object({
  schema: z.literal('atlas.knowledge-page-snapshot.v1').default('atlas.knowledge-page-snapshot.v1'),
  runId: id,
  jobId: id,
  pageId: id,
  beforePageChecksum: sha256Hex.nullable(),
  beforeClaimSetChecksum: sha256Hex.nullable(),
  beforePageArtifactRef: id.nullable(),
  beforeClaimArtifactRef: id.nullable(),
  snapshotChecksum: sha256Hex,
  canonicalAuthority: z.literal(false).default(false),
}).strict();
export type KnowledgePageSnapshotV1 = z.infer<typeof knowledgePageSnapshotV1Schema>;

export function buildKnowledgePageSnapshotV1(
  input: Omit<KnowledgePageSnapshotV1, 'schema' | 'snapshotChecksum' | 'canonicalAuthority'>,
): KnowledgePageSnapshotV1 {
  const body = { schema: 'atlas.knowledge-page-snapshot.v1' as const, ...input, canonicalAuthority: false as const };
  return knowledgePageSnapshotV1Schema.parse({ ...body, snapshotChecksum: sha256HexV1(body) });
}

export const knowledgePageManifestEntryV1Schema = z.object({
  schema: z.literal('atlas.knowledge-page-manifest-entry.v1').default('atlas.knowledge-page-manifest-entry.v1'),
  pageId: id,
  path: id,
  workspaceRevision: revision,
  sourceSnapshotRevision: revision,
  sourceSetChecksum: sha256Hex,
  pageRevision: revision,
  pageChecksum: sha256Hex,
  claimSetChecksum: sha256Hex,
  claimCount: z.number().int().nonnegative(),
  verificationReceiptChecksum: sha256Hex,
  completedRunId: id,
  completedBy: id,
  status: z.enum(['CURRENT', 'STALE', 'UNRESOLVED']),
  canonicalAuthority: z.literal(false).default(false),
}).strict();
export type KnowledgePageManifestEntryV1 = z.infer<typeof knowledgePageManifestEntryV1Schema>;

export function isKnowledgePageManifestCurrentV1(input: {
  entry: KnowledgePageManifestEntryV1;
  workspaceRevision: string;
  sourceSnapshotRevision: string;
  sourceSetChecksum: string;
  pageMarkdown: string;
  claimSetChecksum: string;
  verificationReceiptChecksum: string;
}): boolean {
  const entry = knowledgePageManifestEntryV1Schema.parse(input.entry);
  return (
    entry.status === 'CURRENT' &&
    entry.workspaceRevision === input.workspaceRevision &&
    entry.sourceSnapshotRevision === input.sourceSnapshotRevision &&
    entry.sourceSetChecksum === input.sourceSetChecksum &&
    entry.pageChecksum === sha256TextV1(input.pageMarkdown) &&
    entry.claimSetChecksum === input.claimSetChecksum &&
    entry.verificationReceiptChecksum === input.verificationReceiptChecksum
  );
}
