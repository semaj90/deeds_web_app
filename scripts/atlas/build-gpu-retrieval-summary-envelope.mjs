#!/usr/bin/env node
/**
 * Build bounded GPU retrieval summary envelopes for Gemma4/LangExtract.
 *
 * This materializes the current concrete retrieval contract into NDJSON:
 *   Qdrant named-vector candidates + Go Retrieval candidates + rg lexical refs
 *   -> RRF fusion -> Postgres atlas_packets truth join -> summary envelope.
 *
 * It does not mutate packet identity, Postgres, Qdrant, Neo4j, CouchDB, or
 * mapreduce outputs. Redis/BitFrost warming is cache-only.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import pg from 'pg';
import {
  loadRepoEnv,
  resolveDatabaseUrl,
  REPO_ROOT,
} from './connection-config.mjs';
import {
  resolveAtlasRedisContext,
  runRedisCli,
} from './lib/redis-valkey.mjs';

const args = new Map();
for (const arg of process.argv.slice(2)) {
  const match = arg.match(/^--([^=]+)=(.*)$/);
  if (match) args.set(match[1], match[2]);
  else if (arg.startsWith('--')) args.set(arg.slice(2), 'true');
}

const env = loadRepoEnv();
const QUERY = String(args.get('query') ?? 'GPU Qdrant TurboVec Go Retrieval HyperRAG dense search summaries');
const GROUP_KEY = String(args.get('group-key') ?? 'retrieval.qdrant.turbovec.go');
const FEATURE_LABEL = String(args.get('feature-label') ?? 'GPU vector retrieval summary envelope');
const TOP_K = Number(args.get('top-k') ?? 20);
const RRF_K = Number(args.get('rrf-k') ?? 60);
const SKIP_PROOF = args.has('skip-proof');
const WARM_REDIS = !args.has('no-redis');
const OUT_NDJSON = path.resolve(REPO_ROOT, String(args.get('out') ?? '.tmp/gpu-retrieval-summary-envelopes.ndjson'));
const OUT_JSON = path.resolve(REPO_ROOT, String(args.get('report') ?? 'docs/reports/gpu-retrieval-summary-envelope-proof.json'));
const OUT_MD = path.resolve(REPO_ROOT, String(args.get('report-md') ?? 'docs/reports/gpu-retrieval-summary-envelope-proof.md'));
const FLOW_PROOF_JSON = path.resolve(REPO_ROOT, 'docs/reports/retrieval-summarization-flow-proof.json');
const GO_RETRIEVAL_URL = String(args.get('go-retrieval-url') ?? env.GO_RETRIEVAL_HTTP_URL ?? env.RETRIEVAL_HTTP_URL ?? 'http://127.0.0.1:8100').replace(/\/+$/, '');

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2) + '\n', 'utf8');
}

function statusFromLanes(lanes) {
  const statuses = Object.values(lanes).map((lane) => lane.status);
  if (statuses.includes('FAIL')) return 'FAIL';
  if (statuses.includes('WARN') || statuses.includes('FALLBACK_PASS')) return 'WARN';
  return 'LIVE_PASS';
}

function normRef(value) {
  return String(value ?? '').replace(/\\/g, '/').trim();
}

function stableId(prefix, value) {
  return `${prefix}:${crypto.createHash('sha256').update(String(value)).digest('hex').slice(0, 16)}`;
}

function candidateKey(candidate) {
  return String(candidate.packet_key || candidate.source_ref || candidate.file_path || candidate.id || '').trim();
}

function addRank(map, source, candidates) {
  candidates.forEach((candidate, index) => {
    const key = candidateKey(candidate);
    if (!key) return;
    const existing = map.get(key) ?? {
      key,
      packet_key: candidate.packet_key ?? null,
      source_ref: normRef(candidate.source_ref ?? candidate.file_path),
      feature_id: candidate.feature_id ?? null,
      feature_label: candidate.feature_label ?? null,
      sources: {},
      rrf_score: 0,
    };
    const rank = index + 1;
    existing.sources[source] = {
      rank,
      score: Number(candidate.score ?? candidate.final_score ?? candidate.hybrid_score ?? 0),
      id: candidate.id ?? candidate.chunk_id ?? null,
    };
    existing.rrf_score += 1 / (RRF_K + rank);
    if (!existing.packet_key && candidate.packet_key) existing.packet_key = candidate.packet_key;
    if (!existing.source_ref && (candidate.source_ref || candidate.file_path)) existing.source_ref = normRef(candidate.source_ref ?? candidate.file_path);
    if (!existing.feature_id && candidate.feature_id) existing.feature_id = candidate.feature_id;
    if (!existing.feature_label && candidate.feature_label) existing.feature_label = candidate.feature_label;
    map.set(key, existing);
  });
}

function runFlowProof() {
  if (SKIP_PROOF) return { skipped: true, status: 'SKIPPED' };
  const result = spawnSync(process.execPath, ['scripts/atlas/prove-retrieval-summarization-flow.mjs', `--query=${QUERY}`], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 8,
  });
  return {
    skipped: false,
    status: result.status === 0 ? 'LIVE_PASS' : 'FAIL',
    exit_code: result.status,
    stdout_tail: String(result.stdout ?? '').split(/\r?\n/).filter(Boolean).slice(-8),
    stderr_tail: String(result.stderr ?? '').split(/\r?\n/).filter(Boolean).slice(-8),
  };
}

async function fetchJson(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    signal: AbortSignal.timeout(options.timeoutMs ?? 30_000),
  });
  const text = await res.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { raw: text };
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 300)}`);
  return body;
}

async function goRetrievalCandidates() {
  const started = Date.now();
  const queries = [
    QUERY,
    'Parent Atlas Qdrant TurboVec summarization',
    'Qdrant TurboVec Go Retrieval codebase search',
  ];
  try {
    let chunks = [];
    let query_used = QUERY;
    for (const query of queries) {
      const body = await fetchJson(`${GO_RETRIEVAL_URL}/search/codebase`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, limit: TOP_K }),
        timeoutMs: 30_000,
      });
      chunks = body?.results ?? body?.Results ?? body?.chunks ?? body?.Chunks ?? [];
      query_used = query;
      if (Array.isArray(chunks) && chunks.length > 0) break;
    }
    return {
      lane: {
        status: Array.isArray(chunks) && chunks.length ? 'LIVE_PASS' : 'FAIL',
        url: GO_RETRIEVAL_URL,
        endpoint: '/search/codebase',
        query_used,
        candidates: Array.isArray(chunks) ? chunks.length : 0,
        duration_ms: Date.now() - started,
      },
      candidates: Array.isArray(chunks) ? chunks.map((hit) => ({
        id: hit.id ?? hit.chunk_id ?? hit.chunkId ?? null,
        packet_key: hit.sourceMetadata?.packetKey ?? hit.source_metadata?.packet_key ?? hit.packet_key ?? null,
        source_ref: normRef(hit.filePath ?? hit.file_path ?? hit.sourceMetadata?.sourceRef ?? hit.source_metadata?.source_ref),
        feature_id: hit.sourceMetadata?.featureId ?? hit.source_metadata?.feature_id ?? hit.feature_id ?? null,
        feature_label: hit.feature_label ?? path.basename(normRef(hit.filePath ?? hit.file_path ?? '')),
        score: Number(hit.score ?? hit.finalScore ?? hit.final_score ?? 0),
      })) : [],
    };
  } catch (error) {
    return {
      lane: {
        status: 'FAIL',
        url: GO_RETRIEVAL_URL,
        endpoint: '/search/codebase',
        error: error.message,
        duration_ms: Date.now() - started,
      },
      candidates: [],
    };
  }
}

function rgCandidates() {
  const started = Date.now();
  const terms = QUERY.toLowerCase()
    .match(/[a-z0-9_.$/-]{4,}/g)
    ?.filter((term) => !['with', 'from', 'summary', 'summaries'].includes(term))
    .slice(0, 6) ?? [];
  if (!terms.length) {
    return { lane: { status: 'WARN', reason: 'No lexical terms extracted', duration_ms: Date.now() - started }, candidates: [] };
  }
  const pattern = terms.map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  const result = spawnSync('rg', ['-l', '-i', '-m', '1', pattern, REPO_ROOT, '-g', '!node_modules', '-g', '!.git', '-g', '!.svelte-kit', '-g', '!dist', '-g', '!models', '-g', '!archive', '-g', '!backups'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 4,
  });
  if (result.error) {
    return { lane: { status: 'WARN', error: result.error.message, duration_ms: Date.now() - started }, candidates: [] };
  }
  const candidates = String(result.stdout ?? '')
    .split(/\r?\n/)
    .map((line) => normRef(path.relative(REPO_ROOT, line.trim())))
    .filter((filePath) => filePath && !filePath.startsWith('..'))
    .slice(0, TOP_K)
    .map((source_ref, index) => ({ source_ref, score: TOP_K - index, matches: 1 }));
  return {
    lane: {
      status: candidates.length ? 'LIVE_PASS' : 'WARN',
      terms,
      candidates: candidates.length,
      exit_code: result.status,
      duration_ms: Date.now() - started,
    },
    candidates,
  };
}

async function postgresJoin(fused) {
  const started = Date.now();
  const pool = new pg.Pool({ connectionString: resolveDatabaseUrl(env), max: 1 });
  try {
    const packetKeys = fused.map((row) => row.packet_key).filter(Boolean);
    const sourceRefs = fused.map((row) => row.source_ref).filter(Boolean);
    const result = await pool.query(`
      SELECT packet_id, packet_ulid, packet_key, source_ref, canonical_source_ref, source_ref_key, file_path, directory_path,
             feature_id, title_id, feature_label, domain_class,
             COALESCE(metadata->>'ontology_label', topology->>'ontology_label', payload->>'ontology_label') AS ontology_label,
             COALESCE(metadata->>'topology_label', topology->>'topology_label', payload->>'topology_label') AS topology_label,
             community_id, cluster_id, som_cluster, kmeans_cluster, pagerank,
             summary, tags, metadata, topology
      FROM atlas_packets
      WHERE packet_key = ANY($1::text[])
         OR source_ref = ANY($2::text[])
         OR file_path = ANY($2::text[])
      LIMIT $3
    `, [packetKeys, sourceRefs, TOP_K]);
    const byPacket = new Map(result.rows.map((row) => [row.packet_key, row]));
    const byRef = new Map(result.rows.map((row) => [normRef(row.source_ref || row.file_path), row]));
    const rows = fused.map((candidate) => ({
      ...candidate,
      packet: byPacket.get(candidate.packet_key) ?? byRef.get(normRef(candidate.source_ref)) ?? null,
    }));
    return {
      lane: {
        status: result.rows.length ? 'LIVE_PASS' : 'FAIL',
        table: 'atlas_packets',
        input_candidates: fused.length,
        rows: result.rows.length,
        joined_candidates: rows.filter((row) => row.packet).length,
        duration_ms: Date.now() - started,
      },
      rows,
    };
  } catch (error) {
    return {
      lane: {
        status: 'FAIL',
        table: 'atlas_packets',
        error: error.message,
        duration_ms: Date.now() - started,
      },
      rows: fused.map((candidate) => ({ ...candidate, packet: null })),
    };
  } finally {
    await pool.end();
  }
}

async function warmRedis(envelope) {
  const started = Date.now();
  if (!WARM_REDIS) {
    return { status: 'SKIPPED', reason: '--no-redis set', duration_ms: Date.now() - started };
  }
  try {
    const ctx = await resolveAtlasRedisContext(REPO_ROOT, process.env);
    if (!ctx.container) {
      return { status: 'WARN', reason: 'No Redis/Valkey container found', duration_ms: Date.now() - started };
    }
    const payload = JSON.stringify(envelope);
    const keys = [
      `bifrost:summary-envelope:${envelope.group_key}`,
      `bifrost:sem:feature:${envelope.feature_id}`,
      `centroid:${envelope.cluster_key}`,
    ].filter(Boolean);
    const failures = [];
    for (const key of keys) {
      const res = runRedisCli(ctx.container, ['SETEX', key, '604800', payload], ctx.password, null, { maxBuffer: 1024 * 1024 });
      if (!res.ok) failures.push({ key, stderr: res.stderr.trim(), stdout: res.stdout.trim() });
    }
    return {
      status: failures.length ? 'WARN' : 'LIVE_PASS',
      container: ctx.container,
      keys,
      failures,
      duration_ms: Date.now() - started,
    };
  } catch (error) {
    return { status: 'WARN', error: error.message, duration_ms: Date.now() - started };
  }
}

function buildEnvelope({ proof, fusionRows }) {
  const joined = fusionRows.filter((row) => row.packet).slice(0, TOP_K);
  const first = joined[0]?.packet ?? {};
  const sourceRefs = joined.map((row) => ({
    packet_id: row.packet?.packet_id ?? null,
    packet_ulid: row.packet?.packet_ulid ?? null,
    packet_key: row.packet?.packet_key ?? row.packet_key ?? null,
    source_ref: row.packet?.source_ref ?? row.source_ref ?? null,
    canonical_source_ref:
      row.packet?.canonical_source_ref ?? row.packet?.source_ref ?? row.canonical_source_ref ?? row.source_ref ?? null,
    source_ref_key: row.packet?.source_ref_key ?? null,
    feature_id: row.packet?.feature_id ?? row.feature_id ?? null,
    title_id: row.packet?.title_id ?? row.title_id ?? null,
    feature_label: row.packet?.feature_label ?? row.feature_label ?? null,
    rrf_score: Number(row.rrf_score.toFixed(6)),
    retrieval_sources: Object.keys(row.sources),
  }));
  const domain = first.domain_class ?? proof?.summary?.domain_class ?? 'retrieval';
  const ontology = first.ontology_label ?? proof?.summary?.ontology_label ?? 'retriever';
  const topology = first.topology_label ?? proof?.summary?.topology_label ?? 'accelerator_layer';
  const clusterKey = first.som_cluster
    ? `som:${first.som_cluster}`
    : first.cluster_id !== null && first.cluster_id !== undefined
      ? `cluster:${first.cluster_id}`
      : `${domain}:${topology}`;

  return {
    envelope_id: stableId('gpu_retrieval_summary_envelope', `${GROUP_KEY}:${QUERY}:${sourceRefs.map((ref) => ref.packet_key || ref.source_ref).join('|')}`),
    packet_id: first.packet_id ?? null,
    packet_ulid: first.packet_ulid ?? null,
    packet_key: first.packet_key ?? null,
    task_id: `task:${GROUP_KEY}`,
    story_id: `story:${GROUP_KEY}`,
    worker_id: 'build-gpu-retrieval-summary-envelope',
    group_key: GROUP_KEY,
    feature_id: first.feature_id ?? `retrieval.${GROUP_KEY.replace(/[^a-z0-9]+/gi, '_').toLowerCase()}`,
    feature_label: FEATURE_LABEL,
    title_id: first.title_id ?? first.feature_id ?? null,
    domain_class: domain,
    ontology_label: ontology,
    topology_label: topology,
    cluster_key: clusterKey,
    query: QUERY,
    source_refs: sourceRefs,
    packets: sourceRefs,
    tuples: joined.flatMap((row) => Object.keys(row.sources).map((source) => ({
      relation: source === 'rg' ? 'LEXICAL_MATCH' : source === 'qdrant' ? 'SEMANTIC_MATCH' : source === 'go_retrieval' ? 'SEARCH_RESULT' : 'RANK_SIGNAL',
      extractor: source,
      confidence: Number((1 / (RRF_K + row.sources[source].rank)).toFixed(6)),
      source_ref: row.packet?.source_ref ?? row.source_ref ?? null,
    }))).slice(0, 64),
    retrieval: {
      strategy: 'rrf(qdrant_content,go_retrieval,rg)+turbovec_cuda_prefilter',
      qdrant_vector: 'content',
      qdrant_collection: 'codebase_chunks_768',
      qdrant_ids: fusionRows.filter((row) => row.sources.qdrant).map((row) => row.sources.qdrant.id).filter(Boolean).slice(0, TOP_K),
      turbovec_transform: '768_to_64',
      go_retrieval_refs: fusionRows.filter((row) => row.sources.go_retrieval).map((row) => row.source_ref || row.packet_key).filter(Boolean).slice(0, TOP_K),
      rg_refs: fusionRows.filter((row) => row.sources.rg).map((row) => row.source_ref).filter(Boolean).slice(0, TOP_K),
      rrf_candidate_count: fusionRows.length,
      final_context_count: sourceRefs.length,
    },
    validation: {
      embeddinggemma: proof?.lanes?.embeddinggemma?.status ?? 'UNKNOWN',
      qdrant: proof?.lanes?.qdrant?.status ?? 'UNKNOWN',
      turbovec: proof?.lanes?.turbovec_grpc?.status ?? 'UNKNOWN',
      go_retrieval: proof?.lanes?.go_retrieval?.status ?? 'UNKNOWN',
      postgres_join: proof?.lanes?.postgres_truth_join?.status ?? 'UNKNOWN',
      langextract: proof?.lanes?.langextract?.status ?? 'UNKNOWN',
      gemma4: proof?.lanes?.gemma4_summary?.status ?? 'UNKNOWN',
    },
    acp_telemetry: {
      event: 'retrieval.envelope.completed',
      task_id: `task:${GROUP_KEY}`,
      qdrant_vector: 'content',
      retrieval_strategy: 'qdrant+go_retrieval+rg+rrf+turbovec',
      protocol: ['http', 'grpc', 'postgres', 'redis'],
      accelerator: 'turbovec_cuda',
      qdrant_gpu_role: 'durable vector index build acceleration; not canonical truth',
    },
    persistence_contract: {
      canonical_truth: 'postgres.atlas_packets',
      qdrant_role: 'durable vector mirror',
      turbovec_role: 'cuda_ram_prefilter_rerank',
      redis_role: 'hot_cache_only',
      gemma4_role: 'bounded_synthesis_only',
      identity_mutated: false,
    },
    generated_at: new Date().toISOString(),
  };
}

function markdown(report) {
  return [
    '# GPU Retrieval Summary Envelope Proof',
    '',
    `Generated: ${report.generated_at}`,
    `Status: ${report.status}`,
    '',
    '| lane | status | detail |',
    '|---|---:|---|',
    ...Object.entries(report.lanes).map(([name, lane]) => `| ${name} | ${lane.status} | ${String(lane.error ?? lane.reason ?? lane.url ?? lane.table ?? '').replace(/\|/g, '/')} |`),
    '',
    '## Outputs',
    '',
    `- NDJSON: \`${path.relative(REPO_ROOT, OUT_NDJSON).replace(/\\/g, '/')}\``,
    `- Report: \`${path.relative(REPO_ROOT, OUT_JSON).replace(/\\/g, '/')}\``,
    '',
    '## Envelope Preview',
    '',
    '```json',
    JSON.stringify(report.envelopes?.[0] ?? null, null, 2).slice(0, 3000),
    '```',
    '',
  ].join('\n');
}

async function main() {
  const generatedAt = new Date().toISOString();
  const proofRun = runFlowProof();
  const proof = readJson(FLOW_PROOF_JSON);
  const qdrantCandidates = proof?.candidates?.qdrant ?? [];
  const go = await goRetrievalCandidates();
  const rg = rgCandidates();

  const rrfMap = new Map();
  addRank(rrfMap, 'qdrant', qdrantCandidates);
  addRank(rrfMap, 'go_retrieval', go.candidates);
  addRank(rrfMap, 'rg', rg.candidates);
  const fused = [...rrfMap.values()]
    .sort((a, b) => b.rrf_score - a.rrf_score)
    .slice(0, Math.max(TOP_K * 2, TOP_K));

  const joined = await postgresJoin(fused);
  const envelope = buildEnvelope({ proof, fusionRows: joined.rows });
  const redisWarm = await warmRedis(envelope);

  fs.mkdirSync(path.dirname(OUT_NDJSON), { recursive: true });
  fs.writeFileSync(OUT_NDJSON, JSON.stringify(envelope) + '\n', 'utf8');

  const lanes = {
    flow_proof: { status: proof?.status === 'LIVE_PASS' ? 'LIVE_PASS' : proofRun.status, proof_run: proofRun },
    qdrant_rrf_source: { status: qdrantCandidates.length ? 'LIVE_PASS' : 'FAIL', candidates: qdrantCandidates.length },
    go_retrieval_rrf_source: go.lane,
    rg_rrf_source: rg.lane,
    rrf_fusion: { status: fused.length ? 'LIVE_PASS' : 'FAIL', candidates: fused.length, final_context_count: envelope.source_refs.length },
    postgres_truth_join: joined.lane,
    redis_bitfrost_warm: redisWarm,
  };
  const report = {
    generated_at: generatedAt,
    status: statusFromLanes(lanes),
    query: QUERY,
    group_key: GROUP_KEY,
    rule: 'Envelope materialization is derived evidence. Postgres remains truth; Qdrant/TurboVec/Redis are mirrors/cache/accelerators.',
    lanes,
    outputs: {
      ndjson: path.relative(REPO_ROOT, OUT_NDJSON).replace(/\\/g, '/'),
      report_json: path.relative(REPO_ROOT, OUT_JSON).replace(/\\/g, '/'),
      report_md: path.relative(REPO_ROOT, OUT_MD).replace(/\\/g, '/'),
    },
    canonical_envelope: envelope,
    envelopes: [envelope],
  };

  writeJson(OUT_JSON, report);
  fs.writeFileSync(OUT_MD, markdown(report), 'utf8');
  console.log(JSON.stringify({
    status: report.status,
    lanes: Object.fromEntries(Object.entries(lanes).map(([key, value]) => [key, value.status])),
    out_ndjson: OUT_NDJSON,
    out_json: OUT_JSON,
    out_md: OUT_MD,
  }, null, 2));
  process.exit(report.status === 'FAIL' ? 1 : 0);
}

main().catch((error) => {
  const report = {
    generated_at: new Date().toISOString(),
    status: 'FAIL',
    query: QUERY,
    error: error.message,
  };
  writeJson(OUT_JSON, report);
  fs.writeFileSync(OUT_MD, markdown({ ...report, lanes: {}, envelopes: [] }), 'utf8');
  console.error(error);
  process.exit(1);
});
