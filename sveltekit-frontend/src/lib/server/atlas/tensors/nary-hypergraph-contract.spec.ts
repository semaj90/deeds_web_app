import { describe, expect, it } from 'vitest';
import {
  buildNaryIncidenceArtifactMetadata,
  canonicalizeHyperedgeMembers,
  type HyperedgeMember,
} from './nary-hypergraph-contract.js';

/**
 * Proves T9 (openspec/changes/parent-atlas-tensor-residency-integration/tasks.md):
 * "n-ary incidence artifact emitted as sparse membership data, not dense
 * adjacency." This file had zero test coverage and zero live callers before
 * this pass (confirmed via repo-wide grep) -- an unwired but coherent
 * scaffold, per this repo's own "don't delete unwired scaffolds" convention.
 */

const members: HyperedgeMember[] = [
  { hyperedgeId: 'he-2', vertexId: 'v-a', role: 'subject', weight: 1 },
  { hyperedgeId: 'he-1', vertexId: 'v-b', role: 'object', weight: 0.5 },
  { hyperedgeId: 'he-1', vertexId: 'v-a', role: 'subject', weight: 0.8 },
  { hyperedgeId: 'he-2', vertexId: 'v-c', role: 'context', weight: 0.3 },
];

describe('canonicalizeHyperedgeMembers', () => {
  it('sorts by hyperedgeId, then role, then vertexId', () => {
    const canonical = canonicalizeHyperedgeMembers(members);
    expect(canonical.map((m) => [m.hyperedgeId, m.role, m.vertexId])).toEqual([
      ['he-1', 'object', 'v-b'],
      ['he-1', 'subject', 'v-a'],
      ['he-2', 'context', 'v-c'],
      ['he-2', 'subject', 'v-a'],
    ]);
  });

  it('produces identical output regardless of input order', () => {
    const shuffledOnce = [members[2], members[0], members[3], members[1]];
    const shuffledTwice = [members[3], members[1], members[0], members[2]];

    const a = canonicalizeHyperedgeMembers(members);
    const b = canonicalizeHyperedgeMembers(shuffledOnce);
    const c = canonicalizeHyperedgeMembers(shuffledTwice);

    expect(b).toEqual(a);
    expect(c).toEqual(a);
  });

  it('does not mutate the input array', () => {
    const copy = [...members];
    canonicalizeHyperedgeMembers(members);
    expect(members).toEqual(copy);
  });

  it('sorts by exact UTF-8 byte order, not locale-sensitive collation', () => {
    // A classic locale-sensitive divergence case: underscore vs letter
    // ordering, and case-sensitivity, differ between locale-aware collation
    // and plain byte comparison. Byte order must be used so the checksum
    // this canonicalization feeds is reproducible across Node ICU builds.
    const localeTrap: HyperedgeMember[] = [
      { hyperedgeId: 'a_b', vertexId: 'v', role: 'r', weight: 1 },
      { hyperedgeId: 'aa', vertexId: 'v', role: 'r', weight: 1 },
      { hyperedgeId: 'Ab', vertexId: 'v', role: 'r', weight: 1 },
    ];
    const canonical = canonicalizeHyperedgeMembers(localeTrap);
    // Plain UTF-8 byte order: 'A' (0x41) < 'a' (0x61) < '_' (0x5f) is between
    // uppercase and lowercase, so 'Ab' < 'a_b' < 'aa' in strict byte order.
    expect(canonical.map((m) => m.hyperedgeId)).toEqual(['Ab', 'a_b', 'aa']);
  });
});

describe('buildNaryIncidenceArtifactMetadata', () => {
  const artifactId = 'nary:test:001';
  const workspaceRevision = 'workspace:r1';
  const arrowPath = '.tmp/atlas/nary-incidence.arrow';
  const contentHash = 'sha256:deadbeef';

  it('counts rows as the number of memberships, not hyperedgeCount * vertexCount', () => {
    const artifact = buildNaryIncidenceArtifactMetadata(
      members,
      artifactId,
      workspaceRevision,
      arrowPath,
      contentHash,
    );

    expect(artifact.rows).toBe(4); // 4 real memberships
    expect(artifact.hyperedgeCount).toBe(2); // he-1, he-2
    expect(artifact.vertexCount).toBe(3); // v-a, v-b, v-c

    // The sparse property: rows is far smaller than the dense product
    // (hyperedgeCount * vertexCount = 6) would be for any realistic corpus,
    // and never scales with it -- this file never materializes a
    // hyperedgeCount x vertexCount matrix.
    expect(artifact.rows).toBeLessThan(artifact.hyperedgeCount * artifact.vertexCount + 1);
  });

  it('scales rows linearly with a large sparse membership set, not quadratically with vertex/hyperedge counts', () => {
    // 500 hyperedges x 500 vertices would be a 250,000-cell dense matrix.
    // A real sparse corpus with ~3 memberships per hyperedge should produce
    // ~1500 rows, not 250,000.
    const large: HyperedgeMember[] = [];
    for (let h = 0; h < 500; h++) {
      for (let k = 0; k < 3; k++) {
        large.push({
          hyperedgeId: `he-${h}`,
          vertexId: `v-${(h * 3 + k) % 500}`,
          role: 'member',
          weight: 1,
        });
      }
    }
    const artifact = buildNaryIncidenceArtifactMetadata(
      large,
      artifactId,
      workspaceRevision,
      arrowPath,
      contentHash,
    );

    expect(artifact.rows).toBe(1500);
    expect(artifact.hyperedgeCount).toBe(500);
    expect(artifact.rows).toBeLessThan(artifact.hyperedgeCount * artifact.vertexCount);
  });

  it('passes arrowPath and contentHash through unchanged (caller-supplied, not computed here)', () => {
    const artifact = buildNaryIncidenceArtifactMetadata(
      members,
      artifactId,
      workspaceRevision,
      arrowPath,
      contentHash,
    );
    expect(artifact.arrowPath).toBe(arrowPath);
    expect(artifact.contentHash).toBe(contentHash);
    expect(artifact.artifactId).toBe(artifactId);
    expect(artifact.workspaceRevision).toBe(workspaceRevision);
  });

  it('rejects a duplicate (hyperedgeId, vertexId, role) row', () => {
    const withDuplicate: HyperedgeMember[] = [
      ...members,
      { hyperedgeId: 'he-1', vertexId: 'v-b', role: 'object', weight: 0.9 }, // duplicate of members[1]
    ];
    expect(() =>
      buildNaryIncidenceArtifactMetadata(withDuplicate, artifactId, workspaceRevision, arrowPath, contentHash),
    ).toThrow(/duplicate/);
  });

  it('is order-independent: shuffled input produces identical artifact metadata', () => {
    const shuffled = [members[2], members[0], members[3], members[1]];
    const a = buildNaryIncidenceArtifactMetadata(members, artifactId, workspaceRevision, arrowPath, contentHash);
    const b = buildNaryIncidenceArtifactMetadata(shuffled, artifactId, workspaceRevision, arrowPath, contentHash);
    expect(b).toEqual(a);
  });
});
