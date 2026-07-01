#!/usr/bin/env node
/**
 * Build ranked packet candidates from compact source tuples.
 *
 * This is the bridge between structural analysis and the retrieval/summarization
 * lanes:
 *   source tuples -> ranked packet IDs -> bounded context refs
 *
 * It does not load the whole corpus into RAM and does not mutate canonical
 * packet identity. TurboVec should receive vectors + compact IDs; raw text stays
 * in files/Postgres/object storage.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl, REPO_ROOT } from './connection-config.mjs';

const args = new Map();
for (const arg of process.argv.slice(2)) {
  const m = arg.match(/^--([^=]+)=(.*)$/);
  if (m) args.set(m[1], m[2]);
  else if (arg.startsWith('--')) args.set(arg.slice(2), 'true');
}

const APPLY = args.has('apply');
const INPUT = path.resolve(REPO_ROOT, String(args.get('input') ?? '.tmp/source-tuples-all.ndjson'));
const OUT = path.resolve(REPO_ROOT, String(args.get('out') ?? '.tmp/turbovec-candidates.ndjson'));
const CONTEXT_DIR = path.resolve(REPO_ROOT, String(args.get('context-dir') ?? '.tmp/packet-context'));
const REPORT = path.resolve(REPO_ROOT, String(args.get('report') ?? 'docs/reports/turbovec-candidates-report.json'));
const LIMIT = Number(args.get('limit') ?? 5000);
const MAX_CONTEXT_CHARS = Number(args.get('max-context-chars') ?? 12000);

const RELATION_WEIGHTS = {
  DEFINES: 0.18,
  ROUTE_HANDLES: 0.18,
  EXPORTS: 0.14,
  IMPORTS: 0.10,
  IMPORTS_DYNAMIC: 0.13,
  USES_VECTOR_SEARCH: 0.16,
  USES_QDRANT: 0.16,
  USES_REDIS_CACHE: 0.15,
  USES_POSTGRES: 0.14,
  USES_NEO4J: 0.14,
  USES_RABBITMQ: 0.13,
  MCP_TOOL: 0.12,
  VALIDATES: 0.08,
  RISK_SIGNAL: -0.05,
};

const SKIP_PATTERNS = [
  /^node_modules\//,
  /^\.git\//,
  /^\.svelte-kit\//,
  /^dist\//,
  /^build\//,
  /^models\//,
  /^backups\//,
  /^archive\/logs\//,
  /^archive\/tmp\//,
  /^\.tmp\//,
  /(^|\/)\.tmp\//,
  /\.(png|jpe?g|gif|webp|ico|woff2?|ttf|eot|mp4|mp3|gguf|bin|zip|tar|gz|zst|duckdb|parquet)$/i,
];

function sha256(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function normalizeRef(value) {
  return String(value ?? '').replace(/\\/g, '/').replace(/^\/+/, '');
}

function scoreTuple(tuple) {
  const relationScore = RELATION_WEIGHTS[tuple.relation] ?? 0.05;
  const weight = Number(tuple.weight ?? 1) || 1;
  return relationScore * Math.max(0.25, Math.min(weight, 2.0));
}

function whyForRelation(relation) {
  if (relation === 'DEFINES') return 'function_ast_match';
  if (relation === 'ROUTE_HANDLES') return 'route_ast_match';
  if (relation === 'EXPORTS') return 'symbol_export';
  if (relation === 'IMPORTS' || relation === 'IMPORTS_DYNAMIC') return 'dependency_hotpath';
  if (relation === 'USES_VECTOR_SEARCH' || relation === 'USES_QDRANT') return 'semantic_vector_path';
  if (relation === 'USES_REDIS_CACHE') return 'cache_path';
  if (relation === 'USES_POSTGRES') return 'postgres_truth_path';
  if (relation === 'USES_NEO4J') return 'graph_path';
  if (relation === 'USES_RABBITMQ') return 'queue_path';
  if (relation === 'MCP_TOOL') return 'tool_surface';
  if (relation === 'VALIDATES') return 'contract_validation';
  if (relation === 'RISK_SIGNAL') return 'risk_signal';
  return 'structural_match';
}

function candidatePaths(row) {
  const sourceRef = normalizeRef(row.source_ref || row.file_path || row.source_path);
  const refs = [sourceRef, normalizeRef(row.file_path), normalizeRef(row.source_path)].filter(Boolean);
  const out = [];
  for (const ref of refs) {
    out.push(path.resolve(REPO_ROOT, ref));
    if (ref.startsWith('sveltekit-frontend/')) out.push(path.resolve(REPO_ROOT, ref.slice('sveltekit-frontend/'.length)));
    else out.push(path.resolve(REPO_ROOT, 'sveltekit-frontend', ref));
  }
  return [...new Set(out)];
}

function readContext(row) {
  const sourceRef = normalizeRef(row.source_ref);
  if (!sourceRef || SKIP_PATTERNS.some((pattern) => pattern.test(sourceRef))) return '';
  for (const file of candidatePaths(row)) {
    try {
      if (!fs.existsSync(file)) continue;
      const stat = fs.statSync(file);
      if (!stat.isFile() || stat.size > 2_000_000) continue;
      const text = fs.readFileSync(file, 'utf8');
      if (!text.trim() || text.includes('\u0000')) continue;
      return text.slice(0, MAX_CONTEXT_CHARS);
    } catch {
      // try next candidate
    }
  }
  return '';
}

function readTuples(inputPath) {
  const packets = new Map();
  const report = {
    input: inputPath,
    tuple_rows_read: 0,
    malformed_rows: 0,
    by_relation: {},
  };
  if (!fs.existsSync(inputPath)) throw new Error(`Missing tuple input: ${inputPath}`);
  for (const line of fs.readFileSync(inputPath, 'utf8').split(/\r?\n/)) {
    if (!line.trim()) continue;
    let tuple;
    try {
      tuple = JSON.parse(line);
    } catch {
      report.malformed_rows += 1;
      continue;
    }
    if (!tuple.packet_key || !tuple.source_ref) continue;
    report.tuple_rows_read += 1;
    report.by_relation[tuple.relation] = (report.by_relation[tuple.relation] ?? 0) + 1;
    if (!packets.has(tuple.packet_key)) {
      packets.set(tuple.packet_key, {
        packet_key: tuple.packet_key,
        source_ref: tuple.source_ref,
        source_ref_key: tuple.source_ref_key ?? null,
        feature_id: tuple.feature_id ?? null,
        feature_label: tuple.feature_label ?? null,
        symbols: new Set(),
        relations: new Map(),
        why: new Set(),
        raw_score: 0,
        tuple_count: 0,
        top_tuples: [],
      });
    }
    const packet = packets.get(tuple.packet_key);
    packet.tuple_count += 1;
    packet.raw_score += scoreTuple(tuple);
    packet.relations.set(tuple.relation, (packet.relations.get(tuple.relation) ?? 0) + 1);
    packet.why.add(whyForRelation(tuple.relation));
    if (tuple.symbol) packet.symbols.add(tuple.symbol);
    if (packet.top_tuples.length < 20) {
      packet.top_tuples.push({
        relation: tuple.relation,
        kind: tuple.kind,
        symbol: tuple.symbol,
        line: tuple.line,
        weight: tuple.weight,
      });
    }
  }
  return { packets, report };
}

async function fetchPacketRows(packetKeys) {
  if (!packetKeys.length) return new Map();
  const env = loadRepoEnv();
  const pool = new pg.Pool({ connectionString: resolveDatabaseUrl(env), max: 2 });
  try {
    const { rows } = await pool.query(`
      SELECT packet_key, source_ref, source_ref_key, file_path, source_path, feature_id,
             feature_label, domain_class, pagerank, updated_at, metadata, topology, payload
      FROM atlas_packets
      WHERE packet_key = ANY($1::text[])
    `, [packetKeys]);
    return new Map(rows.map((row) => [row.packet_key, row]));
  } finally {
    await pool.end();
  }
}

function normalizeScore(value, max) {
  if (!max || max <= 0) return 0;
  return Math.max(0, Math.min(1, value / max));
}

function objectValue(value) {
  if (!value) return {};
  if (typeof value === 'object' && !Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }
  return {};
}

function firstText(...values) {
  for (const value of values) {
    const text = String(value ?? '').trim();
    if (text) return text;
  }
  return null;
}

async function main() {
  const started = Date.now();
  const { packets, report: inputReport } = readTuples(INPUT);
  const ranked = [...packets.values()]
    .map((packet) => ({
      ...packet,
      score_pre: packet.raw_score + Math.log1p(packet.tuple_count) * 0.04,
    }))
    .sort((a, b) => b.score_pre - a.score_pre)
    .slice(0, LIMIT);

  const dbRows = await fetchPacketRows(ranked.map((row) => row.packet_key));
  const maxPre = Math.max(...ranked.map((row) => row.score_pre), 1);
  const now = new Date().toISOString();
  const candidates = [];
  fs.mkdirSync(CONTEXT_DIR, { recursive: true });

  for (const row of ranked) {
    const db = dbRows.get(row.packet_key) ?? {};
    const metadata = objectValue(db.metadata);
    const topology = objectValue(db.topology);
    const payload = objectValue(db.payload);
    const sourceRef = normalizeRef(db.source_ref ?? row.source_ref);
    const packetHash = sha256(row.packet_key).slice(0, 16);
    const contentRef = path.join(CONTEXT_DIR, `${packetHash}.txt`);
    const context = readContext({ ...row, ...db, source_ref: sourceRef });
    if (APPLY && context) fs.writeFileSync(contentRef, context, 'utf8');

    const relationObject = Object.fromEntries([...row.relations.entries()].sort(([a], [b]) => a.localeCompare(b)));
    const semanticScore = normalizeScore(row.score_pre, maxPre);
    const astMatchScore = normalizeScore(
      (relationObject.DEFINES ?? 0) + (relationObject.ROUTE_HANDLES ?? 0) + (relationObject.EXPORTS ?? 0),
      Math.max(row.tuple_count, 1)
    );
    const symbolScore = normalizeScore(row.symbols.size, 20);
    const dependencyScore = normalizeScore(
      (relationObject.IMPORTS ?? 0) + (relationObject.IMPORTS_DYNAMIC ?? 0) + (relationObject.USES_POSTGRES ?? 0) +
        (relationObject.USES_REDIS_CACHE ?? 0) + (relationObject.USES_VECTOR_SEARCH ?? 0) + (relationObject.USES_QDRANT ?? 0),
      Math.max(row.tuple_count, 1)
    );
    const graphAuthorityScore = normalizeScore(Number(db.pagerank ?? 0), 1);
    const testCoverageScore = /(?:test|spec)\./i.test(sourceRef) ? 1 : 0;
    const finalScore =
      0.34 * semanticScore +
      0.18 * astMatchScore +
      0.14 * symbolScore +
      0.12 * dependencyScore +
      0.10 * 0 +
      0.08 * graphAuthorityScore +
      0.04 * testCoverageScore;

    candidates.push({
      packet_id: db.metadata?.packet_id ?? row.packet_key,
      packet_key: row.packet_key,
      source_ref: sourceRef,
      source_ref_key: db.source_ref_key ?? row.source_ref_key ?? null,
      feature_id: db.feature_id ?? row.feature_id ?? null,
      feature_label: db.feature_label ?? row.feature_label ?? null,
      domain_class: db.domain_class ?? null,
      ontology_label: firstText(
        metadata.ontology_label,
        metadata.ontologyLabel,
        topology.ontology_label,
        topology.ontologyLabel,
        payload.ontology_label,
        payload.ontologyLabel
      ),
      topology_label: firstText(
        metadata.topology_label,
        metadata.topologyLabel,
        topology.topology_label,
        topology.topologyLabel,
        payload.topology_label,
        payload.topologyLabel
      ),
      symbol: [...row.symbols][0] ?? null,
      symbols: [...row.symbols].slice(0, 20),
      kind: relationObject.ROUTE_HANDLES ? 'route' : relationObject.DEFINES ? 'function' : 'packet',
      score: Number(finalScore.toFixed(6)),
      scores: {
        semantic_score: Number(semanticScore.toFixed(6)),
        ast_match_score: Number(astMatchScore.toFixed(6)),
        symbol_score: Number(symbolScore.toFixed(6)),
        dependency_score: Number(dependencyScore.toFixed(6)),
        recency_or_hotpath_score: 0,
        graph_authority_score: Number(graphAuthorityScore.toFixed(6)),
        test_coverage_score: Number(testCoverageScore.toFixed(6)),
      },
      why: [...row.why].slice(0, 12),
      relation_counts: relationObject,
      tuple_count: row.tuple_count,
      top_tuples: row.top_tuples,
      content_ref: context ? path.relative(REPO_ROOT, contentRef).replace(/\\/g, '/') : null,
      provenance: {
        generated_by: 'build-turbovec-candidates-from-tuples',
        tuple_input: path.relative(REPO_ROOT, INPUT).replace(/\\/g, '/'),
        canonical_truth: 'postgres.atlas_packets',
        intended_next: ['embeddinggemma', 'turbovec_ram_ann', 'rabbitmq_summary_queue', 'postgres_pgvector', 'qdrant_payload_mirror'],
        identity_mutated: false,
        generated_at: now,
      },
    });
  }

  const outputReport = {
    generated_at: now,
    apply: APPLY,
    input: INPUT,
    out: OUT,
    context_dir: CONTEXT_DIR,
    limit: LIMIT,
    packets_grouped: packets.size,
    candidates_written: candidates.length,
    context_files_written: APPLY ? candidates.filter((row) => row.content_ref).length : 0,
    elapsed_ms: Date.now() - started,
    input_report: inputReport,
    queue_recommendation: {
      retrieval_candidates: OUT,
      gemma4_summary_requests: 'derive from candidates where atlas_summary_layers missing or stale',
      vector_indexing: 'embed candidate summaries with EmbeddingGemma 768',
      cluster_kmeans: 'run after summary embeddings exist',
      cluster_som: 'run after kmeans/latent lane exists',
    },
  };

  if (APPLY) {
    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    fs.writeFileSync(OUT, candidates.map((row) => JSON.stringify(row)).join('\n') + (candidates.length ? '\n' : ''), 'utf8');
    fs.mkdirSync(path.dirname(REPORT), { recursive: true });
    fs.writeFileSync(REPORT, JSON.stringify(outputReport, null, 2) + '\n', 'utf8');
  }
  console.log(JSON.stringify(outputReport, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
