#!/usr/bin/env node
/**
 * Materialize whole-file structural tuples for Parent Atlas analysis.
 *
 * Output is a temporary NDJSON tuple stream:
 *   source_ref -> relation -> symbol/target
 *
 * This is not canonical truth. It is a derived analysis surface for
 * TurboVec/ANN, LangExtract grouping, Neo4j projection, and Gemma4 evidence
 * reduction. Canonical identity remains atlas_packets packet_key/source_ref.
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

const LIMIT = Number(args.get('limit') ?? 1000);
const OUT = path.resolve(REPO_ROOT, String(args.get('out') ?? '.tmp/source-tuples.ndjson'));
const REPORT = path.resolve(REPO_ROOT, String(args.get('report') ?? 'docs/reports/source-tuples-materialization.json'));
const AST_GREP_SYMBOLS = args.has('ast-grep-symbols')
  ? path.resolve(REPO_ROOT, String(args.get('ast-grep-symbols')))
  : path.resolve(REPO_ROOT, 'sveltekit-frontend/memory/index/symbols.jsonl');
const APPLY = args.has('apply');
const MAX_FILE_BYTES = Number(args.get('max-file-bytes') ?? 2_000_000);

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

function normalizeComparableRef(value) {
  return normalizeRef(value)
    .replace(/^\.?\//, '')
    .replace(/^sveltekit-frontend\//, '')
    .toLowerCase();
}

function astRelationForKind(kind) {
  const map = {
    cache_call: 'USES_REDIS_CACHE',
    drizzle_table: 'USES_POSTGRES',
    exported_const: 'EXPORTS',
    exported_function: 'DEFINES',
    import_dynamic: 'IMPORTS_DYNAMIC',
    import_static: 'IMPORTS',
    mcp_tool: 'MCP_TOOL',
    mock_or_stub: 'RISK_SIGNAL',
    sveltekit_route_handler: 'ROUTE_HANDLES',
    vector_call: 'USES_VECTOR_SEARCH',
  };
  return map[kind] ?? 'AST_SYMBOL';
}

function astWeightForKind(kind) {
  const map = {
    exported_function: 1.9,
    sveltekit_route_handler: 1.8,
    exported_const: 1.5,
    import_dynamic: 1.4,
    import_static: 1.2,
    drizzle_table: 1.4,
    cache_call: 1.3,
    vector_call: 1.3,
    mcp_tool: 1.3,
    mock_or_stub: 0.6,
  };
  return map[kind] ?? 1.0;
}

function loadAstGrepSymbols(filePath) {
  const byFile = new Map();
  const stats = { path: filePath, found: false, rows: 0, by_kind: {} };
  if (!filePath || !fs.existsSync(filePath)) return { byFile, stats };
  stats.found = true;
  const text = fs.readFileSync(filePath, 'utf8');
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const row = JSON.parse(line);
      const file = normalizeComparableRef(row.file);
      if (!file || !row.kind) continue;
      const item = {
        kind: String(row.kind),
        relation: astRelationForKind(String(row.kind)),
        symbol: String(row.symbol ?? '').trim().slice(0, 180),
        line: Number(row.line ?? 0) || null,
        weight: astWeightForKind(String(row.kind)),
        snippet: `${row.kind}:${String(row.symbol ?? '').trim()}`.slice(0, 300),
        parser: String(row.parser ?? 'ast-grep'),
        stable_id: row.stable_id ?? null,
      };
      if (!byFile.has(file)) byFile.set(file, []);
      byFile.get(file).push(item);
      stats.rows += 1;
      stats.by_kind[item.kind] = (stats.by_kind[item.kind] ?? 0) + 1;
    } catch {
      // Ignore malformed diagnostic rows; the report count proves coverage.
    }
  }
  return { byFile, stats };
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

function readSource(row) {
  const sourceRef = normalizeRef(row.source_ref);
  if (!sourceRef || SKIP_PATTERNS.some((pattern) => pattern.test(sourceRef))) {
    return { text: '', file: '', status: 'skipped_path' };
  }
  for (const file of candidatePaths(row)) {
    try {
      if (!fs.existsSync(file)) continue;
      const stat = fs.statSync(file);
      if (!stat.isFile()) continue;
      if (stat.size > MAX_FILE_BYTES) return { text: '', file, status: 'too_large' };
      const text = fs.readFileSync(file, 'utf8');
      if (!text.trim()) return { text: '', file, status: 'empty' };
      if (text.includes('\u0000')) return { text: '', file, status: 'binary' };
      return { text, file, status: 'ok' };
    } catch {
      // try next path
    }
  }
  return { text: '', file: '', status: 'not_found' };
}

function lineAt(text, index) {
  return text.slice(0, Math.max(0, index)).split('\n').length;
}

function collectMatches(rows, text, regex, kind, relation, weight) {
  for (const match of text.matchAll(regex)) {
    const symbol = String(match.groups?.name ?? match[1] ?? match[0] ?? '').trim().slice(0, 180);
    const snippet = String(match[0] ?? '').trim().replace(/\s+/g, ' ').slice(0, 300);
    if (!symbol && !snippet) continue;
    rows.push({ kind, relation, symbol, line: lineAt(text, match.index ?? 0), weight, snippet });
  }
}

function extractTuples(packet, text) {
  const tuples = [];
  collectMatches(tuples, text, /^\s*import\s+(?:type\s+)?(?:.+?\s+from\s+)?['"](?<name>[^'"]+)['"]/gm, 'import_static', 'IMPORTS', 1.0);
  collectMatches(tuples, text, /import\s*\(\s*['"](?<name>[^'"]+)['"]\s*\)/g, 'import_dynamic', 'IMPORTS_DYNAMIC', 1.2);
  collectMatches(tuples, text, /^\s*(?:export\s+)?(?:async\s+)?function\s+(?<name>[A-Za-z_$][\w$]*)\s*\(/gm, 'function', 'DEFINES', 1.8);
  collectMatches(tuples, text, /^\s*(?:export\s+)?const\s+(?<name>[A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?\([^)]*\)\s*=>/gm, 'function_arrow', 'DEFINES', 1.6);
  collectMatches(tuples, text, /^\s*(?:export\s+)?class\s+(?<name>[A-Za-z_$][\w$]*)/gm, 'class', 'DEFINES', 1.6);
  collectMatches(tuples, text, /^\s*export\s+(?:const|let|var|type|interface|enum)\s+(?<name>[A-Za-z_$][\w$]*)/gm, 'export', 'EXPORTS', 1.3);
  collectMatches(tuples, text, /(?:GET|POST|PUT|PATCH|DELETE)\s*[:=]\s*(?:async\s*)?\(/g, 'route_handler', 'ROUTE_HANDLES', 1.7);
  collectMatches(tuples, text, /\b(?:pool|client|db|sql)\.(?:query|execute|select|insert|update|delete)\s*\(/g, 'postgres', 'USES_POSTGRES', 1.4);
  collectMatches(tuples, text, /\b(?:redis|valkey|cache)\.(?:get|set|hget|hset|del|expire|publish)\s*\(/gi, 'redis_cache', 'USES_REDIS_CACHE', 1.4);
  collectMatches(tuples, text, /\bqdrant\.(?:search|upsert|scroll|setPayload|createCollection|getCollection)\s*\(/gi, 'qdrant', 'USES_QDRANT', 1.4);
  collectMatches(tuples, text, /\b(?:neo4j|session)\.(?:run|executeRead|executeWrite)\s*\(/gi, 'neo4j', 'USES_NEO4J', 1.4);
  collectMatches(tuples, text, /\b(?:amqp|channel)\.(?:sendToQueue|publish|consume|assertQueue)\s*\(/gi, 'rabbitmq', 'USES_RABBITMQ', 1.4);
  collectMatches(tuples, text, /\b(?:z\.object|parse|safeParse)\b/g, 'validation', 'VALIDATES', 1.1);

  const sourceRef = normalizeRef(packet.source_ref);
  return tuples.map((tuple, index) => ({
    tuple_id: sha256(`${packet.packet_key}:${sourceRef}:${tuple.kind}:${tuple.line}:${tuple.symbol}:${index}`).slice(0, 24),
    packet_key: packet.packet_key,
    source_ref: sourceRef,
    source_ref_key: packet.source_ref_key ?? `${sourceRef}:${packet.packet_key}`,
    feature_id: packet.feature_id ?? null,
    feature_label: packet.feature_label ?? null,
    relation: tuple.relation,
    kind: tuple.kind,
    symbol: tuple.symbol,
    target: tuple.symbol,
    line: tuple.line,
    weight: tuple.weight,
    snippet: tuple.snippet,
    provenance: {
      extractor: 'materialize-source-tuples',
      canonical_truth: 'postgres.atlas_packets',
      identity_mutated: false,
    },
  }));
}

function attachAstGrepTuples(packet, astIndex) {
  const sourceRef = normalizeRef(packet.source_ref);
  const keys = [
    normalizeComparableRef(sourceRef),
    normalizeComparableRef(packet.file_path),
    normalizeComparableRef(packet.source_path),
    normalizeComparableRef(sourceRef.replace(/^sveltekit-frontend\//, '')),
  ].filter(Boolean);
  const rows = [];
  const seen = new Set();
  for (const key of [...new Set(keys)]) {
    for (const tuple of astIndex.get(key) ?? []) {
      const dedupeKey = `${tuple.kind}:${tuple.symbol}:${tuple.line}:${tuple.stable_id ?? ''}`;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);
      rows.push({
        tuple_id: sha256(`${packet.packet_key}:${sourceRef}:ast-grep:${dedupeKey}`).slice(0, 24),
        packet_key: packet.packet_key,
        source_ref: sourceRef,
        source_ref_key: packet.source_ref_key ?? `${sourceRef}:${packet.packet_key}`,
        feature_id: packet.feature_id ?? null,
        feature_label: packet.feature_label ?? null,
        relation: tuple.relation,
        kind: tuple.kind,
        symbol: tuple.symbol,
        target: tuple.symbol,
        line: tuple.line,
        weight: tuple.weight,
        snippet: tuple.snippet,
        provenance: {
          extractor: 'ast-grep-map',
          parser: tuple.parser,
          stable_id: tuple.stable_id,
          canonical_truth: 'postgres.atlas_packets',
          identity_mutated: false,
        },
      });
    }
  }
  return rows;
}

async function main() {
  const env = loadRepoEnv();
  const pool = new pg.Pool({ connectionString: resolveDatabaseUrl(env), max: 2 });
  const report = {
    generated_at: new Date().toISOString(),
    apply: APPLY,
    limit: LIMIT,
    out: OUT,
    packets_scanned: 0,
    packets_with_text: 0,
    tuples_written: 0,
    skip_reasons: {},
    by_relation: {},
    ast_grep: null,
    ast_grep_tuples_added: 0,
  };

  try {
    const ast = loadAstGrepSymbols(AST_GREP_SYMBOLS);
    report.ast_grep = ast.stats;
    const { rows } = await pool.query(`
      SELECT packet_key, source_ref, source_ref_key, file_path, source_path, feature_id, feature_label, pagerank
      FROM atlas_packets
      WHERE packet_key IS NOT NULL AND source_ref IS NOT NULL
      ORDER BY pagerank DESC NULLS LAST, source_ref ASC
      LIMIT $1
    `, [LIMIT]);
    report.packets_scanned = rows.length;

    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    fs.mkdirSync(path.dirname(REPORT), { recursive: true });
    const stream = APPLY ? fs.createWriteStream(OUT) : null;
    for (const row of rows) {
      const source = readSource(row);
      if (!source.text) {
        report.skip_reasons[source.status] = (report.skip_reasons[source.status] ?? 0) + 1;
        continue;
      }
      report.packets_with_text += 1;
      const astTuples = attachAstGrepTuples(row, ast.byFile);
      report.ast_grep_tuples_added += astTuples.length;
      const tuples = [
        ...extractTuples(row, source.text),
        ...astTuples,
      ];
      for (const tuple of tuples) {
        report.by_relation[tuple.relation] = (report.by_relation[tuple.relation] ?? 0) + 1;
        report.tuples_written += 1;
        if (stream) stream.write(JSON.stringify(tuple) + '\n');
      }
    }
    if (stream) await new Promise((resolve, reject) => {
      stream.end(resolve);
      stream.on('error', reject);
    });
    if (APPLY) fs.writeFileSync(REPORT, JSON.stringify(report, null, 2) + '\n', 'utf8');
    console.log(JSON.stringify(report, null, 2));
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
