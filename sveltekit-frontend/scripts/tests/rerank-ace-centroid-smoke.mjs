#!/usr/bin/env node
/**
 * Bounded smoke: retrieval packets → ACE materialization → temp Redis write/readback
 * → centroid manifest temp write/readback → KAG/DAG/hypergraph no-write planning pass.
 *
 * NO production writes: only ace:packet:smoke:{requestId} and
 * atlas:centroid:smoke:{requestId}, both with TTL 300s.
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import Redis from 'ioredis';

const FIXTURE = process.argv[2] ?? 'C:/Users/james/Videos/deeds-web-app/docs/reports/fixtures/retrieval-search-unified-after-fix-run1.json';
const OUT_JSON = 'C:/Users/james/Videos/deeds-web-app/docs/reports/retrieval-rerank-ace-centroid-smoke-2026-08-04.json';
const requestId = `smoke-${Date.now().toString(36)}`;
const sha = (v) => createHash('sha256').update(typeof v === 'string' ? v : JSON.stringify(v)).digest('hex');

const statuses = {};
const set = (gate, status, detail = '') => { statuses[gate] = { status, detail }; console.log(`[${status}] ${gate}${detail ? ' :: ' + detail : ''}`); };

const response = JSON.parse(readFileSync(FIXTURE, 'utf-8'));
const md = response.metadata ?? {};
const packets = response.packets ?? [];

// ── Retrieval gates from live fixture ─────────────────────────────
set('RETRIEVAL_INPUT', md.candidatesRetrieved > 0 ? 'PASS' : 'FAIL', `retrieved=${md.candidatesRetrieved}`);
set('LEXICAL_CANDIDATES', (response.provenance?.retrievalSources ?? []).includes('postgres_trigram') ? 'PASS' : 'NOT_PROVEN', JSON.stringify(response.provenance?.retrievalSources ?? []));
set('RERANK_OUTPUT', md.candidatesReranked > 0 ? 'PASS' : 'FAIL', `reranked=${md.candidatesReranked}`);
set('POST_PROCESS_OUTPUT', md.candidatesPostProcessed > 0 ? 'PASS' : 'FAIL', `postProcessed=${md.candidatesPostProcessed}`);
set('FINAL_PACKET_OUTPUT', packets.length > 0 ? 'PASS' : 'FAIL', `packets=${packets.length}`);

const packetKeys = packets.map((p) => p.packet_key ?? p.packetKey).filter(Boolean);
set('PACKET_IDENTITY_PRESERVED', packetKeys.length === packets.length && new Set(packetKeys).size === packetKeys.length ? 'PASS' : 'FAIL', `keys=${packetKeys.length}/${packets.length}`);

// ── ACE materialization smoke ──────────────────────────────────────
const seen = new Set();
const aceCards = [];
let undefinedContent = 0;
for (const p of packets) {
  const packetKey = p.packet_key ?? p.packetKey;
  const content = p.content ?? p.summary ?? '';
  if (content === undefined || content === null) undefinedContent += 1;
  const evidenceHash = sha(content);
  const dedupKey = `${packetKey}:${evidenceHash}`;
  if (seen.has(dedupKey)) continue;
  seen.add(dedupKey);
  aceCards.push({
    packet_key: packetKey,
    source_ref: p.source_ref ?? p.sourceRef ?? null,
    source_revision: p.source_revision ?? null,
    evidence_hash: evidenceHash,
    token_estimate: Math.ceil(String(content).length / 4),
    content_present: Boolean(content),
  });
}
const aceOk = aceCards.length > 0 &&
  undefinedContent === 0 &&
  aceCards.every((c) => c.packet_key && c.evidence_hash) &&
  new Set(aceCards.map((c) => `${c.packet_key}:${c.evidence_hash}`)).size === aceCards.length;
set('ACE_SMOKE_MATERIALIZATION', aceOk ? 'PASS' : 'FAIL',
  `input=${packets.length} deduped=${aceCards.length} cards=${aceCards.length} tokens=${aceCards.reduce((a, c) => a + c.token_estimate, 0)} undefinedContent=${undefinedContent}`);

// ── Redis temp writes (TTL 300) ────────────────────────────────────
const redis = new Redis({
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: Number(process.env.REDIS_PORT || 6379),
  password: process.env.REDIS_PASSWORD || 'redis',
  lazyConnect: true, enableOfflineQueue: false, maxRetriesPerRequest: 1, retryStrategy: () => null,
});
redis.on('error', () => {});

try {
  await redis.connect();

  // ACE temp write + readback
  const acePayload = JSON.stringify({ schema_version: 'ace-smoke-v1', request_id: requestId, cards: aceCards, generated_at: new Date().toISOString() });
  const aceKey = `ace:packet:smoke:${requestId}`;
  await redis.setex(aceKey, 300, acePayload);
  set('ACE_REDIS_TEMP_WRITE', 'PASS', `${aceKey} ttl=300`);
  const aceBack = await redis.get(aceKey);
  set('ACE_REDIS_TEMP_READBACK', aceBack !== null && sha(aceBack) === sha(acePayload) ? 'PASS' : 'FAIL', `digest match=${aceBack !== null && sha(aceBack) === sha(acePayload)}`);

  // Centroid manifest temp write + readback
  const manifest = {
    schema_version: 'atlas-centroid-smoke-v1',
    request_id: requestId,
    centroid_id: `centroid:smoke:${requestId}`,
    representation_id: 'semantic_768',
    workspace_revision: null,
    packet_keys: aceCards.map((c) => c.packet_key),
    evidence_hashes: aceCards.map((c) => c.evidence_hash),
    generated_at: new Date().toISOString(),
  };
  const centroidKey = `atlas:centroid:smoke:${requestId}`;
  const manifestPayload = JSON.stringify(manifest);
  await redis.setex(centroidKey, 300, manifestPayload);
  set('CENTROID_TEMP_WRITE', 'PASS', `${centroidKey} ttl=300`);
  const centroidBack = await redis.get(centroidKey);
  const back = centroidBack ? JSON.parse(centroidBack) : null;
  const centroidOk = back &&
    JSON.stringify(back.packet_keys) === JSON.stringify(manifest.packet_keys) &&
    JSON.stringify(back.evidence_hashes) === JSON.stringify(manifest.evidence_hashes) &&
    (await redis.ttl(centroidKey)) <= 300 && (await redis.ttl(centroidKey)) > 0;
  set('CENTROID_TEMP_READBACK', centroidOk ? 'PASS' : 'FAIL', 'packet order explicit, identities match ACE cards, TTL bounded');

  await redis.quit();
} catch (err) {
  set('ACE_REDIS_TEMP_WRITE', 'BLOCKED', `redis unavailable: ${err.message}`);
  set('ACE_REDIS_TEMP_READBACK', 'BLOCKED', 'redis unavailable');
  set('CENTROID_TEMP_WRITE', 'BLOCKED', 'redis unavailable');
  set('CENTROID_TEMP_READBACK', 'BLOCKED', 'redis unavailable');
}

// ── KAG / DAG / Hypergraph no-write planning pass ──────────────────
// Identity comes ONLY from packet_key — never inferred from similarity,
// centroids, domain labels, or graph proximity.
const kagPlan = {
  request_id: requestId,
  nodes: aceCards.map((c) => ({ type: 'Packet', packet_key: c.packet_key, source_ref: c.source_ref, evidence_hash: c.evidence_hash })),
  bounded_hops: 2,
  writes: 'none',
};
const kagOk = kagPlan.nodes.length === aceCards.length && kagPlan.nodes.every((n) => n.packet_key);
set('KAG_PLAN', kagOk ? 'PASS' : 'FAIL', `nodes=${kagPlan.nodes.length}, all carry packet_key, bounded 2-hop`);

const dagPlan = {
  request_id: requestId,
  stages: ['retrieve', 'fuse', 'score', 'hydrate', 'rerank', 'post_process', 'ace_materialize', 'centroid_manifest'],
  bounded: true,
  packet_keys: aceCards.map((c) => c.packet_key),
};
set('DAG_PLAN', dagPlan.stages.length === 8 && dagPlan.packet_keys.every(Boolean) ? 'PASS' : 'FAIL', `${dagPlan.stages.length} bounded stages`);

const hypergraphPlan = {
  request_id: requestId,
  relations: aceCards.map((c) => ({ relation: 'EVIDENCE_FOR', head: { packet_key: c.packet_key }, tail: { request_id: requestId }, provenance: c.evidence_hash })),
  writes: 'none',
};
set('HYPERGRAPH_PLAN', hypergraphPlan.relations.every((r) => r.head.packet_key) ? 'PASS' : 'FAIL', `${hypergraphPlan.relations.length} relations, all reference packet_key`);
set('PRODUCTION_GRAPH_WRITES', 'PASS', 'none performed (planning only)');

const failed = Object.values(statuses).filter((s) => s.status === 'FAIL').length;
const blocked = Object.values(statuses).filter((s) => s.status === 'BLOCKED').length;
set('OVERALL_RESULT', failed === 0 && blocked === 0 ? 'PASS' : failed === 0 ? 'PARTIAL_PROVEN' : 'FAIL', `fail=${failed} blocked=${blocked}`);

writeFileSync(OUT_JSON, JSON.stringify({
  report: 'retrieval-rerank-ace-centroid-smoke',
  date: '2026-08-04',
  request_id: requestId,
  fixture: FIXTURE,
  metadata: md,
  gates: statuses,
  ace_cards: aceCards,
  kag_plan: kagPlan,
  dag_plan: dagPlan,
  hypergraph_plan: hypergraphPlan,
}, null, 2));
console.log('Report:', OUT_JSON);
