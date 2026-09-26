import { describe, expect, it } from 'vitest';
import { buildAcePacketV3 } from '../../../../../../packages/parent-atlas/src/core/ace-packet-v3.js';
import { bridgeAcePacketsToContextManifestV1 } from './ace-packet-v3-context-manifest-bridge-v1.js';

const sha = (c: string) => `sha256:${c.repeat(64)}`;
const sec = (data: unknown, status = 'CURRENT', revision: string | null = 'r1') => ({ status, revision, evidence_refs: [], data });

interface PacketOpts { semantic?: string; topology?: string; rep?: string | null; graph?: string | null; sourceRevision?: string; workspace?: string; key?: string }

function packet(i: number, opts: PacketOpts = {}) {
  const key = opts.key ?? `packet:${i}`;
  const ref = `src/f${i}.ts`;
  const srcRev = opts.sourceRevision ?? `src-r${i}`;
  const semanticStatus = opts.semantic ?? 'HINT';
  const topoStatus = opts.topology ?? 'HINT';
  return buildAcePacketV3({
    schema: 'atlas.ace-packet.v3',
    base: { packet_revision: 'pr1', envelope: { packet_key: key, source_ref: ref, canonical_source_ref: ref, feature_id: null, source_revision: srcRev }, hypergraph: null, producer_revision: 'prod1' },
    identity: {
      packet_key: key, source_ref: ref, workspace_revision: opts.workspace ?? 'workspace:r1', source_revision: srcRev, packet_revision: 'pr1',
      producer_revision: 'prod1', representation_id: 'semantic_768', representation_revision: opts.rep === undefined ? null : opts.rep,
      feature_revision: null, graph_revision: opts.graph === undefined ? null : opts.graph, symbol_version_id: null, tree_node_id: null,
    },
    source: sec({ language: 'typescript', source_digest: sha('a'), start_byte: null, end_byte: null, ast_state: 'NOT_MATERIALIZED' }),
    semantic: sec({
      summary: sec({ text: null, input_digest: null, model_revision: null }, 'PENDING', null),
      embedding: sec({ model: null, dimension: null, input_digest: null, embedding_digest: null, vector_ref: null }, 'PENDING', null),
      keywords: [], entities: [], concept_ids: [], domain_class: null,
    }, semanticStatus, semanticStatus === 'CURRENT' ? 'r1' : null),
    topology: sec({ community_id: null, pagerank: null, som: null, kmeans_cluster: null, centroid_refs: [] }, topoStatus, topoStatus === 'CURRENT' ? 'r1' : null),
    residency: sec({ tier: 'COLD', lod: 'SOURCE_SPAN', utility: null, prefetch_reasons: [], cache_identity_checksum: null }, 'PENDING', null),
    evidence: sec({ refs: [`evidence:${i}`], contradictions: [], stale_refs: [] }),
  } as never);
}

const row = (i: number, over: Record<string, unknown> = {}) => ({
  schema: 'atlas.candidate-feature-row.v1' as const, candidateOrdinal: i, canonicalId: `canonical:${i}`, packetKey: `packet:${i}`,
  sourceRef: `src/f${i}.ts`, treeNodeId: null, symbolVersionId: null, workspaceRevision: 'workspace:r1', sourceRevision: `src-r${i}`,
  graphRevision: null, semanticRevision: null, featureRevision: 'feature:r1', representationBindings: [], laneMask: ['semantic'] as const,
  evidenceRefs: [`evidence:${i}`], ...over,
});
const snapshot = {
  schema: 'atlas.candidate-feature-snapshot.v1' as const, candidateSnapshotRevision: 'candidate:r1', ordinalMapChecksum: 'a'.repeat(64),
  workspaceRevision: 'workspace:r1', featureRevision: 'feature:r1', rowCount: 3, rows: [0, 1, 2].map((i) => row(i)),
  snapshotChecksum: 'b'.repeat(64), identityAuthority: false as const, canonicalOwnerChanged: false as const, producerRevision: 'producer:r1',
};
const admitted = { status: 'ADMITTED', snapshot } as never;
const base = (over: Record<string, unknown> = {}) => ({
  featureAdmission: admitted, selectedOrdinals: [0, 1], packets: [packet(0), packet(1)], requestId: 'req:1', tokenBudget: 512,
  retrievalPolicyRevision: 'policy:r1', acePlaybookRevision: 'playbook:r1', ...over,
}) as never;

describe('ACE3-06A packet -> context manifest bridge', () => {
  it('is deterministic and keeps HINT semantic/topology as null revisions (never promoted)', () => {
    const a = bridgeAcePacketsToContextManifestV1(base());
    const b = bridgeAcePacketsToContextManifestV1(base());
    expect(a.receipt).toEqual(b.receipt);
    expect(a.receipt.representationRevision).toBeNull();
    expect(a.receipt.graphRevision).toBeNull();
    expect(a.admission.manifest.identityInput.evidenceRevisions.representationRevision).toBeNull();
    expect(a.receipt.canonicalAuthority).toBe(false);
    expect(a.receipt.writesPerformed).toBe(false);
  });
  it('carries a shared CURRENT representation/graph revision', () => {
    const cur = { semantic: 'CURRENT', topology: 'CURRENT', rep: 'rep-1', graph: 'g-1' };
    const r = bridgeAcePacketsToContextManifestV1(base({ packets: [packet(0, cur), packet(1, cur)] }));
    expect(r.receipt.representationRevision).toBe('rep-1');
    expect(r.receipt.graphRevision).toBe('g-1');
  });
  it('a non-CURRENT section with a stray identity revision is still not promoted', () => {
    const stray = { rep: 'rep-1', graph: 'g-1' };
    const r = bridgeAcePacketsToContextManifestV1(base({ packets: [packet(0, stray), packet(1, stray)] }));
    expect(r.receipt.representationRevision).toBeNull();
    expect(r.receipt.graphRevision).toBeNull();
  });
  it('different selected ordinal set -> different packet-set checksum', () => {
    const a = bridgeAcePacketsToContextManifestV1(base());
    const b = bridgeAcePacketsToContextManifestV1(base({ selectedOrdinals: [0, 2], packets: [packet(0), packet(2)] }));
    expect(a.receipt.selectedPacketSetChecksum).not.toBe(b.receipt.selectedPacketSetChecksum);
  });
  it('rejects tampered packet checksum', () => {
    const p = JSON.parse(JSON.stringify(packet(0)));
    p.evidence.data.refs = ['evidence:x'];
    expect(() => bridgeAcePacketsToContextManifestV1(base({ packets: [p, packet(1)] }))).toThrow();
  });
  it('rejects identity mismatches', () => {
    expect(() => bridgeAcePacketsToContextManifestV1(base({ packets: [packet(0, { key: 'packet:other' }), packet(1)] }))).toThrow('PACKET_KEY_MISMATCH');
    expect(() => bridgeAcePacketsToContextManifestV1(base({ packets: [packet(0, { sourceRevision: 'zzz' }), packet(1)] }))).toThrow('SOURCE_REVISION_MISMATCH');
    expect(() => bridgeAcePacketsToContextManifestV1(base({ packets: [packet(0, { workspace: 'workspace:r2' }), packet(1)] }))).toThrow('WORKSPACE_REVISION_MISMATCH');
    const badRef = { ...snapshot, rows: [row(0, { sourceRef: 'src/other.ts' }), row(1), row(2)] };
    expect(() => bridgeAcePacketsToContextManifestV1(base({ featureAdmission: { status: 'ADMITTED', snapshot: badRef } }))).toThrow('SOURCE_REF_MISMATCH');
  });
  it('rejects duplicates, missing ordinal, count mismatch, non-admitted snapshot', () => {
    expect(() => bridgeAcePacketsToContextManifestV1(base({ selectedOrdinals: [0, 0] }))).toThrow('DUPLICATE_ORDINAL');
    expect(() => bridgeAcePacketsToContextManifestV1(base({ packets: [packet(0), packet(0)] }))).toThrow('DUPLICATE_PACKET');
    expect(() => bridgeAcePacketsToContextManifestV1(base({ selectedOrdinals: [0, 9] }))).toThrow('ORDINAL_NOT_IN_SNAPSHOT:9');
    expect(() => bridgeAcePacketsToContextManifestV1(base({ packets: [packet(0)] }))).toThrow('PACKET_COUNT_MISMATCH');
    expect(() => bridgeAcePacketsToContextManifestV1(base({ featureAdmission: { status: 'BLOCKED', snapshot: null } }))).toThrow('NOT_ADMITTED');
  });
  it('rejects mixed representation or graph revisions', () => {
    const cur = { semantic: 'CURRENT', topology: 'CURRENT' };
    expect(() => bridgeAcePacketsToContextManifestV1(base({ packets: [packet(0, { ...cur, rep: 'a', graph: 'g' }), packet(1, { ...cur, rep: 'b', graph: 'g' })] }))).toThrow('MIXED_REPRESENTATION');
    expect(() => bridgeAcePacketsToContextManifestV1(base({ packets: [packet(0, { ...cur, rep: 'a', graph: 'g1' }), packet(1, { ...cur, rep: 'a', graph: 'g2' })] }))).toThrow('MIXED_GRAPH');
  });
});
