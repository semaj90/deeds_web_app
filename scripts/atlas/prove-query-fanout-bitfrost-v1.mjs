#!/usr/bin/env node
/**
 * QUERY-FANOUT-BITFROST-01 — read-only receipt. One representative query through the fanout chain:
 * classification -> .okf vocabulary -> TRACE capability plan -> semantic Top-K -> KMeans centroid ->
 * SOM -> ACE cache identity -> proposed BitFrost bucket -> live cache state.
 * Reuses existing owners (TRACE `domain.classify`, Ollama embed, Qdrant search, gpu_cluster_centroids,
 * AceBitfrostCacheIdentityV1 fields). Writes ONLY docs/reports/query-fanout-bitfrost-v1.json.
 * No Postgres/Qdrant/Valkey/Neo4j writes. canonicalAuthority=false, cacheWrites=false.
 * A stage that cannot be proven is reported BLOCKED/NOT_APPLICABLE with the reason — never invented.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const QUERY = process.argv.find((a) => a.startsWith('--query='))?.slice(8)
  ?? 'why does packet cache invalidation leave stale bifrost semantic keys after a postgres packet update';
const TRACE = process.env.TRACE_MCP_URL ?? 'http://127.0.0.1:8788/mcp';
// OLLAMA_HOST is often a bare "0.0.0.0" (bind address): normalize to a connectable URL (CLAUDE.md rule).
const ollamaRaw = (process.env.OLLAMA_HOST ?? 'http://127.0.0.1:11434').replace(/^(https?:\/\/)?0\.0\.0\.0/, '$1127.0.0.1');
const OLLAMA = ollamaRaw.startsWith('http') ? ollamaRaw : `http://${ollamaRaw}${/:\d+$/.test(ollamaRaw) ? '' : ':11434'}`;
const QDRANT = process.env.QDRANT_URL ?? 'http://127.0.0.1:6333';
const COLLECTION = 'codebase_chunks_768_v2';
const sha = (v) => `sha256:${crypto.createHash('sha256').update(typeof v === 'string' ? v : JSON.stringify(v)).digest('hex')}`;
const stages = [];
const stage = (id, weight, status, data = {}) => { stages.push({ id, weight, status, ...data }); return status; };
const sh = (cmd, args) => execFileSync(cmd, args, { maxBuffer: 1 << 26, timeout: 30000 }).toString();
const psql = (sql) => sh('docker', ['exec', 'legal-ai-postgres', 'psql', '-U', 'legal_admin', '-d', 'legal_ai_db', '-At', '-F', '|', '-c', sql]);
const valkey = (...a) => sh('docker', ['exec', 'legal-ai-valkey', 'valkey-cli', '-a', process.env.REDIS_PASSWORD ?? 'redis', '--no-auth-warning', ...a]).trim();
const post = async (url, body, ms = 20000) => {
  const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' }, body: JSON.stringify(body), signal: AbortSignal.timeout(ms) });
  const t = await r.text();
  // TRACE answers as SSE ("event: message\ndata: {...}"); Ollama/Qdrant answer plain JSON.
  const dataLines = t.split('\n').filter((l) => l.startsWith('data:'));
  const payload = dataLines.length ? dataLines[dataLines.length - 1].slice(5).trim() : t.trim();
  return { ok: r.ok, status: r.status, body: JSON.parse(payload) };
};
const cosine = (a, b) => { let d = 0, na = 0, nb = 0; for (let i = 0; i < a.length; i++) { d += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; } return d / (Math.sqrt(na) * Math.sqrt(nb) || 1); };

// 1. request identity
const requestHash = sha({ schema: 'atlas.query-fanout-request.v1', query: QUERY });
stage('request_identity', 10, 'DONE', { requestHash });

// 2. classification (TRACE domain.classify — existing owner)
let classification = null;
try {
  const r = await post(TRACE, { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'domain.classify', arguments: { text: QUERY } } });
  const text = r.body?.result?.content?.[0]?.text ?? '';
  classification = { isError: !!r.body?.result?.isError, raw: text.slice(0, 1200) };
  // Routing admissibility is FAIL-CLOSED: the classifier is a provisional sklearn NB+LR pair with no calibration set in this
  // repo, so no default confidence floor is invented. A caller must supply a calibrated floor (--min-confidence=<0..1> or
  // DOMAIN_MIN_CONFIDENCE); even then BOTH models must agree on the label and BOTH must clear it. The label never becomes
  // cache identity, and it is only a hint until .okf validation also passes.
  let routing = { routingAdmissible: false, routingReasons: ['CLASSIFIER_OUTPUT_UNPARSEABLE'] };
  try {
    const p = JSON.parse(text);
    const label = p.artifacts?.label ?? null, nb = p.artifacts?.naive_bayes_label ?? null, lr = p.artifacts?.logistic_regression_label ?? null;
    const nbProb = p.features?.naive_bayes_domain_probability ?? null, lrProb = p.features?.logistic_regression_domain_probability ?? null;
    const floorRaw = process.argv.find((a) => a.startsWith('--min-confidence='))?.slice(17) ?? process.env.DOMAIN_MIN_CONFIDENCE;
    const floor = floorRaw !== undefined && floorRaw !== '' && Number.isFinite(Number(floorRaw)) ? Number(floorRaw) : null;
    const reasons = [];
    if (floor === null) reasons.push('NO_CALIBRATED_FLOOR_SUPPLIED (no calibration set exists; a default number would be invented)');
    if (!(label && label === nb && label === lr)) reasons.push(`MODEL_DISAGREEMENT label=${label} nb=${nb} lr=${lr}`);
    if (floor !== null && !(nbProb >= floor && lrProb >= floor)) reasons.push(`BELOW_FLOOR nb=${nbProb?.toFixed?.(3)} lr=${lrProb?.toFixed?.(3)} floor=${floor}`);
    if (p.warnings?.length) reasons.push(`CLASSIFIER_WARNINGS:${p.warnings.length}`);
    routing = { predictedLabel: label, modelRevision: p.artifacts?.model_revision ?? null, backend: p.backend ?? null, nbProbability: nbProb, lrProbability: lrProb, minConfidenceFloor: floor, provisional: 'UNPROVEN_NO_CALIBRATION_SET', routingAdmissible: reasons.length === 0, routingReasons: reasons };
  } catch { /* keep the fail-closed default */ }
  classification = { ...classification, ...routing };
  stage('classification', 10, classification.isError ? 'BLOCKED' : 'DONE', { tool: 'domain.classify', ...classification });
} catch (e) { stage('classification', 10, 'BLOCKED', { error: String(e.message).slice(0, 200) }); }

// 3. .okf vocabulary + TRACE capability plan
try {
  const okfDir = path.join(ROOT, '.okf');
  const listYaml = (d) => (fs.existsSync(path.join(okfDir, d)) ? fs.readdirSync(path.join(okfDir, d)).filter((f) => f.endsWith('.yaml')).map((f) => f.replace(/\.yaml$/, '')) : []);
  const okf = { domains: listYaml('domains'), concepts: listYaml('concepts'), languages: listYaml('languages'), indexes: listYaml('indexes') };
  const hay = (classification?.raw ?? '').toLowerCase();
  const okfMatches = [...okf.domains, ...okf.concepts].filter((n) => hay.includes(n.toLowerCase()));
  const tl = await post(TRACE, { jsonrpc: '2.0', id: 2, method: 'tools/list' }, 30000);
  const names = tl.body.result.tools.map((t) => t.name);
  const lane = (label, re) => ({ lane: label, tools: names.filter((n) => re.test(n)).slice(0, 6) });
  const plan = [lane('lexical', /search_postgres_fts|search\.postgres_fts|kb\.trace_search|search\.hybrid/), lane('ast', /hypergraph\.search|codebase\.context_for_file|file\.read_window/),
    lane('semantic_768', /atlas\.packet_dense_search|search\.go_hybrid|kag_search/), lane('taxonomy', /^taxonomy\.|domain\.classify|pos_concept_tagging/),
    lane('graph', /graph\.pagerank_top|graph\.expand_neighborhood|atlas\.graph\.pagerank/), lane('db_schema', /^db\.(table_inspect|schema_overview)$/)];
  stage('okf_validation', 10, okfMatches.length ? 'DONE' : 'PARTIAL', { okfCounts: Object.fromEntries(Object.entries(okf).map(([k, v]) => [k, v.length])), okfMatchesInClassification: okfMatches, note: okfMatches.length ? undefined : 'classifier output named no .okf domain/concept id; vocabulary validation not satisfied' });
  stage('capability_plan', 10, plan.every((p) => p.tools.length) ? 'DONE' : 'PARTIAL', { traceToolCount: names.length, plan });
} catch (e) { stage('capability_plan', 20, 'BLOCKED', { error: String(e.message).slice(0, 200) }); }

// 4. semantic Top-K (Ollama embeddinggemma -> Qdrant content vector, read-only search)
let embedding = null;
try {
  const er = await post(`${OLLAMA}/api/embed`, { model: 'embeddinggemma:latest', input: QUERY });
  embedding = er.body.embeddings?.[0];
  if (!embedding || embedding.length !== 768) throw new Error(`embedding dim ${embedding?.length}`);
  const sr = await post(`${QDRANT}/collections/${COLLECTION}/points/search`, { vector: { name: 'content', vector: embedding }, limit: 10, with_payload: ['source_ref', 'packet_key', 'path', 'symbol'] });
  const hits = (sr.body.result ?? []).map((h) => ({ id: h.id, score: +h.score.toFixed(4), packetKey: h.payload?.packet_key ?? null, sourceRef: h.payload?.source_ref ?? h.payload?.path ?? null }));
  stage('semantic_topk', 20, hits.length ? 'DONE' : 'BLOCKED', { collection: COLLECTION, queryPromptContract: 'NOT_PROVEN (EG-GGUF-3: retrieval-query task prefix unverified)', hitCount: hits.length, hitsWithPacketKey: hits.filter((h) => h.packetKey).length, hits });
} catch (e) { stage('semantic_topk', 20, 'BLOCKED', { error: String(e.message).slice(0, 200) }); }

// 5. KMeans nearest centroid (brute-force over gpu_cluster_centroids, 768-d)
try {
  if (!embedding) throw new Error('no query embedding');
  const rows = psql("select cluster_id, cluster_type, centroid_vec::text from gpu_cluster_centroids").trim().split('\n').map((l) => { const [id, type, vec] = l.split('|'); return { id: +id, type, vec: vec.replace(/[{}]/g, '').split(',').map(Number) }; });
  const scored = rows.filter((r) => r.vec.length === 768).map((r) => ({ clusterId: r.id, clusterType: r.type, cosine: +cosine(embedding, r.vec).toFixed(4) })).sort((a, b) => b.cosine - a.cosine);
  stage('kmeans_centroid', 10, scored.length ? 'DONE' : 'BLOCKED', { centroidCount: rows.length, space: '768-d', clusterTypes: [...new Set(rows.map((r) => r.type))], centroidsDatedOldest: '2026-07-14 (kmeans_js)', top3: scored.slice(0, 3), role: 'routing hint only — not identity, not an RRF vote' });
} catch (e) { stage('kmeans_centroid', 10, 'BLOCKED', { error: String(e.message).slice(0, 200) }); }

// 6. SOM — cannot be honestly resolved (verified separately: SOM_REVISION_PROVENANCE_01)
stage('som_cell', 5, 'BLOCKED', { reason: 'codebook is 64-d (autoencoder latent, weights recorded untrained); no somRevision on assignments; PG som_cell_x/y vs som_row/col disagree on 99.7% of rows', evidence: 'CLAUDE.md SOM_REVISION_PROVENANCE_01' });

// 7. ACE cache identity — fail closed on missing revisions
const need = ['candidateSnapshotRevision', 'ordinalMapChecksum', 'graphRevision', 'featureRevision', 'representationRevision', 'producerRevision', 'normalizationPolicyRevision'];
let liveRev = {};
try { liveRev = { workspaceRevision: psql("select workspace_revision from atlas_workspace_source_bindings limit 1").trim() || null }; } catch { /* ignore */ }
stage('ace_cache_identity', 10, 'BLOCKED', { schema: 'AceBitfrostCacheIdentityV1 (atlas/cache/ace-bitfrost-cache-identity-v1.ts)', unbuildableBecauseMissing: need, reason: 'no frozen CandidateOrdinalMap / CandidateFeatureMatrix exists for this query (14.3b/14.3c blocked upstream); a key built without them would be invented', knownRevisions: liveRev });

// 8. proposed bucket + 9. live cache state
const fam = {}; for (const k of valkey('--scan', '--pattern', '*').split('\n').filter(Boolean)) { const p = k.split(':').slice(0, 2).join(':'); fam[p] = (fam[p] ?? 0) + 1; }
const cfg = (n) => valkey('CONFIG', 'GET', n).split('\n')[1];
const cache = { maxmemory: cfg('maxmemory'), maxmemoryPolicy: cfg('maxmemory-policy'), dbsize: +valkey('DBSIZE'),
  bifrostSem: Object.entries(fam).filter(([k]) => k.startsWith('bifrost:sem')).reduce((s, [, v]) => s + v, 0), bitfrostKeys: Object.entries(fam).filter(([k]) => /^(bitfrost|centroid|gpu)/.test(k)).reduce((s, [, v]) => s + v, 0),
  residencyPolicy: 'HOT 30d / WARM 7d / COLD 1d (bitfrost-residency-policy-v1.json, WIRED_POLICY_ADAPTER_PROVEN_TESTS_ONLY — Valkey behavior NOT proven)' };
stage('bitfrost_bucket', 10, 'BLOCKED', { proposedBucket: null, reason: 'no ACE cache identity (see ace_cache_identity) => no bucket key; taxonomy/cluster ids never serve as cache identity by themselves' });
stage('cache_state', 5, 'DONE', { ...cache, lookup: 'MISS_NO_IDENTITY', hit: false });

// progress: workflow completion of applicable stages, NOT model confidence; BLOCKED contributes 0
const total = stages.reduce((s, x) => s + x.weight, 0);
const done = stages.reduce((s, x) => s + (x.status === 'DONE' ? x.weight : x.status === 'PARTIAL' ? x.weight / 2 : 0), 0);
const blocked = stages.filter((s) => s.status === 'BLOCKED').map((s) => s.id);
const receipt = { schema: 'atlas.query-fanout-bitfrost.v1', generatedAt: new Date().toISOString(), gate: 'QUERY_FANOUT_BITFROST_READ_ONLY_PROVEN',
  status: blocked.length ? 'PARTIAL_PROVEN' : 'READ_ONLY_PROVEN', query: QUERY, requestHash,
  workflowProgress: { percent: +((done / total) * 100).toFixed(1), basis: 'sum(weight of DONE + half PARTIAL) / sum(all stage weights); workflow completion, not confidence', blockedStages: blocked },
  stages, canonicalAuthority: false, cacheWrites: false, promotionAuthorized: false, writesPerformed: false };
const out = path.join(ROOT, 'docs/reports/query-fanout-bitfrost-v1.json');
fs.writeFileSync(out, `${JSON.stringify(receipt, null, 2)}\n`);
console.log(JSON.stringify({ status: receipt.status, progress: receipt.workflowProgress, stages: stages.map((s) => `${s.id}:${s.status}`), cache, report: out }, null, 1));
