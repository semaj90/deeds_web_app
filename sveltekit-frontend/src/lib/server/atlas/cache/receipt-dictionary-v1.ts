import { createHash } from 'node:crypto';
import { z } from 'zod';

/**
 * RECEIPT-DICTIONARY-01
 *
 * A rebuildable key-value view over receipts that PostgreSQL already owns. It follows the BitFrost key
 * pattern (`atlas:bitfrost:v1:...`, checksum in the key) with its OWN identity schema: receipts have no
 * ACE packet/ordinal/graph revisions, so none are invented. Pure and store-injected: it never opens a
 * connection, and tests use an in-memory store. PostgreSQL stays canonical; the dictionary is a cache.
 *
 * Rules enforced here: read-through, payloads are content-addressed (checksum mismatch is rejected and
 * evicted), scope isolation (workspace digest in every key), revoked grants are refused before the cache is
 * touched, a changed verifier status evicts, and an unknown task-to-receipt mapping stays unresolved.
 * Feature indexes accept ADMITTED bindings only, so proposed labels never become identity.
 */

export const RECEIPT_DICTIONARY_SCHEMA = 'atlas.receipt-dictionary.v1' as const;
const SHA256 = /^sha256:[a-f0-9]{64}$/;
const nonEmpty = z.string().min(1);

export const ReceiptCacheIdentityV1Schema = z
  .object({
    receiptKind: z.enum(['TEST_EXECUTION', 'VERIFIER_RESULT']),
    receiptId: nonEmpty,
    workspaceRevision: nonEmpty,
    sourceRevision: z.string().regex(SHA256),
    verifierRevision: nonEmpty.optional(),
    receiptChecksum: z.string().regex(SHA256),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (v.receiptKind === 'VERIFIER_RESULT' && !v.verifierRevision) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['verifierRevision'], message: 'VERIFIER_RESULT requires verifierRevision' });
    }
  });
export type ReceiptCacheIdentityV1 = z.infer<typeof ReceiptCacheIdentityV1Schema>;

export interface CanonicalReceiptRecordV1 {
  readonly receiptKind: ReceiptCacheIdentityV1['receiptKind'];
  readonly receiptId: string;
  readonly workspaceRevision: string;
  readonly sourceRevision: string;
  readonly verifierRevision?: string;
  readonly verificationStatus: string;
  /** Must be true: only rows read back from committed PostgreSQL records may be cached. */
  readonly committed: boolean;
  readonly payload: Readonly<Record<string, unknown>>;
}

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, canonical(v)]));
  }
  return value;
}

export function receiptChecksumV1(record: CanonicalReceiptRecordV1): string {
  return 'sha256:' + createHash('sha256').update(JSON.stringify(canonical(record)), 'utf8').digest('hex');
}

const wsDigest = (workspaceRevision: string): string =>
  createHash('sha256').update(workspaceRevision, 'utf8').digest('hex').slice(0, 16);

export function buildReceiptCacheKeyV1(input: ReceiptCacheIdentityV1): string {
  const id = ReceiptCacheIdentityV1Schema.parse(input);
  return ['atlas', 'bitfrost', 'v1', 'receipt', id.receiptKind.toLowerCase(), wsDigest(id.workspaceRevision), id.receiptId, id.receiptChecksum.slice(7)].join(':');
}

export function buildReceiptTaskIndexKeyV1(input: { workspaceRevision: string; taskStableKey: string }): string {
  if (!input.workspaceRevision || !input.taskStableKey) throw new Error('RECEIPT_INDEX_IDENTITY_REQUIRED');
  return ['atlas', 'bitfrost', 'v1', 'receipt-index', 'task', wsDigest(input.workspaceRevision), input.taskStableKey].join(':');
}

export function buildReceiptFeatureIndexKeyV1(input: {
  workspaceRevision: string;
  featureId: string;
  bindingStatus: 'ADMITTED' | 'PROPOSAL_ONLY';
}): string {
  if (input.bindingStatus !== 'ADMITTED') throw new Error('FEATURE_BINDING_NOT_ADMITTED');
  if (!input.workspaceRevision || !input.featureId) throw new Error('RECEIPT_INDEX_IDENTITY_REQUIRED');
  return ['atlas', 'bitfrost', 'v1', 'receipt-index', 'feature', wsDigest(input.workspaceRevision), input.featureId].join(':');
}

export interface ReceiptKvStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSeconds: number): Promise<void>;
  del(key: string): Promise<void>;
}

export type ReceiptLookupStatus = 'HIT' | 'MISS_LOADED' | 'NOT_FOUND' | 'REJECTED';
export interface ReceiptLookupResultV1 {
  readonly schema: typeof RECEIPT_DICTIONARY_SCHEMA;
  readonly status: ReceiptLookupStatus;
  readonly reason: string | null;
  readonly evicted: boolean;
  readonly record: CanonicalReceiptRecordV1 | null;
}

export interface ReceiptDictionaryDeps {
  readonly store: ReceiptKvStore;
  /** Authorized PostgreSQL read of committed rows for this identity. More than one row is a duplicate identity. */
  readonly loadCanonical: (identity: ReceiptCacheIdentityV1) => Promise<readonly CanonicalReceiptRecordV1[]>;
  /** Cheap canonical probe of the CURRENT verifier status; a change invalidates a cached entry. */
  readonly currentVerificationStatus: (identity: ReceiptCacheIdentityV1) => Promise<string | null>;
  readonly ttlSeconds?: number;
}

export function createReceiptDictionaryV1(deps: ReceiptDictionaryDeps) {
  const ttl = deps.ttlSeconds ?? 3600;
  const result = (status: ReceiptLookupStatus, reason: string | null, record: CanonicalReceiptRecordV1 | null, evicted = false): ReceiptLookupResultV1 =>
    Object.freeze({ schema: RECEIPT_DICTIONARY_SCHEMA, status, reason, evicted, record });

  const scopeProblem = (record: CanonicalReceiptRecordV1, id: ReceiptCacheIdentityV1): string | null => {
    if (record.receiptKind !== id.receiptKind || record.receiptId !== id.receiptId) return 'RECEIPT_IDENTITY_MISMATCH';
    if (record.workspaceRevision !== id.workspaceRevision) return 'WORKSPACE_SCOPE_MISMATCH';
    if (record.sourceRevision !== id.sourceRevision) return 'STALE_SOURCE_REVISION';
    if ((record.verifierRevision ?? null) !== (id.verifierRevision ?? null)) return 'STALE_VERIFIER_REVISION';
    if (receiptChecksumV1(record) !== id.receiptChecksum) return 'CHECKSUM_MISMATCH';
    return null;
  };

  return {
    async lookup(input: { identity: ReceiptCacheIdentityV1; grantActive: boolean }): Promise<ReceiptLookupResultV1> {
      // Access first: a revoked grant never touches the cache, whatever it holds.
      if (!input.grantActive) return result('REJECTED', 'GRANT_REVOKED', null);
      const identity = ReceiptCacheIdentityV1Schema.parse(input.identity);
      const key = buildReceiptCacheKeyV1(identity);
      let evicted = false;

      const cachedRaw = await deps.store.get(key);
      if (cachedRaw !== null) {
        let cached: CanonicalReceiptRecordV1 | null = null;
        try { cached = JSON.parse(cachedRaw) as CanonicalReceiptRecordV1; } catch { cached = null; }
        const problem = cached ? scopeProblem(cached, identity) : 'CACHE_PAYLOAD_UNREADABLE';
        const current = cached && !problem ? await deps.currentVerificationStatus(identity) : null;
        if (cached && !problem && current === cached.verificationStatus) return result('HIT', null, cached);
        // Stale, tampered or status-changed entry: evict and fall through to the canonical read.
        await deps.store.del(key);
        evicted = true;
      }

      const rows = await deps.loadCanonical(identity);
      if (rows.length === 0) return result('NOT_FOUND', null, null, evicted);
      if (rows.length > 1) return result('REJECTED', 'DUPLICATE_RECEIPT_IDENTITY', null, evicted);
      const record = rows[0];
      if (record.committed !== true) return result('REJECTED', 'NOT_COMMITTED', null, evicted);
      const problem = scopeProblem(record, identity);
      if (problem) return result('REJECTED', problem, null, evicted);
      await deps.store.set(key, JSON.stringify(record), ttl); // write-after-commit
      return result('MISS_LOADED', null, record, evicted);
    },
  };
}

export type TaskReceiptResolutionV1 =
  | { readonly status: 'RESOLVED'; readonly receiptIds: readonly string[] }
  | { readonly status: 'UNRESOLVED_TASK_MAPPING'; readonly receiptIds: readonly [] };

/**
 * Task to receipt resolution from an EXPLICIT mapping only (keyed by workboard stableKey). When no admitted
 * mapping exists the answer is UNRESOLVED; names, files or revisions are never matched heuristically.
 */
export function resolveTaskReceiptsV1(input: {
  taskStableKey: string;
  mapping: ReadonlyMap<string, readonly string[]> | null;
}): TaskReceiptResolutionV1 {
  const ids = input.mapping?.get(input.taskStableKey);
  if (!ids || ids.length === 0) return { status: 'UNRESOLVED_TASK_MAPPING', receiptIds: [] };
  return { status: 'RESOLVED', receiptIds: [...new Set(ids)] };
}
