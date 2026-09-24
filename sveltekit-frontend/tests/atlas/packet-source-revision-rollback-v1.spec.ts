import { describe, expect, it } from 'vitest';
import {
  buildRepairEntries,
  buildInverseEntries,
  buildInverseManifest,
  verifyInverseManifest,
  classifyApplyTarget,
  classifyRollbackTarget,
  executeCasBatches,
  rollbackStatus,
  batchStateChecksum,
  sha256Of,
} from '../../../scripts/atlas/lib/packet-source-revision-repair-v1.mjs';

// SOURCE_REPAIR_ROLLBACK_EXECUTOR_PROVEN_CODE_ONLY: the rollback manifest, classifier and the shared
// compare-and-set batch engine, driven through an in-memory transactional store whose writes mirror
// the producer's SQL predicates (applyWrite / rollbackWrite).

const WS = `sha256:${'a'.repeat(64)}`;
const EXEC = '74d50c86-8194-45ea-8c3d-61aab737ef83';
const MANIFEST_ROOT = 'e'.repeat(64);
const SCOPE = { executionId: EXEC, workspaceRevision: WS, inverseOf: MANIFEST_ROOT };

type Row = {
  packet_key: string; source_ref: string; source_revision: string | null; content_hash: string | null;
  workspace_revision_key: string | null; lineage_binding_checksum: string | null; lineage_producer_revision: string | null;
};

function obs(i: number) {
  const c = (i % 10).toString(16);
  return { packetKey: `p${String(i).padStart(3, '0')}`, sourceRef: `src/f${i}.ts`, status: 'LEGACY_LINEAGE_FIELDS_MISSING',
    sourceRevision: `sha256:${c.repeat(64)}`, contentDigest: c.repeat(64), workspaceRevision: WS,
    bindingChecksum: 'b'.repeat(64), membershipContentDigest: c.repeat(64) };
}

function fixture(n: number) {
  const entries = buildRepairEntries(Array.from({ length: n }, (_, i) => obs(i)), { producerRevision: 'current-packet-digest-bridge-v1' });
  const rows = new Map<string, Row>(entries.map((e: { packetKey: string; sourceRef: string }) => [e.packetKey, {
    packet_key: e.packetKey, source_ref: e.sourceRef, source_revision: null, content_hash: null,
    workspace_revision_key: null, lineage_binding_checksum: null, lineage_producer_revision: null }]));
  // An unrelated packet that must never change.
  rows.set('zz-other', { packet_key: 'zz-other', source_ref: 'src/other.ts', source_revision: null, content_hash: 'legacy',
    workspace_revision_key: null, lineage_binding_checksum: null, lineage_producer_revision: null });
  return { entries, rows };
}

/** Transactional fake: BEGIN snapshots, ROLLBACK restores, writes enforce the SQL predicates. */
function fakeStore(rows: Map<string, Row>, mode: 'apply' | 'rollback', hooks: { failWriteAt?: number } = {}) {
  let snapshot: Map<string, Row> | null = null;
  let writes = 0;
  let tx = 0;
  const pick = (keys: string[]) => keys.flatMap((k) => (rows.has(k) ? [{ ...rows.get(k)! }] : []));
  return {
    begin: async () => { snapshot = new Map([...rows].map(([k, v]) => [k, { ...v }])); tx += 1; },
    commit: async () => { snapshot = null; },
    rollback: async () => { if (snapshot) { rows.clear(); for (const [k, v] of snapshot) rows.set(k, v); } snapshot = null; },
    txid: async () => String(tx),
    lockRows: async (keys: string[]) => pick(keys),
    readRows: async (keys: string[]) => pick(keys),
    write: async (entry: any) => {
      writes += 1;
      if (hooks.failWriteAt === writes) return 0;
      const r = rows.get(entry.packetKey);
      if (!r || r.source_ref !== entry.sourceRef) return 0;
      if (mode === 'apply') {
        if (r.source_revision !== null || r.content_hash !== null || r.workspace_revision_key !== null ||
            r.lineage_binding_checksum !== null || r.lineage_producer_revision !== null) return 0;
        const p = entry.proposed;
        Object.assign(r, { source_revision: p.sourceRevision, workspace_revision_key: p.workspaceRevisionKey,
          lineage_binding_checksum: p.lineageBindingChecksum, lineage_producer_revision: p.lineageProducerRevision });
        return 1;
      }
      const g = entry.guardEquals;
      if (r.source_revision !== g.sourceRevision || r.workspace_revision_key !== g.workspaceRevisionKey ||
          r.lineage_binding_checksum !== g.lineageBindingChecksum || r.lineage_producer_revision !== g.lineageProducerRevision ||
          r.content_hash !== (entry.contentHashGuard ?? null)) return 0;
      const s = entry.restore;
      Object.assign(r, { source_revision: s.sourceRevision, workspace_revision_key: s.workspaceRevisionKey,
        lineage_binding_checksum: s.lineageBindingChecksum, lineage_producer_revision: s.lineageProducerRevision });
      return 1;
    },
  };
}

const apply = (entries: unknown[], rows: Map<string, Row>, batchSize = 2) => executeCasBatches({ entries, batchSize,
  store: fakeStore(rows, 'apply'), classify: classifyApplyTarget, writeDecision: 'APPLY', doneDecision: 'ALREADY_APPLIED' });
const rollback = (inv: unknown[], rows: Map<string, Row>, batchSize = 2, hooks = {}) => executeCasBatches({ entries: inv, batchSize,
  store: fakeStore(rows, 'rollback', hooks), classify: classifyRollbackTarget, writeDecision: 'ROLLBACK', doneDecision: 'ALREADY_RESTORED' });
const tableChecksum = (rows: Map<string, Row>) => batchStateChecksum([...rows.values()]);
const contentHashes = (rows: Map<string, Row>) => [...rows.values()].map((r) => r.content_hash);

function manifest(entries: any[]) {
  return buildInverseManifest(buildInverseEntries(entries), { ...SCOPE, shardSize: 2 });
}

describe('rollback manifest verification', () => {
  const { entries } = fixture(5);
  const m = manifest(entries);
  const bodies = () => m.shards.map((s: { body: unknown }) => structuredClone(s.body));

  it('accepts the exact manifest and pins inverseOf inside the root checksum', () => {
    expect(verifyInverseManifest(m.root, bodies(), m.rootSha256, SCOPE)).toHaveLength(5);
    expect(() => verifyInverseManifest(m.root, bodies(), m.rootSha256, { ...SCOPE, inverseOf: 'f'.repeat(64) })).toThrow('INVERSE_OF_MISMATCH');
  });

  it('rejects a wrong root checksum, wrong execution ID, wrong schema and a tampered shard', () => {
    expect(() => verifyInverseManifest(m.root, bodies(), 'f'.repeat(64), SCOPE)).toThrow('INVERSE_ROOT_CHECKSUM_MISMATCH');
    expect(() => verifyInverseManifest(m.root, bodies(), m.rootSha256, { ...SCOPE, executionId: 'other' })).toThrow('INVERSE_EXECUTION_MISMATCH');
    const wrongSchema = { ...m.root, schema: 'atlas.packet-source-revision-repair-manifest.v2' };
    expect(() => verifyInverseManifest(wrongSchema, bodies(), sha256Of(wrongSchema), SCOPE)).toThrow('INVERSE_SCHEMA_MISMATCH');
    const tampered = bodies();
    tampered[0].entries[0].restore.sourceRevision = 'sha256:x';
    expect(() => verifyInverseManifest(m.root, tampered, m.rootSha256, SCOPE)).toThrow(/INVERSE_SHARD_CHECKSUM_MISMATCH/);
  });

  it('rejects a rollback entry that would write content_hash, even with rewritten checksums', () => {
    const withHash = bodies();
    withHash[0].entries[0].restore.contentHash = null;
    const root = structuredClone(m.root);
    root.shards[0].sha256 = sha256Of(withHash[0]);
    expect(() => verifyInverseManifest(root, withHash, sha256Of(root), SCOPE)).toThrow('INVERSE_MUST_NOT_WRITE_CONTENT_HASH');
  });
});

describe('rollback executor', () => {
  it('rolls an exact post-apply state back to the exact before-state; content_hash untouched', async () => {
    const { entries, rows } = fixture(5);
    const before = tableChecksum(rows);
    const hashes = contentHashes(rows);
    const applied = await apply(entries, rows);
    expect(applied.aborted).toBeNull();
    expect(applied.written).toBe(5);
    expect(tableChecksum(rows)).not.toBe(before);
    const inv = verifyInverseManifest(manifest(entries).root, manifest(entries).shards.map((s: { body: unknown }) => s.body), manifest(entries).rootSha256, SCOPE);
    const rolled = await rollback(inv, rows);
    expect(rolled.aborted).toBeNull();
    expect(rolled.written).toBe(5);
    expect(rolled.batches.every((b: { readback: string; committed: boolean }) => b.readback === 'PASS' && b.committed)).toBe(true);
    expect(rollbackStatus({ aborted: rolled.aborted, committedBatches: rolled.committedBatches })).toBe('SOURCE_REPAIR_ROLLBACK_COMPLETE');
    expect(tableChecksum(rows)).toBe(before);
    expect(contentHashes(rows)).toEqual(hashes);
  });

  it('is idempotent: a second rollback over restored rows writes nothing', async () => {
    const { entries, rows } = fixture(3);
    await apply(entries, rows);
    const inv = buildInverseEntries(entries);
    await rollback(inv, rows);
    const again = await rollback(inv, rows);
    expect(again.aborted).toBeNull();
    expect(again.written).toBe(0);
    expect(again.alreadyDone).toBe(3);
  });

  it('fails closed on a changed packet and never overwrites it; earlier batches stay committed (PARTIAL)', async () => {
    const { entries, rows } = fixture(5);
    await apply(entries, rows);
    rows.get('p003')!.lineage_binding_checksum = 'changed-by-someone-else';
    const run = await rollback(buildInverseEntries(entries), rows);
    expect(run.aborted).toMatchObject({ code: 'TARGET_DRIFT', packetKey: 'p003', atBatch: 1 });
    expect(run.committedBatches).toBe(1);
    expect(rollbackStatus({ aborted: run.aborted, committedBatches: run.committedBatches })).toBe('SOURCE_REPAIR_ROLLBACK_PARTIAL');
    expect(rows.get('p003')!.lineage_binding_checksum).toBe('changed-by-someone-else');
    // The aborted batch was rolled back as a unit: its other packet is still in the post-apply state.
    expect(rows.get('p002')!.source_revision).not.toBeNull();
    expect(rows.get('p000')!.source_revision).toBeNull();
  });

  it('refuses when content_hash changed after apply', async () => {
    const { entries, rows } = fixture(2);
    await apply(entries, rows);
    rows.get('p001')!.content_hash = 'new';
    const run = await rollback(buildInverseEntries(entries), rows);
    expect(run.aborted?.code).toBe('TARGET_DRIFT');
    expect(run.committedBatches).toBe(0);
    expect(rollbackStatus({ aborted: run.aborted, committedBatches: 0 })).toBe('SOURCE_REPAIR_ROLLBACK_FAILED_NOTHING_COMMITTED');
  });

  it('a partial rollback resumes safely after the drift is resolved', async () => {
    const { entries, rows } = fixture(5);
    const before = tableChecksum(rows);
    await apply(entries, rows);
    const inv = buildInverseEntries(entries);
    const failed = await rollback(inv, rows, 2, { failWriteAt: 3 });
    expect(failed.aborted?.code).toBe('COMPARE_AND_SET_FAILED');
    expect(failed.committedBatches).toBe(1);
    const resumed = await rollback(inv, rows);
    expect(resumed.aborted).toBeNull();
    expect(resumed.alreadyDone).toBe(2);
    expect(resumed.written).toBe(3);
    expect(tableChecksum(rows)).toBe(before);
  });

  it('a rollback over a partially applied cohort restores applied rows and treats untouched rows as restored', async () => {
    const { entries, rows } = fixture(4);
    const before = tableChecksum(rows);
    await apply(entries.slice(0, 2), rows);
    const run = await rollback(buildInverseEntries(entries), rows);
    expect(run.aborted).toBeNull();
    expect(run.written).toBe(2);
    expect(run.alreadyDone).toBe(2);
    expect(tableChecksum(rows)).toBe(before);
  });

  it('apply refuses a row with a pre-existing lineage_producer_revision so rollback can restore exactly', async () => {
    const { entries, rows } = fixture(1);
    rows.get('p000')!.lineage_producer_revision = 'someone-else';
    const run = await apply(entries, rows);
    expect(run.aborted?.code).toBe('TARGET_DRIFT');
    expect(rows.get('p000')!.source_revision).toBeNull();
  });
});
