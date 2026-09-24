import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  buildRepairEntries,
  buildShardedManifest,
  verifyShardedManifest,
  classifyApplyTarget,
  planBatches,
  buildInverseEntries,
  batchStateChecksum,
  applyStatus,
  sha256Of,
  TARGET_COLUMNS,
} from '../../../scripts/atlas/lib/packet-source-revision-repair-v1.mjs';

const WS = `sha256:${'a'.repeat(64)}`;
const EXEC = '74d50c86-8194-45ea-8c3d-61aab737ef83';
const SCOPE = { executionId: EXEC, workspaceRevision: WS };
const PRODUCER = { producerRevision: 'current-packet-digest-bridge-v1' };
const rev = (c: string) => `sha256:${c.repeat(64)}`;

function obs(packetKey: string, status = 'LEGACY_LINEAGE_FIELDS_MISSING', revChar = 'b') {
  return {
    packetKey,
    sourceRef: `src/${packetKey}.ts`,
    status,
    sourceRevision: rev(revChar),
    contentDigest: revChar.repeat(64),
    workspaceRevision: WS,
    bindingChecksum: 'c'.repeat(64),
    membershipContentDigest: revChar.repeat(64),
  };
}

function liveRow(entry: { packetKey: string; sourceRef: string }, over: Record<string, unknown> = {}) {
  return { packet_key: entry.packetKey, source_ref: entry.sourceRef, source_revision: null, content_hash: null,
    workspace_revision_key: null, lineage_binding_checksum: null, ...over };
}

function sharded(keys: string[], shardSize = 2) {
  const entries = buildRepairEntries(keys.map((k) => obs(k)), PRODUCER);
  return buildShardedManifest(entries, { ...SCOPE, accounting: { membershipTotal: keys.length }, shardSize });
}

describe('repair entries and target columns', () => {
  it('includes only repairable rows, never packet-admission or legacy-hash rows', () => {
    const entries = buildRepairEntries(
      [obs('p1'), obs('p2', 'MISSING_PACKET'), obs('p3', 'LEGACY_CONTENT_HASH_UNQUALIFIED'), obs('p4', 'IDEMPOTENT_MATCH')],
      PRODUCER,
    );
    expect(entries.map((e: { packetKey: string }) => e.packetKey)).toEqual(['p1']);
  });

  it('never proposes content_hash (different historical recipe) and propagates the revision unchanged', () => {
    const [entry] = buildRepairEntries([obs('p1', undefined, 'd')], PRODUCER);
    expect(entry.proposed).not.toHaveProperty('contentHash');
    expect(entry.proposed.sourceRevision).toBe(rev('d'));
    expect(TARGET_COLUMNS).not.toContain('content_hash');
    expect(entry.before.contentHash).toBeNull();
  });

  it('neither durable UPDATE in the producer SETs content_hash; both guard it', () => {
    const producer = readFileSync(resolve(__dirname, '../../../scripts/atlas/produce-current-packet-digest-bridge-v1.mjs'), 'utf8');
    for (const fn of ['const applyWrite', 'const rollbackWrite']) {
      const body = producer.slice(producer.indexOf(fn), producer.indexOf('};', producer.indexOf(fn)));
      const setClause = body.slice(body.indexOf('SET '), body.indexOf('WHERE packet_key = $1'));
      expect(setClause).toContain('source_revision = $');
      expect(setClause).toContain('lineage_producer_revision = $');
      expect(setClause).not.toContain('content_hash');
      expect(body.slice(body.indexOf('WHERE'))).toContain('content_hash');
    }
  });
});

describe('sharded manifest', () => {
  it('splits deterministically and pins every shard in the root checksum', () => {
    const a = sharded(['p3', 'p1', 'p2']);
    const b = sharded(['p1', 'p2', 'p3']);
    expect(a.rootSha256).toBe(b.rootSha256);
    expect(a.shards.map((s: { body: { entries: unknown[] } }) => s.body.entries.length)).toEqual([2, 1]);
    const entries = verifyShardedManifest(a.root, a.shards.map((s: { body: unknown }) => s.body), a.rootSha256, SCOPE);
    expect(entries.map((e: { packetKey: string }) => e.packetKey)).toEqual(['p1', 'p2', 'p3']);
  });

  it('rejects a tampered shard, a wrong root checksum, scope mismatch and a content_hash write', () => {
    const m = sharded(['p1', 'p2', 'p3']);
    const bodies = m.shards.map((s: { body: unknown }) => structuredClone(s.body));
    expect(() => verifyShardedManifest(m.root, bodies, 'f'.repeat(64), SCOPE)).toThrow('MANIFEST_ROOT_CHECKSUM_MISMATCH');
    expect(() => verifyShardedManifest(m.root, bodies, m.rootSha256, { ...SCOPE, executionId: 'x' })).toThrow('MANIFEST_EXECUTION_MISMATCH');
    const tampered = structuredClone(bodies);
    tampered[1].entries[0].proposed.sourceRevision = 'latest';
    expect(() => verifyShardedManifest(m.root, tampered, m.rootSha256, SCOPE)).toThrow(/MANIFEST_SHARD_CHECKSUM_MISMATCH/);
    // A shard that adds content_hash must fail even if the attacker also rewrites checksums.
    const withHash = structuredClone(bodies);
    withHash[0].entries[0].proposed.contentHash = 'x';
    const root2 = structuredClone(m.root);
    root2.shards[0].sha256 = sha256Of(withHash[0]);
    expect(() => verifyShardedManifest(root2, withHash, sha256Of(root2), SCOPE)).toThrow('MANIFEST_MUST_NOT_WRITE_CONTENT_HASH');
  });
});

describe('durable apply classification, receipts and status', () => {
  const [entry] = buildRepairEntries([obs('p1')], PRODUCER);

  it('applies only on the frozen before-state; qualified rows are idempotent; drift is rejected', () => {
    expect(classifyApplyTarget(liveRow(entry), entry)).toBe('APPLY');
    const p = entry.proposed;
    expect(classifyApplyTarget(liveRow(entry, { source_revision: p.sourceRevision, workspace_revision_key: p.workspaceRevisionKey,
      lineage_binding_checksum: p.lineageBindingChecksum, lineage_producer_revision: p.lineageProducerRevision }), entry)).toBe('ALREADY_APPLIED');
    // A post-state missing the producer revision is not an exact apply.
    expect(classifyApplyTarget(liveRow(entry, { source_revision: p.sourceRevision, workspace_revision_key: p.workspaceRevisionKey,
      lineage_binding_checksum: p.lineageBindingChecksum }), entry)).toBe('TARGET_DRIFT');
    expect(classifyApplyTarget(liveRow(entry, { content_hash: 'legacy-recipe' }), entry)).toBe('TARGET_DRIFT');
    expect(classifyApplyTarget(liveRow(entry, { source_ref: 'moved.ts' }), entry)).toBe('TARGET_DRIFT');
    expect(classifyApplyTarget(undefined, entry)).toBe('TARGET_MISSING');
  });

  it('reports partial completion distinctly', () => {
    expect(applyStatus({ aborted: null, committedBatches: 3 })).toBe('SOURCE_AUTHORITY_APPLY_COMPLETE');
    expect(applyStatus({ aborted: { code: 'TARGET_DRIFT' }, committedBatches: 2 })).toBe('SOURCE_AUTHORITY_APPLY_PARTIAL');
    expect(applyStatus({ aborted: { code: 'TARGET_DRIFT' }, committedBatches: 0 })).toBe('SOURCE_AUTHORITY_APPLY_FAILED_NOTHING_COMMITTED');
  });

  it('batch-state checksums are order-independent and bounded batches / inverse entries are built', () => {
    const r1 = liveRow(entry);
    const r2 = { ...liveRow(entry), packet_key: 'p0' };
    expect(batchStateChecksum([r1, r2])).toBe(batchStateChecksum([r2, r1]));
    expect(() => planBatches([entry], 0)).toThrow('BOUNDED_BATCH_SIZE_REQUIRED');
    const [inverse] = buildInverseEntries([entry]);
    expect(inverse.restore).toEqual({ sourceRevision: null, workspaceRevisionKey: null, lineageBindingChecksum: null, lineageProducerRevision: null });
    expect(inverse.guardEquals).toEqual(entry.proposed);
    expect(inverse.contentHashGuard).toBeNull();
  });
});
