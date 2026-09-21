import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { sourceSelectionChecksumV1 } from './graphify-input-identity';
import { classifyCurrentSourcesV1, keyOf, membershipSetChecksumV1, type CurrentSourceAuthorityInputV1, type MembershipRowV1, type SnapshotSourceV1 } from './current-source-authority-v1';

const digestOf = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex');
const WS = `sha256:${'a'.repeat(64)}`;
const SNAP = `sha256:${'5'.repeat(64)}`;

function source(repo: string, path: string, content: string) {
  const d = digestOf(content);
  const snap: SnapshotSourceV1 = { sourceIdentityKey: keyOf(repo, path), repositoryId: repo, repositoryRelativePath: path, sourceRef: `${repo}/${path}`, sourceRevision: `sha256:${d}`, contentDigest: d, byteLength: Buffer.byteLength(content) };
  const mem: MembershipRowV1 = { repositoryId: repo, repositoryRelativePath: path, sourceRef: snap.sourceRef, workspaceRevision: WS, codeSourceRevision: `sha256:${d}`, contentHash: d, byteLength: Buffer.byteLength(content) };
  return { snap, mem };
}
function input(pairs: Array<ReturnType<typeof source>>, patch: Partial<CurrentSourceAuthorityInputV1> = {}): CurrentSourceAuthorityInputV1 {
  const keys = pairs.map((p) => p.snap.sourceIdentityKey);
  const setChecksum = membershipSetChecksumV1(keys);
  return {
    admitted: { workspaceId: 'ws-1', workspaceRevision: WS, snapshotRevision: SNAP, sourceCount: pairs.length, membershipChecksum: setChecksum, admissionStatus: 'WORKSPACE_REVISION_TOURNAMENT_ADMITTED', admissionAuthority: true },
    snapshot: { snapshotRevision: SNAP, selfDigestValid: true, workspaceRevisionClaim: null, canonicalAuthorityClaim: false, violations: 0, membershipChecksum: setChecksum, sources: pairs.map((p) => p.snap) },
    preflight: { workspaceRevisionCandidate: WS, snapshotRevision: SNAP, sourceCount: pairs.length, membershipChecksum: setChecksum },
    membership: pairs.map((p) => p.mem),
    ...patch,
  };
}

describe('CurrentSourceAuthorityV1 — L1 contract', () => {
  it('classifies a clean cohort QUALIFIED and PROVEN', () => {
    const r = classifyCurrentSourcesV1(input([source('repo:root', 'a.ts', 'A'), source('repo:root', 'b.ts', 'B')]));
    expect(r.status).toBe('CURRENT_SOURCE_AUTHORITY_PROVEN');
    expect(r.counts).toEqual({ qualified: 2, missingRevision: 0, revisionMismatch: 0, namespaceAmbiguous: 0, notInAdmittedCohort: 0 });
    expect(Object.values(r.proof).every(Boolean)).toBe(true);
    expect(r.stableFileIdentityClaimed).toBe(false);
  });

  it('sourceSelectionChecksum is exactly GraphifyInputIdentityV1 sourceSelectionChecksumV1 (parity) and order-independent', () => {
    const pairs = [source('repo:root', 'z.ts', 'Z'), source('repo:root', 'a.ts', 'A'), source('repo:x', 'm.ts', 'M')];
    const r = classifyCurrentSourcesV1(input(pairs));
    const expected = sourceSelectionChecksumV1(pairs.map((p) => ({ sourceIdentityKey: p.snap.sourceIdentityKey, sourceRevision: p.snap.sourceRevision!, byteLength: p.snap.byteLength! })));
    expect(r.sourceSelectionChecksum).toBe(expected);
    const reversed = classifyCurrentSourcesV1(input([...pairs].reverse()));
    expect(reversed.sourceSelectionChecksum).toBe(expected);
  });

  it('orders identity keys by UTF-8 bytes, not UTF-16 code units', () => {
    // U+FF5E (3 bytes EF BD 9E) sorts before U+1F600 (4 bytes F0 9F 98 80) by bytes, but AFTER it by UTF-16 code units.
    const a = source('repo:root', '～.ts', 'x');
    const b = source('repo:root', '\u{1F600}.ts', 'y');
    const r = classifyCurrentSourcesV1(input([b, a]));
    expect(r.classified.map((c) => c.sourceIdentityKey)).toEqual([a.snap.sourceIdentityKey, b.snap.sourceIdentityKey]);
  });

  it('rejects a duplicate sourceIdentityKey (fail closed, NAMESPACE_AMBIGUOUS, not PROVEN)', () => {
    const one = source('repo:root', 'a.ts', 'A');
    const dup = source('repo:root', 'a.ts', 'A');
    const r = classifyCurrentSourcesV1(input([one, dup, source('repo:root', 'b.ts', 'B')]));
    expect(r.counts.namespaceAmbiguous).toBe(1);
    expect(r.proof.sourceIdentityProven).toBe(false);
    expect(r.status).toBe('CURRENT_SOURCE_AUTHORITY_BLOCKED');
  });

  it('a sourceRef shared by two identity keys is NAMESPACE_AMBIGUOUS', () => {
    const a = source('repo:root', 'a.ts', 'A');
    const b = source('repo:nested', 'a.ts', 'B');
    b.snap.sourceRef = a.snap.sourceRef; b.mem.sourceRef = a.snap.sourceRef;
    const r = classifyCurrentSourcesV1(input([a, b]));
    expect(r.counts.namespaceAmbiguous).toBe(2);
  });

  it('rejects a revision that is not the content digest (REVISION_MISMATCH)', () => {
    const p = source('repo:root', 'a.ts', 'A');
    p.snap.sourceRevision = `sha256:${'b'.repeat(64)}`; p.mem.codeSourceRevision = p.snap.sourceRevision;
    const r = classifyCurrentSourcesV1(input([p]));
    expect(r.counts.revisionMismatch).toBe(1);
    expect(r.classified[0].reasons).toContain('SNAPSHOT_REVISION_NOT_CONTENT_DIGEST');
    expect(r.proof.sourceRevisionProven).toBe(false);
  });

  it('rejects snapshot vs membership disagreement on revision or byteLength', () => {
    const p = source('repo:root', 'a.ts', 'A');
    p.mem.byteLength = 999;
    expect(classifyCurrentSourcesV1(input([p])).classified[0].reasons).toContain('BYTE_LENGTH_DIFFERS');
    const q = source('repo:root', 'a.ts', 'A');
    q.mem.codeSourceRevision = `sha256:${'c'.repeat(64)}`;
    const r = classifyCurrentSourcesV1(input([q]));
    expect(r.classified[0].reasons).toContain('SNAPSHOT_MEMBERSHIP_REVISION_DIFFERS');
    expect(r.counts.revisionMismatch).toBe(1);
  });

  it('rejects a missing or non-sha256 revision (MISSING_REVISION), never substituting latest', () => {
    const p = source('repo:root', 'a.ts', 'A');
    p.mem.codeSourceRevision = null;
    expect(classifyCurrentSourcesV1(input([p])).counts.missingRevision).toBe(1);
    const q = source('repo:root', 'b.ts', 'B');
    q.snap.sourceRevision = 'abc123'; q.mem.codeSourceRevision = 'abc123';
    expect(classifyCurrentSourcesV1(input([q])).counts.missingRevision).toBe(1);
  });

  it('a source present on only one side is NOT_IN_ADMITTED_COHORT and exact membership fails', () => {
    const a = source('repo:root', 'a.ts', 'A');
    const b = source('repo:root', 'b.ts', 'B');
    const r = classifyCurrentSourcesV1({ ...input([a, b]), membership: [a.mem] });
    expect(r.counts.notInAdmittedCohort).toBe(1);
    expect(r.proof.exactMembershipProven).toBe(false);
  });

  it('a membership row for a different workspaceRevision is a REVISION_MISMATCH', () => {
    const p = source('repo:root', 'a.ts', 'A');
    p.mem.workspaceRevision = `sha256:${'d'.repeat(64)}`;
    expect(classifyCurrentSourcesV1(input([p])).counts.revisionMismatch).toBe(1);
  });

  it('does not treat the admission membership-set checksum as the content-bearing selection checksum', () => {
    const r = classifyCurrentSourcesV1(input([source('repo:root', 'a.ts', 'A')]));
    expect(r.membershipSetChecksum).not.toBe(r.sourceSelectionChecksum);
  });

  it('workspace authority is not proven when the admission checksum, count, or authority flag is wrong', () => {
    const base = input([source('repo:root', 'a.ts', 'A')]);
    expect(classifyCurrentSourcesV1({ ...base, admitted: { ...base.admitted, membershipChecksum: `sha256:${'0'.repeat(64)}` } }).proof.workspaceAuthorityProven).toBe(false);
    expect(classifyCurrentSourcesV1({ ...base, admitted: { ...base.admitted, sourceCount: 2 } }).proof.workspaceAuthorityProven).toBe(false);
    expect(classifyCurrentSourcesV1({ ...base, admitted: { ...base.admitted, admissionAuthority: false } }).proof.workspaceAuthorityProven).toBe(false);
  });

  it('workspace authority requires the snapshot to claim NO workspace revision, verify its own digest, and match the admission snapshotRevision', () => {
    const base = input([source('repo:root', 'a.ts', 'A')]);
    expect(classifyCurrentSourcesV1(base).proof.workspaceAuthorityProven).toBe(true);
    expect(classifyCurrentSourcesV1({ ...base, snapshot: { ...base.snapshot, workspaceRevisionClaim: WS } }).proof.workspaceAuthorityProven).toBe(false);
    expect(classifyCurrentSourcesV1({ ...base, snapshot: { ...base.snapshot, canonicalAuthorityClaim: true } }).proof.workspaceAuthorityProven).toBe(false);
    expect(classifyCurrentSourcesV1({ ...base, snapshot: { ...base.snapshot, selfDigestValid: false } }).proof.workspaceAuthorityProven).toBe(false);
    expect(classifyCurrentSourcesV1({ ...base, snapshot: { ...base.snapshot, snapshotRevision: `sha256:${'6'.repeat(64)}` } }).proof.workspaceAuthorityProven).toBe(false);
  });

  it('workspace authority requires the preflight to independently state the same binding', () => {
    const base = input([source('repo:root', 'a.ts', 'A')]);
    expect(classifyCurrentSourcesV1({ ...base, preflight: null }).proof.workspaceAuthorityProven).toBe(false);
    expect(classifyCurrentSourcesV1({ ...base, preflight: { ...base.preflight!, workspaceRevisionCandidate: `sha256:${'9'.repeat(64)}` } }).proof.workspaceAuthorityProven).toBe(false);
    expect(classifyCurrentSourcesV1({ ...base, preflight: { ...base.preflight!, snapshotRevision: `sha256:${'7'.repeat(64)}` } }).proof.workspaceAuthorityProven).toBe(false);
  });
});

describe('CurrentSourceAuthorityV1 — identity semantics (tests A and B)', () => {
  it('TEST A: a path change creates a distinct selection key and is NEVER silently linked or claimed as one canonical identity', () => {
    const before = source('repo:root', 'old/name.ts', 'same content');
    const after = source('repo:root', 'new/name.ts', 'same content');
    const r = classifyCurrentSourcesV1(input([after]));
    const old = classifyCurrentSourcesV1(input([before]));
    expect(r.classified[0].sourceIdentityKey).not.toBe(old.classified[0].sourceIdentityKey);
    // Same content, different key: the module emits no alias/rename link and claims no stable file identity.
    expect(r.stableFileIdentityClaimed).toBe(false);
    expect(Object.keys(r.classified[0])).not.toContain('stableFileId');
    // Both sides present at once are two independent sources, not merged.
    const both = classifyCurrentSourcesV1(input([before, after]));
    expect(both.sourceCount).toBe(2);
    expect(both.counts.qualified).toBe(2);
  });

  it('TEST B: same path with changed content keeps the identity key, changes sourceRevision, and changes the selection checksum', () => {
    const v1 = source('repo:root', 'a.ts', 'version one');
    const v2 = source('repo:root', 'a.ts', 'version two');
    const r1 = classifyCurrentSourcesV1(input([v1]));
    const r2 = classifyCurrentSourcesV1(input([v2]));
    expect(r1.classified[0].sourceIdentityKey).toBe(r2.classified[0].sourceIdentityKey);
    expect(v1.snap.sourceRevision).not.toBe(v2.snap.sourceRevision);
    expect(r1.sourceSelectionChecksum).not.toBe(r2.sourceSelectionChecksum);
    expect(r1.counts.qualified).toBe(1);
    expect(r2.counts.qualified).toBe(1);
  });
});

describe('CurrentSourceAuthorityV1 — registry evidence is optional and never changes identity', () => {
  it('reports EXACT / ABSENT / MISMATCH bindings without changing classification unless revisions disagree', () => {
    const a = source('repo:root', 'a.ts', 'A');
    const b = source('repo:nested', 'b.ts', 'B');
    const c = source('repo:root', 'c.ts', 'C');
    const rows = [
      { repoId: 'reg-root', canonicalSourceRef: a.mem.sourceRef, workspaceRevision: WS, sourceRevision: a.snap.sourceRevision, contentDigest: a.snap.contentDigest, byteLength: a.snap.byteLength },
      { repoId: 'reg-root', canonicalSourceRef: c.mem.sourceRef, workspaceRevision: WS, sourceRevision: `sha256:${'e'.repeat(64)}`, contentDigest: c.snap.contentDigest, byteLength: c.snap.byteLength },
    ];
    const r = classifyCurrentSourcesV1({ ...input([a, b, c]), registry: { repoIdMap: { 'repo:root': 'reg-root' }, rows } });
    const state = Object.fromEntries(r.classified.map((s) => [s.sourceIdentityKey, s.registryBinding]));
    expect(state[a.snap.sourceIdentityKey]).toBe('EXACT');
    expect(state[b.snap.sourceIdentityKey]).toBe('ABSENT');
    expect(state[c.snap.sourceIdentityKey]).toBe('MISMATCH');
    expect(r.registryCoverage).toEqual({ exact: 1, absent: 1, mismatch: 1 });
    expect(r.classified.find((s) => s.sourceIdentityKey === b.snap.sourceIdentityKey)!.cls).toBe('QUALIFIED');
  });
});
