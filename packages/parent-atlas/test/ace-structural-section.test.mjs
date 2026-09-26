import test from 'node:test';
import assert from 'node:assert/strict';
import { composeAceStructuralSectionV1 } from '../dist/core/ace-structural-section-v1.js';
import { buildAcePacketV3, verifyAcePacketV3 } from '../dist/core/ace-packet-v3.js';

const h = (c) => c.repeat(64);
const obs = (id, kind, captures, start, over = {}) => ({
  schema: 'atlas.ast-grep-observation.v1', observation_id: id, rule_id: `rule:${kind}`, source_ref: 'src/a.ts', source_revision: 'src-r1',
  byte_start: start, byte_end: start + 20, matched_text_hash: h('a'), captures, observation_kind: kind, confidence: 1,
  extractor_revision: 'astgrep-0.44', canonical_authority: false, ...over,
});
const base = { source_ref: 'src/a.ts', source_revision: 'src-r1' };

test('composes symbols/imports/calls/exports deterministically from existing observations', () => {
  const list = [obs('o3', 'call', { callee: 'db.update' }, 90), obs('o1', 'function', { name: 'patchCase' }, 10), obs('o2', 'import', { source: 'zod' }, 0), obs('o4', 'export', { name: 'PATCH' }, 120), obs('o5', 'call', { callee: 'db.update' }, 150)];
  const a = composeAceStructuralSectionV1({ ...base, observations: list });
  const b = composeAceStructuralSectionV1({ ...base, observations: [...list].reverse() });
  assert.deepEqual(a, b);
  assert.equal(a.status, 'CURRENT');
  assert.equal(a.revision, 'astgrep-0.44');
  assert.deepEqual(a.data.imports, ['zod']);
  assert.deepEqual(a.data.calls, ['db.update']);
  assert.deepEqual(a.data.exports, ['PATCH']);
  assert.equal(a.data.symbols[0].name, 'patchCase');
});

test('no observations -> PENDING, never CURRENT', () => {
  const s = composeAceStructuralSectionV1({ ...base, observations: [] });
  assert.equal(s.status, 'PENDING');
  assert.equal(s.revision, null);
  assert.equal(s.data.provider_revision, null);
});

test('fails closed on source_ref / source_revision / mixed extractor revision', () => {
  assert.throws(() => composeAceStructuralSectionV1({ ...base, observations: [obs('o1', 'call', { callee: 'x' }, 0, { source_ref: 'src/b.ts' })] }), /SOURCE_REF_MISMATCH/);
  assert.throws(() => composeAceStructuralSectionV1({ ...base, observations: [obs('o1', 'call', { callee: 'x' }, 0, { source_revision: 'src-r2' })] }), /SOURCE_REVISION_MISMATCH/);
  assert.throws(() => composeAceStructuralSectionV1({ ...base, observations: [obs('o1', 'call', { callee: 'x' }, 0), obs('o2', 'call', { callee: 'y' }, 30, { extractor_revision: 'other' })] }), /MIXED_EXTRACTOR_REVISION/);
});

test('composed section is accepted by AcePacketV3 (sealed, verifies)', () => {
  const section = composeAceStructuralSectionV1({ ...base, observations: [obs('o1', 'function', { name: 'patchCase' }, 10)] });
  const pend = (data) => ({ status: 'PENDING', revision: null, evidence_refs: [], data });
  const packet = buildAcePacketV3({
    base: { packet_revision: 'pr1', envelope: { packet_key: 'packet:a', source_ref: 'src/a.ts', canonical_source_ref: 'src/a.ts', feature_id: null, source_revision: 'src-r1' }, hypergraph: null, producer_revision: 'p1' },
    identity: { packet_key: 'packet:a', source_ref: 'src/a.ts', workspace_revision: 'sha256:ws', source_revision: 'src-r1', packet_revision: 'pr1', producer_revision: 'p1', representation_id: 'semantic_768', representation_revision: null, feature_revision: null, graph_revision: null, symbol_version_id: null, tree_node_id: null },
    source: { status: 'CURRENT', revision: 'r1', evidence_refs: [], data: { language: 'typescript', source_digest: `sha256:${h('a')}`, start_byte: null, end_byte: null, ast_state: 'NOT_MATERIALIZED' } },
    semantic: pend({ summary: pend({ text: null, input_digest: null, model_revision: null }), embedding: pend({ model: null, dimension: null, input_digest: null, embedding_digest: null, vector_ref: null }), keywords: [], entities: [], concept_ids: [], domain_class: null }),
    topology: pend({ community_id: null, pagerank: null, som: null, kmeans_cluster: null, centroid_refs: [] }),
    residency: pend({ tier: 'COLD', lod: 'SOURCE_SPAN', utility: null, prefetch_reasons: [], cache_identity_checksum: null }),
    evidence: { status: 'CURRENT', revision: 'r1', evidence_refs: [], data: { refs: [], contradictions: [], stale_refs: [] } },
    structural: section,
  });
  assert.equal(verifyAcePacketV3(JSON.parse(JSON.stringify(packet))).structural.data.symbols[0].name, 'patchCase');
});
