import test from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import { buildAcePacketV3 } from '../dist/core/ace-packet-v3.js';
import { admitCachedAcePacketV3, acePacketIdentityDigestV3 } from '../dist/core/ace-packet-v3-admission.js';
import {
  scorePatchCandidateV1, rankPatchCandidatesV1, COSINE_ONLY_CAP_V1,
  buildToolRegistryChecksumV1, admitToolProposalV1, buildExecutionReceiptV1,
} from '../dist/core/ace-agentic-admission-v1.js';

const sha = (c) => `sha256:${c.repeat(64)}`;
const section = (data, status = 'CURRENT', revision = 'r1') => ({ status, revision, evidence_refs: [], data });
function packet(over = {}) {
  return buildAcePacketV3({
    base: { packet_revision: 'p1', producer_revision: 'c1', hypergraph: null, envelope: { packet_key: 'packet:a', source_ref: 'src/a.ts', canonical_source_ref: 'src/a.ts', feature_id: null, source_revision: 'src-r1' } },
    identity: { packet_key: 'packet:a', source_ref: 'src/a.ts', workspace_revision: 'ws1', source_revision: 'src-r1', packet_revision: 'p1', producer_revision: 'c1', representation_id: 'semantic_768', representation_revision: 'rep1', feature_revision: null, graph_revision: 'g1', symbol_version_id: null, tree_node_id: null },
    source: section({ language: 'typescript', source_digest: sha('a'), start_byte: null, end_byte: null, ast_state: 'NOT_MATERIALIZED' }),
    semantic: section({ summary: section({ text: null, input_digest: null, model_revision: null }, 'PENDING', null), embedding: section({ model: null, dimension: null, input_digest: null, embedding_digest: null, vector_ref: null }, 'PENDING', null), keywords: [], entities: [], concept_ids: [], domain_class: null }, 'HINT', null),
    topology: section({ community_id: null, pagerank: 0.1, som: null, kmeans_cluster: null, centroid_refs: [] }, 'HINT', null),
    residency: section({ tier: 'COLD', lod: 'IDENTITY', utility: null, prefetch_reasons: [], cache_identity_checksum: null }, 'PENDING', null),
    evidence: section({ refs: [], contradictions: [], stale_refs: [] }),
    ...over,
  });
}
const expectation = { packet_key: 'packet:a', source_revision: 'src-r1', workspace_revision: 'ws1', representation_id: 'semantic_768', representation_revision: 'rep1', graph_revision: 'g1' };

test('a null hypergraph is representable (no fabricated relationship evidence)', () => {
  assert.equal(packet().base.hypergraph, null);
});

test('cache admission: exact identity + intact checksum is a HIT', () => {
  const p = packet();
  const d = admitCachedAcePacketV3(JSON.stringify(p), { ...expectation, packet_checksum: p.integrity.packet_checksum });
  assert.equal(d.decision, 'HIT');
});

test('cache admission: every changed identity dimension is a MISS (TTL is not freshness)', () => {
  const raw = JSON.stringify(packet());
  for (const [field, value] of [['source_revision', 'src-r2'], ['workspace_revision', 'ws2'], ['representation_revision', 'rep2'], ['graph_revision', 'g2'], ['representation_id', 'latent_64']]) {
    const d = admitCachedAcePacketV3(raw, { ...expectation, [field]: value });
    assert.deepEqual(d, { decision: 'MISS', reason: `IDENTITY_MISMATCH:${field}` });
  }
});

test('cache admission: tampered, malformed and garbage entries are MISS, never a throw', () => {
  const p = JSON.parse(JSON.stringify(packet()));
  p.topology.data.pagerank = 0.9;
  assert.equal(admitCachedAcePacketV3(JSON.stringify(p), expectation).reason, 'CHECKSUM_MISMATCH');
  assert.equal(admitCachedAcePacketV3('{not json', expectation).reason, 'UNPARSEABLE');
  assert.equal(admitCachedAcePacketV3('{"schema":"nope"}', expectation).reason, 'SCHEMA_INVALID');
});

test('identity digest is stable and changes with any identity field', () => {
  const a = packet(); const b = packet();
  assert.equal(acePacketIdentityDigestV3(a.identity), acePacketIdentityDigestV3(b.identity));
  assert.notEqual(acePacketIdentityDigestV3(a.identity), acePacketIdentityDigestV3({ ...a.identity, graph_revision: 'g9' }));
});

const cand = (over = {}) => ({
  source_ref: 'src/a.ts', source_revision: 'src-r1',
  signals: { cosine: 0.9, diagnostic: 1, symbol: 0.9, graph_ppr: 0.8, co_change: 0.4, test_relevance: 0.8, authority: 0.7 },
  penalties: { risk: 0.1, stale_lineage: 0, generated_vendor: 0 }, evidence_refs: ['e1'], required_tests: ['t1'], ...over,
});

test('patch ranking stores components, penalties and missing signals', () => {
  const s = scorePatchCandidateV1(cand({ signals: { ...cand().signals, co_change: null } }));
  assert.ok(s.score > 0.5);
  assert.deepEqual(s.missing_signals, ['co_change']);
  assert.ok(s.contributions.cosine > 0 && s.penalties_applied.risk > 0);
  assert.equal(s.eligibility, 'ELIGIBLE');
});

test('cosine alone can never win: a cosine-only candidate is capped', () => {
  const zero = { diagnostic: 0, symbol: 0, graph_ppr: 0, co_change: 0, test_relevance: 0, authority: 0 };
  const only = scorePatchCandidateV1(cand({ signals: { cosine: 1, ...zero }, penalties: { risk: 0, stale_lineage: 0, generated_vendor: 0 } }));
  assert.equal(only.score <= COSINE_ONLY_CAP_V1, true);
  const ranked = rankPatchCandidatesV1([
    cand({ source_ref: 'src/cosine-only.ts', signals: { cosine: 1, ...zero } }),
    cand({ source_ref: 'src/well-supported.ts', signals: { cosine: 0.5, diagnostic: 1, symbol: 0.9, graph_ppr: 0.8, co_change: 0.4, test_relevance: 0.8, authority: 0.7 } }),
  ]);
  assert.equal(ranked[0].source_ref, 'src/well-supported.ts');
});

test('unqualified or stale-lineage candidates are blocked and rank below eligible ones', () => {
  const ranked = rankPatchCandidatesV1([
    cand({ source_ref: 'src/no-rev.ts', source_revision: null }),
    cand({ source_ref: 'src/stale.ts', penalties: { risk: 0, stale_lineage: 1, generated_vendor: 0 } }),
    cand({ source_ref: 'src/ok.ts', signals: { cosine: 0.2, diagnostic: 0.5, symbol: 0.3, graph_ppr: 0.2, co_change: 0.1, test_relevance: 0.2, authority: 0.2 } }),
  ]);
  assert.equal(ranked[0].source_ref, 'src/ok.ts');
  assert.deepEqual(ranked.slice(1).map((r) => r.eligibility).sort(), ['BLOCKED_STALE_LINEAGE', 'BLOCKED_UNQUALIFIED_REVISION']);
});

const entries = [{ name: 'code.read_file', access: 'READ', schema_id: 'read' }, { name: 'code.edit_file', access: 'WRITE', schema_id: 'edit' }];
const registry = { revision: 'reg1', checksum: buildToolRegistryChecksumV1(entries), entries };
const validators = { read: z.object({ path: z.string() }).strict(), edit: z.object({ path: z.string(), patch: z.string() }).strict() };
const proposal = (over = {}) => ({ tool_name: 'code.read_file', arguments: { path: 'src/a.ts' }, reason: 'inspect', evidence_refs: ['e1'], confidence: 0.9, ...over });
const admit = (p, extra = {}) => admitToolProposalV1({ proposal: p, registry, argument_validators: validators, policy: { allow_write: false }, ...extra });

test('tool admission: registry, schema, policy, revision stages in order', () => {
  assert.equal(admit(proposal()).admitted, true);
  assert.equal(admit(proposal({ tool_name: 'shell.rm' })).code, 'TOOL_NOT_IN_REGISTRY');
  assert.equal(admit(proposal({ arguments: { path: 1 } })).code, 'ARGUMENTS_INVALID');
  assert.equal(admit(proposal({ arguments: { path: 'x', extra: 1 } })).code, 'ARGUMENTS_INVALID');
  const tamperedRegistry = { ...registry, checksum: sha('0') };
  assert.equal(admitToolProposalV1({ proposal: proposal(), registry: tamperedRegistry, argument_validators: validators, policy: { allow_write: false } }).code, 'REGISTRY_CHECKSUM_MISMATCH');
});

test('tool admission: selection is not authorization; writes need policy AND a fresh planned revision', () => {
  const edit = (over = {}) => proposal({ tool_name: 'code.edit_file', arguments: { path: 'src/a.ts', patch: 'x' }, planned_source_revision: 'src-r1', ...over });
  assert.equal(admit(edit()).code, 'WRITE_NOT_ALLOWED');
  const w = { policy: { allow_write: true } };
  assert.equal(admit(edit({ planned_source_revision: null }), { ...w, current_source_revision: 'src-r1' }).code, 'PLANNED_REVISION_MISSING');
  assert.equal(admit(edit(), { ...w }).code, 'CURRENT_REVISION_UNKNOWN');
  assert.equal(admit(edit(), { ...w, current_source_revision: 'src-r2' }).code, 'PATCH_STALE');
  const ok = admit(edit(), { ...w, current_source_revision: 'src-r1' });
  assert.equal(ok.admitted, true);
  assert.match(ok.arguments_checksum, /^sha256:[0-9a-f]{64}$/);
});

test('execution receipts: no success claim without evidence', () => {
  const base = { tool_name: 'code.edit_file', access: 'WRITE', arguments_checksum: sha('a'), registry_checksum: sha('b'), outcome: 'SUCCESS', before_hash: 'h1', after_hash: 'h2', diff_ref: 'diff:1', validation_result_ids: ['tsc:1'], failure_code: null };
  assert.doesNotThrow(() => buildExecutionReceiptV1(base));
  assert.throws(() => buildExecutionReceiptV1({ ...base, after_hash: 'h1' }), /before_hash != after_hash/);
  assert.throws(() => buildExecutionReceiptV1({ ...base, diff_ref: null }), /diff_ref/);
  assert.throws(() => buildExecutionReceiptV1({ ...base, validation_result_ids: [] }), /validation_result_ids/);
  assert.throws(() => buildExecutionReceiptV1({ ...base, outcome: 'FAILED' }), /failure_code/);
});
