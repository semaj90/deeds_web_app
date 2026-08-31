import { createHash } from 'node:crypto';
import { z } from 'zod';

export const GPU_RESIDENCY_CACHE_KEY_SCHEMA = 'atlas.gpu-artifact-key.v1' as const;

const checksum = z.string().regex(/^[a-f0-9]{64}$/i);
const revision = z.string().min(1);

export const gpuArtifactKeyV1Schema = z.object({
  schema: z.literal(GPU_RESIDENCY_CACHE_KEY_SCHEMA),
  artifactKind: z.string().min(1),
  artifactRevision: revision,
  candidateSnapshotRevision: revision.nullable(),
  graphRevision: revision.nullable(),
  projectionRevision: revision.nullable(),
  representationRevision: revision.nullable(),
  ordinalMapChecksum: checksum.nullable(),
  payloadChecksum: checksum,
  dtype: z.enum(['float32', 'float16', 'uint8', 'int32']),
  shape: z.array(z.number().int().positive()).min(1).max(3),
  layout: z.string().min(1),
  deviceId: z.number().int().nonnegative(),
  materializationPolicyRevision: revision,
}).strict().superRefine((value, ctx) => {
  const serialized = JSON.stringify(value);
  if (/latest/i.test(serialized)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['artifactRevision'], message: 'GPU_ARTIFACT_KEY_MOVABLE_REVISION_FORBIDDEN' });
  }
});
export type GpuArtifactKeyV1 = z.infer<typeof gpuArtifactKeyV1Schema>;

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(',')}}`;
}

export function gpuArtifactKeyChecksumV1(input: GpuArtifactKeyV1): string {
  return createHash('sha256').update(canonicalJson(input), 'utf8').digest('hex');
}

export type GpuResidencyLookupV1<T> = {
  status: 'HIT' | 'MISS';
  keyChecksum: string;
  value: T | null;
  bytes: number;
};

type Entry<T> = { key: GpuArtifactKeyV1; keyChecksum: string; value: T; bytes: number; lastUsedAt: number; hits: number };

export class GpuResidencyCacheV1<T> {
  private readonly entries = new Map<string, Entry<T>>();

  constructor(private readonly maxBytes: number, private readonly clock: () => number = Date.now) {
    if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) throw new Error('GPU_RESIDENCY_CACHE_MAX_BYTES_INVALID');
  }

  get(keyInput: unknown): GpuResidencyLookupV1<T> {
    const key = gpuArtifactKeyV1Schema.parse(keyInput);
    const keyChecksum = gpuArtifactKeyChecksumV1(key);
    const entry = this.entries.get(keyChecksum);
    if (!entry) return { status: 'MISS', keyChecksum, value: null, bytes: 0 };
    entry.lastUsedAt = this.clock();
    entry.hits += 1;
    return { status: 'HIT', keyChecksum, value: entry.value, bytes: entry.bytes };
  }

  set(keyInput: unknown, value: T, bytes: number): { status: 'STORED' | 'REJECTED'; keyChecksum: string; evicted: number } {
    const key = gpuArtifactKeyV1Schema.parse(keyInput);
    if (!Number.isSafeInteger(bytes) || bytes <= 0 || bytes > this.maxBytes) return { status: 'REJECTED', keyChecksum: gpuArtifactKeyChecksumV1(key), evicted: 0 };
    const keyChecksum = gpuArtifactKeyChecksumV1(key);
    this.entries.delete(keyChecksum);
    this.entries.set(keyChecksum, { key, keyChecksum, value, bytes, lastUsedAt: this.clock(), hits: 0 });
    return { status: 'STORED', keyChecksum, evicted: this.evictToBudget() };
  }

  invalidateByRevision(revisionValue: string): number {
    let removed = 0;
    for (const [keyChecksum, entry] of this.entries) {
      const revisions = [entry.key.artifactRevision, entry.key.candidateSnapshotRevision, entry.key.graphRevision, entry.key.projectionRevision, entry.key.representationRevision];
      if (revisions.includes(revisionValue)) { this.entries.delete(keyChecksum); removed += 1; }
    }
    return removed;
  }

  evictToBudget(): number {
    let total = [...this.entries.values()].reduce((sum, entry) => sum + entry.bytes, 0);
    let evicted = 0;
    const ordered = [...this.entries.values()].sort((a, b) => a.lastUsedAt - b.lastUsedAt || a.keyChecksum.localeCompare(b.keyChecksum));
    for (const entry of ordered) {
      if (total <= this.maxBytes) break;
      this.entries.delete(entry.keyChecksum); total -= entry.bytes; evicted += 1;
    }
    return evicted;
  }

  size(): number { return this.entries.size; }
  bytes(): number { return [...this.entries.values()].reduce((sum, entry) => sum + entry.bytes, 0); }
}
