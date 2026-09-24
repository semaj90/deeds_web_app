import { describe, expect, it } from 'vitest';
import {
  classifyAdmission,
  buildAdmissionManifest,
  ADMISSION_CLASSES,
} from '../../../scripts/atlas/lib/packet-source-revision-repair-v1.mjs';

const WS = `sha256:${'a'.repeat(64)}`;
const EXEC = '74d50c86-8194-45ea-8c3d-61aab737ef83';
const d = (c: string) => c.repeat(64);

function obs(sourceRef: string, status: string, packetKey: string | null = null, c = 'b') {
  return { sourceRef, status, packetKey, sourcePath: sourceRef, workspaceRevision: WS, bindingChecksum: d('c'),
    sourceRevision: `sha256:${d(c)}`, membershipCodeSourceRevision: `sha256:${d(c)}`, contentDigest: d(c) };
}

describe('packet admission classification', () => {
  it('maps every packetless producer status into exactly one admission class and never counts packeted rows', () => {
    const { classes, rows } = classifyAdmission([
      obs('a', 'MISSING_PACKET'),
      obs('b', 'UNQUALIFIED_BINDING'),
      obs('c', 'REVISION_MISMATCH'),
      obs('d', 'ADMITTED_SNAPSHOT_BYTES_DIFFER_FROM_CURRENT_WORKTREE'),
      obs('e', 'SOURCE_BYTES_MISSING'),
      obs('f', 'PACKET_IDENTITY_AMBIGUOUS'),
      obs('g', 'IDEMPOTENT_MATCH', 'pk-g'),
      obs('h', 'LEGACY_LINEAGE_FIELDS_MISSING', 'pk-h'),
    ], { outOfScopeCount: 3 });
    expect(Object.keys(classes).sort()).toEqual([...ADMISSION_CLASSES].sort());
    expect(classes).toEqual({ ADMISSION_READY: 1, WORKSPACE_BINDING_MISSING: 1, REVISION_MISMATCH: 1,
      SOURCE_BYTES_CHANGED: 2, IDENTITY_COLLISION: 1, PACKET_NOW_EXISTS: 0, OUT_OF_SCOPE: 3 });
    expect(rows.map((r: { sourceRef: string }) => r.sourceRef)).not.toContain('g');
  });

  it('reports rows of the prior gap that now have a packet as PACKET_NOW_EXISTS', () => {
    const { classes } = classifyAdmission([obs('a', 'IDEMPOTENT_MATCH', 'pk-a'), obs('z', 'IDEMPOTENT_MATCH', 'pk-z')],
      { priorGapSourceRefs: ['a'] });
    expect(classes.PACKET_NOW_EXISTS).toBe(1);
  });
});

describe('admission manifest', () => {
  it('is deterministic, carries no packet_key and states the key recipe is undecided', () => {
    const a = buildAdmissionManifest([obs('y', 'MISSING_PACKET'), obs('x', 'MISSING_PACKET')], { executionId: EXEC, workspaceRevision: WS, accounting: null });
    const b = buildAdmissionManifest([obs('x', 'MISSING_PACKET'), obs('y', 'MISSING_PACKET')], { executionId: EXEC, workspaceRevision: WS, accounting: null });
    expect(a.rootSha256).toBe(b.rootSha256);
    expect(a.root.packetKeyRecipe).toBe('UNDECIDED_PACKET_ADMISSION_OWNER_DECISION_REQUIRED');
    expect(a.root.writesAuthorized).toBe(false);
    expect(a.shards[0].body.entries[0]).not.toHaveProperty('packetKey');
    expect(a.shards[0].body.entries.map((e: { sourceRef: string }) => e.sourceRef)).toEqual(['x', 'y']);
  });

  it('fails closed when the binding revision differs from membership or the digest disagrees', () => {
    const drift = { ...obs('x', 'MISSING_PACKET'), membershipCodeSourceRevision: `sha256:${d('e')}` };
    expect(() => buildAdmissionManifest([drift], { executionId: EXEC, workspaceRevision: WS, accounting: null })).toThrow('ADMISSION_ENTRY_REVISION_INVALID:x');
    const badDigest = { ...obs('x', 'MISSING_PACKET'), contentDigest: d('f') };
    expect(() => buildAdmissionManifest([badDigest], { executionId: EXEC, workspaceRevision: WS, accounting: null })).toThrow('ADMISSION_ENTRY_DIGEST_MISMATCH:x');
  });
});
