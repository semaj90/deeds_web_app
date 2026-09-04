import { createHash } from 'node:crypto';
import { z } from 'zod';
import { BifrostCacheManager } from '$lib/server/ai/bifrost-cache-manager.js';

const revision = z.string().min(1);
const sha256Hex = z.string().regex(/^[a-f0-9]{64}$/);

export const oakDagBitfrostCacheIdentityV1Schema = z.object({
  schema: z.literal('atlas.oak-dag-bitfrost-cache-identity.v1'),
  implementationRef: z.string().min(1),
  handlerRevision: revision,
  inputChecksum: sha256Hex,
  outputContract: z.string().min(1),
  contextManifestChecksum: sha256Hex,
  candidateSnapshotRevision: revision,
  candidateOrdinalMapChecksum: sha256Hex,
  workspaceRevision: revision,
  sourceRevisionSetChecksum: sha256Hex,
  evidenceRevisionSetChecksum: sha256Hex,
  graphRevision: revision.nullable(),
  representationRevision: revision.nullable(),
  cachePolicyRevision: revision,
  canonicalAuthority: z.literal(false),
}).strict();

export type OakDagBitfrostCacheIdentityV1 = z.infer<typeof oakDagBitfrostCacheIdentityV1Schema>;

export type OakDagBitfrostCacheRecordV1<T = unknown> = Readonly<{
  schema: 'atlas.oak-dag-bitfrost-cache-record.v1';
  cacheIdentity: OakDagBitfrostCacheIdentityV1;
  cacheIdentityChecksum: string;
  outputChecksum: string;
  value: T;
  writesPerformed: false;
  canonicalAuthority: false;
}>;

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

function checksum(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(stable(value)), 'utf8').digest('hex');
}

export function buildOakDagBitfrostCacheKeyV1(identity: OakDagBitfrostCacheIdentityV1): string {
  const parsed = oakDagBitfrostCacheIdentityV1Schema.parse(identity);
  return `oak-dag:${checksum(parsed)}`;
}

/** Read-through only: a miss or malformed record returns null and the owner executes normally. */
export async function getOakDagBitfrostCacheV1<T = unknown>(
  identity: OakDagBitfrostCacheIdentityV1,
): Promise<OakDagBitfrostCacheRecordV1<T> | null> {
  const parsedIdentity = oakDagBitfrostCacheIdentityV1Schema.parse(identity);
  const key = buildOakDagBitfrostCacheKeyV1(parsedIdentity);
  const raw = await BifrostCacheManager.getKagContext(key).catch(() => null);
  if (!raw || typeof raw !== 'object') return null;
  const record = raw as Partial<OakDagBitfrostCacheRecordV1<T>>;
  const identityChecksum = checksum(parsedIdentity);
  if (record.schema !== 'atlas.oak-dag-bitfrost-cache-record.v1') return null;
  if (record.cacheIdentityChecksum !== identityChecksum) return null;
  if (!record.outputChecksum || record.outputChecksum !== checksum(record.value)) return null;
  if (record.writesPerformed !== false || record.canonicalAuthority !== false) return null;
  return record as OakDagBitfrostCacheRecordV1<T>;
}

/**
 * Cache publication is disposable derived state only. It never grants mutation
 * or canonical authority and can be skipped entirely when BitFrost is down.
 */
export async function putOakDagBitfrostCacheV1<T>(input: {
  identity: OakDagBitfrostCacheIdentityV1;
  value: T;
}): Promise<OakDagBitfrostCacheRecordV1<T>> {
  const cacheIdentity = oakDagBitfrostCacheIdentityV1Schema.parse(input.identity);
  const record: OakDagBitfrostCacheRecordV1<T> = {
    schema: 'atlas.oak-dag-bitfrost-cache-record.v1',
    cacheIdentity,
    cacheIdentityChecksum: checksum(cacheIdentity),
    outputChecksum: checksum(input.value),
    value: input.value,
    writesPerformed: false,
    canonicalAuthority: false,
  };
  await BifrostCacheManager.registerKagContext(buildOakDagBitfrostCacheKeyV1(cacheIdentity), record);
  return record;
}
