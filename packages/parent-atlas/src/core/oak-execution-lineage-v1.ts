import { createHash } from 'node:crypto';
import { z } from 'zod';
import { dagActionKindSchema } from './adaptive-dag-plan-v1.js';

const id = z.string().min(1);
const revision = z.string().min(1);
const sha256Hex = z.string().regex(/^[a-f0-9]{64}$/);

function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    return Object.keys(value as Record<string, unknown>)
      .sort()
      .reduce<Record<string, unknown>>((out, key) => {
        out[key] = stable((value as Record<string, unknown>)[key]);
        return out;
      }, {});
  }
  return value;
}

export function checksumOakExecutionValueV1(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(stable(value)), 'utf8').digest('hex');
}

export const oakExecutionLineageV1Schema = z.object({
  schema: z.literal('atlas.oak-execution-lineage.v1'),
  requestId: id,
  kernelRevision: revision,
  functionRevision: revision,
  contextManifestChecksum: sha256Hex,
  candidateSnapshotRevision: revision,
  candidateOrdinalMapChecksum: sha256Hex,
  workspaceRevision: revision,
  sourceRevisionSetChecksum: sha256Hex,
  evidenceRevisionSetChecksum: sha256Hex,
  graphRevision: revision.nullable(),
  representationRevision: revision.nullable(),
  producerRevision: revision,
  canonicalAuthority: z.literal(false),
}).strict();

export type OakExecutionLineageV1 = z.infer<typeof oakExecutionLineageV1Schema>;

export function buildOakExecutionLineageV1(
  input: Omit<OakExecutionLineageV1, 'schema' | 'canonicalAuthority'>,
): OakExecutionLineageV1 {
  return oakExecutionLineageV1Schema.parse({
    schema: 'atlas.oak-execution-lineage.v1',
    ...input,
    canonicalAuthority: false,
  });
}

export const dagExecutionCacheIdentityV1Schema = z.object({
  schema: z.literal('atlas.dag-execution-cache-identity.v1'),
  actionKind: dagActionKindSchema,
  implementationRef: id,
  handlerRevision: revision,
  inputChecksum: sha256Hex,
  outputContract: id,
  contextManifestChecksum: sha256Hex,
  candidateSnapshotRevision: revision,
  candidateOrdinalMapChecksum: sha256Hex,
  workspaceRevision: revision,
  sourceRevisionSetChecksum: sha256Hex,
  evidenceRevisionSetChecksum: sha256Hex,
  graphRevision: revision.nullable(),
  representationRevision: revision.nullable(),
  policyRevision: revision,
  canonicalAuthority: z.literal(false),
}).strict();

export type DagExecutionCacheIdentityV1 = z.infer<typeof dagExecutionCacheIdentityV1Schema>;

export function buildDagExecutionCacheIdentityV1(
  input: Omit<DagExecutionCacheIdentityV1, 'schema' | 'canonicalAuthority'>,
): DagExecutionCacheIdentityV1 {
  return dagExecutionCacheIdentityV1Schema.parse({
    schema: 'atlas.dag-execution-cache-identity.v1',
    ...input,
    canonicalAuthority: false,
  });
}

export function buildDagExecutionCacheKeyV1(identity: DagExecutionCacheIdentityV1): string {
  const parsed = dagExecutionCacheIdentityV1Schema.parse(identity);
  return `bitfrost:oak-dag:v1:${checksumOakExecutionValueV1(parsed)}`;
}
