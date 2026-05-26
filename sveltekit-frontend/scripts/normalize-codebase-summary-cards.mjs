#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

import { toToon } from './index/toon-encoder.mjs';
import { getNativeBridgeStatus, parseJsonFast } from './lib/avx2-simdjson-bridge.mjs';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const NOW = new Date().toISOString();
const CARD_TYPES = [
  'file_summary',
  'symbol_summary',
  'route_summary',
  'database_touchpoint',
  'tool_api_call',
  'error_risk',
  'test_coverage',
];

const SOURCE_EXT = new Set(['.ts', '.tsx', '.js', '.mjs', '.cjs', '.svelte', '.sql', '.py']);

const args = new Set(process.argv.slice(2));
const DRY_RUN = args.has('--dry-run') || args.has('--smoke') || args.has('--report-only');
const SMOKE_ONLY = args.has('--smoke');
const REPORT_ONLY = args.has('--report-only');
const APPLY_STORAGE = args.has('--apply-storage');
const APPLY_QDRANT = args.has('--qdrant') || APPLY_STORAGE;
const APPLY_POSTGRES = args.has('--postgres') || APPLY_STORAGE;
const APPLY_REDIS = args.has('--redis') || APPLY_STORAGE;

function arg(name, fallback = null) {
  const prefix = `${name}=`;
  const hit = [...args].find((token) => token.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : fallback;
}

const MAX_FILES = Number(arg('--max-files', '3223'));
const TOP_N = Number(arg('--top', '100'));

const PATHS = {
  graph: path.join(ROOT, 'docs/graph/codebase-graph.json'),
  batch: path.join(ROOT, 'docs/graph/batch-gpu-analysis-report.json'),
  atlas: path.join(ROOT, 'memory/atlas/codebase-atlas.latest.md'),
  cardsJsonl: path.join(ROOT, 'memory/cards/codebase-summary-cards.jsonl'),
  edgesJsonl: path.join(ROOT, 'memory/cards/codebase-summary-card-edges.jsonl'),
  top100Json: path.join(ROOT, 'memory/cards/top-100-codebase-summary-cards.json'),
  top100Toon: path.join(ROOT, 'memory/cards/top-100-codebase-summary-cards.toon'),
  top100Md: path.join(ROOT, 'docs/reports/top-100-codebase-summary-cards.md'),
  laneReport: path.join(ROOT, 'docs/reports/summary-card-lane-report.json'),
  neo4jReport: path.join(ROOT, 'docs/reports/neo4j-summary-card-report.json'),
  couchReport: path.join(ROOT, 'docs/reports/couchdb-summary-card-snapshot.json'),
  duckdbReport: path.join(ROOT, 'docs/reports/duckdb-summary-card-report.json'),
  errorList: path.join(ROOT, 'docs/reports/summary-card-error-list.json'),
  errorQueue: path.join(ROOT, 'memory/cards/summary-card-error-research.jsonl'),
};

const ERROR_LIST = [];

function recordError(stage, target, error, details = {}) {
  ERROR_LIST.push({
    at: new Date().toISOString(),
    stage,
    target,
    error: error instanceof Error ? error.message : String(error),
    details,
  });
}

function stableId(input) {
  return createHash('sha256').update(input).digest('hex').slice(0, 16);
}

function stableUuid(input) {
  const hex = createHash('sha256').update(input).digest('hex').slice(0, 32);
  const chars = hex.split('');
  // UUIDv4-style shape with deterministic hash bytes.
  chars[12] = '4';
  const variantNibble = parseInt(chars[16], 16);
  chars[16] = ((variantNibble & 0x3) | 0x8).toString(16);
  const fixed = chars.join('');
  return [
    fixed.slice(0, 8),
    fixed.slice(8, 12),
    fixed.slice(12, 16),
    fixed.slice(16, 20),
    fixed.slice(20, 32),
  ].join('-');
}

async function syncErrorQueuesRedis() {
  let Redis;
  try {
    ({ default: Redis } = await import('ioredis'));
  } catch {
    return { ok: false, reason: 'ioredis_not_installed' };
  }

  const redis = new Redis(process.env.REDIS_URL || 'redis://127.0.0.1:6379', {
    lazyConnect: true,
    connectTimeout: 3000,
  });

  try {
    const activeRows = ERROR_LIST.map((row, idx) => ({
      id: `err:${idx + 1}:${stableId(JSON.stringify(row))}`,
      state: 'active',
      ...row,
    }));

    const resolvedRows = [];
    if (activeRows.length === 0) {
      resolvedRows.push({
        id: `resolved:${stableId(NOW)}`,
        state: 'resolved',
        at: NOW,
        message: 'no errors in current run',
      });
    }

    const pipe = redis.pipeline();
    pipe.del('error:list:active');
    pipe.del('error:list:resolved');

    for (const row of activeRows) {
      pipe.rpush('error:list:active', JSON.stringify(row));
      pipe.lpush('obs:error-agent:recent', JSON.stringify(row));
    }

    for (const row of resolvedRows) {
      pipe.rpush('error:list:resolved', JSON.stringify(row));
      pipe.lpush('obs:error-agent:recent', JSON.stringify(row));
    }

    pipe.ltrim('obs:error-agent:recent', 0, 199);
    await pipe.exec();

    return {
      ok: true,
      active: activeRows.length,
      resolved: resolvedRows.length,
    };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : String(error) };
  } finally {
    await redis.quit().catch(() => {});
  }
}

function normalizePath(rel) {
  return String(rel || '').replace(/\\/g, '/');
}

function compact(text, limit = 220) {
  const normalized = String(text || '').replace(/\s+/g, ' ').trim();
  if (normalized.length <= limit) return normalized;
  return `${normalized.slice(0, Math.max(0, limit - 1)).trimEnd()}…`;
}

function ensureArray(input) {
  return Array.isArray(input) ? input : [];
}

function scoreWeight(values) {
  return values.reduce((acc, value) => acc + Number(value || 0), 0);
}

function hashToPathKey(filePath) {
  return createHash('sha1').update(filePath).digest('hex').slice(0, 20);
}

function parseTableNames(text) {
  const names = new Set();
  const pgTableRe = /pgTable\s*\(\s*['"`]([^'"`]+)['"`]/g;
  const createRe = /create\s+table\s+(?:if\s+not\s+exists\s+)?(?:"?\w+"?\.)?"?([a-zA-Z0-9_]+)"?/gi;

  let m;
  while ((m = pgTableRe.exec(text)) !== null) names.add(m[1]);
  while ((m = createRe.exec(text)) !== null) names.add(m[1]);

  return [...names];
}

async function readJson(filePath, fallback) {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return parseJsonFast(raw);
  } catch (error) {
    recordError('read_json', normalizePath(path.relative(ROOT, filePath)), error);
    return fallback;
  }
}

async function readText(filePath, fallback = '') {
  try {
    return await fs.readFile(filePath, 'utf8');
  } catch {
    return fallback;
  }
}

async function discoverSchemaFiles() {
  const roots = [
    path.join(ROOT, 'src/lib/server/db'),
    path.join(ROOT, 'src/lib/db'),
    path.join(ROOT, 'drizzle'),
  ];

  const out = [];
  for (const root of roots) {
    await walk(root, out);
  }
  return out.filter((file) => /schema|drizzle|\.sql$/i.test(file));
}

async function walk(dir, out) {
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
        await walk(full, out);
      } else {
        out.push(full);
      }
    }
  } catch {
    // ignore missing directory roots
  }
}

function dirOf(filePath) {
  return normalizePath(path.posix.dirname(filePath));
}

function inferDependencies(file) {
  const summary = `${file.summary || ''} ${ensureArray(file.imports).join(' ')}`.toLowerCase();
  const deps = [];
  if (summary.includes('redis')) deps.push('redis');
  if (summary.includes('qdrant')) deps.push('qdrant');
  if (summary.includes('bifrost')) deps.push('bifrost');
  if (summary.includes('drizzle') || summary.includes('postgres') || summary.includes('pg')) deps.push('postgres');
  if (summary.includes('neo4j')) deps.push('neo4j');
  if (summary.includes('duckdb')) deps.push('duckdb');
  if (summary.includes('couchdb')) deps.push('couchdb');
  return [...new Set(deps)];
}

function inferTools(file) {
  const blob = `${ensureArray(file.imports).join(' ')} ${file.summary || ''}`.toLowerCase();
  const tools = [];
  if (blob.includes('trace') || blob.includes('kag')) tools.push('trace.kag_search');
  if (blob.includes('turbovec')) tools.push('turbovec.search');
  if (blob.includes('engram')) tools.push('engram.search');
  if (blob.includes('langextract')) tools.push('langextract.extract');
  if (blob.includes('duckdb')) tools.push('duckdb.report');
  return [...new Set(tools)];
}

function inferTables(file, knownTables) {
  const refs = ensureArray(file.drizzleRefs).map((value) => String(value));
  const summary = `${file.summary || ''} ${ensureArray(file.imports).join(' ')}`.toLowerCase();
  const hit = knownTables.filter((table) => summary.includes(table.toLowerCase()));
  return [...new Set([...refs, ...hit])].slice(0, 12);
}

function inferSymbols(file) {
  return ensureArray(file.exports)
    .map((value) => String(value).trim())
    .filter(Boolean)
    .slice(0, 6);
}

function inferLanguage(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.ts' || ext === '.tsx') return 'typescript';
  if (ext === '.js' || ext === '.mjs' || ext === '.cjs') return 'javascript';
  if (ext === '.svelte') return 'svelte';
  if (ext === '.sql') return 'sql';
  if (ext === '.py') return 'python';
  return ext.replace('.', '') || 'unknown';
}

function inferFeatureLabels(file, dependencies, tools) {
  const blob = `${file.summary || ''} ${ensureArray(file.imports).join(' ')} ${ensureArray(file.dynImports).join(' ')}`.toLowerCase();
  const labels = [];

  if (ensureArray(file.imports).length > 0) labels.push('static-imports');
  if (ensureArray(file.dynImports).length > 0) labels.push('dynamic-imports');
  if (blob.includes('dns') || blob.includes('socket') || blob.includes('http') || blob.includes('https') || blob.includes('server') || blob.includes('client')) {
    labels.push('dns-networking-server-client');
  }
  if (blob.includes('redis') || dependencies.includes('redis')) labels.push('ace-redis-hot-cache');
  if (blob.includes('hyper') || blob.includes('rag')) labels.push('hyper-rag-dense-search');
  if (blob.includes('autoencode') || blob.includes('embedding')) labels.push('autoencoded-metadata');
  if (blob.includes('audit')) labels.push('deep-audit');
  if (tools.length > 0) labels.push('tool-calling');

  return [...new Set(labels)].slice(0, 12);
}

function toDateScore(ms) {
  const ageDays = Math.max(0, (Date.now() - ms) / (1000 * 60 * 60 * 24));
  if (ageDays <= 1) return 1;
  if (ageDays <= 7) return 0.8;
  if (ageDays <= 30) return 0.6;
  if (ageDays <= 90) return 0.4;
  return 0.2;
}

function buildSearch(filePath, symbols, dependencies) {
  const dirname = normalizePath(path.posix.dirname(filePath));
  const terms = [...symbols.slice(0, 2), ...dependencies.slice(0, 2), 'qdrant', 'redis']
    .filter(Boolean)
    .slice(0, 4)
    .join('|') || 'TODO|FIXME|export';

  return {
    rg: `rg -n -S "${terms}" ${dirname}`,
    ast_grep:
      `ast-grep --pattern 'export async function $NAME($$$ARGS) { $$$BODY }' --lang ts ${dirname}`,
  };
}

function cardBase({ filePath, summaryType, summary, symbols, routes, tables, tools, dependencies, labels, scores, metadata, createdAt }) {
  const source = `summary:${filePath}:${summaryType}`;
  const semanticQueries = [
    `multi query hyper rag dense search ${filePath}`,
    `feature labeling mapping static dynamic imports ${filePath}`,
    `semantic traversal autoencoded metadata ${filePath}`,
  ];

  return {
    id: `summary:${filePath}:${summaryType}:${stableId(source)}`,
    path: filePath,
    summary_type: summaryType,
    summary,
    symbols,
    routes,
    tables,
    tools,
    dependencies,
    labels,
    metadata,
    semantic_queries: semanticQueries,
    search: buildSearch(filePath, symbols, dependencies),
    scores,
    created_at: createdAt,
  };
}

function toVector768(seedText) {
  const digest = createHash('sha256').update(seedText).digest();
  const out = new Array(768);
  for (let i = 0; i < 768; i += 1) {
    const byte = digest[i % digest.length];
    out[i] = Number(((byte / 255) * 2 - 1).toFixed(6));
  }
  return out;
}

async function generateCards() {
  const graph = await readJson(PATHS.graph, { files: [] });
  const batch = await readJson(PATHS.batch, {});
  const atlasText = await readText(PATHS.atlas, '');
  const schemaFiles = await discoverSchemaFiles();

  const knownTables = new Set();
  for (const file of schemaFiles) {
    const text = await readText(file, '');
    for (const tableName of parseTableNames(text)) knownTables.add(tableName);
  }

  const files = ensureArray(graph.files)
    .map((file) => ({ ...file, rel: normalizePath(file.rel) }))
    .filter((file) => SOURCE_EXT.has(path.extname(file.rel || '').toLowerCase()))
    .filter((file) => !file.rel.startsWith('docs/obsidian-vault/'))
    .filter((file) => !file.rel.startsWith('.venv/'))
    .filter((file) => !file.rel.startsWith('node_modules/'))
    .filter((file) => file.rel.startsWith('src/') || file.rel.startsWith('scripts/') || file.rel.startsWith('drizzle/'));

  const maxFanIn = Math.max(1, ...files.map((file) => Number(file.fanIn || 0)));
  const hotDirMap = new Map(ensureArray(batch.hotDirectories).map((row) => [String(row.dir), Number(row.files || 0)]));

  const prioritized = files
    .map((file) => {
      const fanIn = Number(file.fanIn || 0);
      const authority = Math.min(1, fanIn / maxFanIn);
      const routeBonus = file.isRoute ? 0.2 : 0;
      const todoPenalty = Math.min(0.2, ensureArray(file.todos).length * 0.02);
      const importance = authority + routeBonus + Number(file.hasPairedTest ? 0.05 : 0) - todoPenalty;
      return { file, importance };
    })
    .sort((a, b) => b.importance - a.importance)
    .slice(0, Math.max(1, MAX_FILES));

  const cards = [];
  const edges = [];
  let sourceFileCount = 0;

  for (const row of prioritized) {
    const file = row.file;
    const filePath = file.rel;
    const symbols = inferSymbols(file);
    const routes = ensureArray(file.routeHandlers).map((value) => String(value));
    const dependencies = inferDependencies(file);
    const tools = inferTools(file);
    const tables = inferTables(file, [...knownTables]);

    const dir = dirOf(filePath);
    const dirHint = hotDirMap.get(dir) || 0;

    let recency = 0.4;
    let modifiedAt = null;
    try {
      const stat = await fs.stat(path.join(ROOT, filePath));
      recency = toDateScore(stat.mtimeMs);
      modifiedAt = new Date(stat.mtimeMs).toISOString();
    } catch {
      recency = atlasText.includes(filePath) ? 0.6 : 0.3;
      modifiedAt = null;
    }

    const graphAuthority = Math.min(1, Number(file.fanIn || 0) / maxFanIn);
    const retrievalFrequency = Math.min(1, dirHint / 50);
    const featureCoverage = Math.min(1, ([
      file.isRoute ? 1 : 0,
      symbols.length > 0 ? 1 : 0,
      tables.length > 0 ? 1 : 0,
      tools.length > 0 ? 1 : 0,
      dependencies.length > 0 ? 1 : 0,
      file.hasAuth ? 1 : 0,
      file.hasZod ? 1 : 0,
    ].reduce((sum, v) => sum + v, 0)) / 7);
    const testCoverage = file.hasPairedTest ? 1 : file.isTest ? 1 : 0.2;
    const semanticPriority = Math.min(1, scoreWeight([
      graphAuthority * 0.5,
      featureCoverage * 0.25,
      retrievalFrequency * 0.15,
      recency * 0.1,
    ]));

    const featureLabels = inferFeatureLabels(file, dependencies, tools);

    const labels = [...new Set([
      ...ensureArray(file.tags).map((value) => String(value).toLowerCase()),
      ...dependencies,
      ...featureLabels,
      ...routes.length ? ['route'] : [],
      ...tables.length ? ['database'] : [],
      ...tools.length ? ['tools'] : [],
      ...file.hasAuth ? ['auth'] : [],
      ...file.hasZod ? ['zod'] : [],
      'summary-card',
    ])].slice(0, 16);

    const scoreBase = {
      graph_authority: Number(graphAuthority.toFixed(4)),
      retrieval_frequency: Number(retrievalFrequency.toFixed(4)),
      feature_coverage: Number(featureCoverage.toFixed(4)),
      test_coverage: Number(testCoverage.toFixed(4)),
      recency: Number(recency.toFixed(4)),
      semantic_priority: Number(semanticPriority.toFixed(4)),
    };

    const metadataBase = {
      language: inferLanguage(filePath),
      file_ext: path.extname(filePath).toLowerCase(),
      modified_at: modifiedAt,
      static_import_count: ensureArray(file.imports).length,
      dynamic_import_count: ensureArray(file.dynImports).length,
      reexport_count: ensureArray(file.reExports).length,
      route_handler_count: ensureArray(file.routeHandlers).length,
      feature_labels: featureLabels,
      dns_networking_server_client: featureLabels.includes('dns-networking-server-client'),
      redis_ace_cache_hint: featureLabels.includes('ace-redis-hot-cache'),
      autoencoded_signature: stableId(JSON.stringify({
        path: filePath,
        featureLabels,
        deps: dependencies,
        tools,
      })),
    };

    const baseSummary = compact(
      file.summary ||
      `${filePath} handles retrieval/filter logic using ${dependencies.join(', ') || 'app dependencies'}.`,
      260,
    );

    const fileCard = cardBase({
      filePath,
      summaryType: 'file_summary',
      summary: baseSummary,
      symbols,
      routes,
      tables,
      tools,
      dependencies,
      labels,
      scores: scoreBase,
      metadata: metadataBase,
      createdAt: NOW,
    });
    cards.push(fileCard);

    for (const symbol of symbols.slice(0, 2)) {
      cards.push(cardBase({
        filePath,
        summaryType: 'symbol_summary',
        summary: compact(`${symbol} is exported by ${filePath} and participates in retrieval/filter orchestration.`),
        symbols: [symbol],
        routes,
        tables,
        tools,
        dependencies,
        labels: [...labels, 'symbol'].slice(0, 16),
        scores: scoreBase,
        metadata: metadataBase,
        createdAt: NOW,
      }));
    }

    if (file.isRoute || routes.length) {
      cards.push(cardBase({
        filePath,
        summaryType: 'route_summary',
        summary: compact(`${filePath} exposes route handlers ${routes.join(', ') || 'for this endpoint'} with retrieval-aware context assembly.`),
        symbols,
        routes,
        tables,
        tools,
        dependencies,
        labels: [...labels, 'route-summary'].slice(0, 16),
        scores: scoreBase,
        metadata: metadataBase,
        createdAt: NOW,
      }));
    }

    if (tables.length || dependencies.includes('postgres')) {
      cards.push(cardBase({
        filePath,
        summaryType: 'database_touchpoint',
        summary: compact(`${filePath} touches database entities ${tables.join(', ') || 'via drizzle/postgres adapters'} and contributes to retrieval metadata joins.`),
        symbols,
        routes,
        tables,
        tools,
        dependencies,
        labels: [...labels, 'db-touchpoint'].slice(0, 16),
        scores: scoreBase,
        metadata: metadataBase,
        createdAt: NOW,
      }));
    }

    if (tools.length) {
      cards.push(cardBase({
        filePath,
        summaryType: 'tool_api_call',
        summary: compact(`${filePath} invokes tool/API lanes ${tools.join(', ')} for retrieval, tagging, or synthesis.`),
        symbols,
        routes,
        tables,
        tools,
        dependencies,
        labels: [...labels, 'tool-api'].slice(0, 16),
        scores: scoreBase,
        metadata: metadataBase,
        createdAt: NOW,
      }));
    }

    if (file.localhostBreaks || file.ssrUnsafe || ensureArray(file.todos).length > 0) {
      cards.push(cardBase({
        filePath,
        summaryType: 'error_risk',
        summary: compact(
          `${filePath} has risk signals: todos=${ensureArray(file.todos).length}, localhostBreaks=${Boolean(file.localhostBreaks)}, ssrUnsafe=${Boolean(file.ssrUnsafe)}.`,
        ),
        symbols,
        routes,
        tables,
        tools,
        dependencies,
        labels: [...labels, 'error-risk'].slice(0, 16),
        scores: {
          ...scoreBase,
          semantic_priority: Number(Math.min(1, scoreBase.semantic_priority + 0.08).toFixed(4)),
        },
        metadata: metadataBase,
        createdAt: NOW,
      }));
    }

    cards.push(cardBase({
      filePath,
      summaryType: 'test_coverage',
      summary: compact(`${filePath} test coverage is ${file.hasPairedTest ? 'paired' : 'not paired'} and influences retrieval confidence.`),
      symbols,
      routes,
      tables,
      tools,
      dependencies,
      labels: [...labels, 'test-coverage'].slice(0, 16),
      scores: scoreBase,
      metadata: metadataBase,
      createdAt: NOW,
    }));

    sourceFileCount += 1;
  }

  for (const card of cards) {
    edges.push({ from: card.id, to: `path:${card.path}`, edge_type: 'maps_to_path' });
    for (const label of card.labels || []) edges.push({ from: card.id, to: `label:${label}`, edge_type: 'has_label' });
    for (const symbol of card.symbols || []) edges.push({ from: card.id, to: `symbol:${symbol}`, edge_type: 'summarizes_symbol' });
    for (const route of card.routes || []) edges.push({ from: card.id, to: `route:${route}`, edge_type: 'touches_route' });
    for (const table of card.tables || []) edges.push({ from: card.id, to: `table:${table}`, edge_type: 'touches_table' });
    for (const tool of card.tools || []) edges.push({ from: card.id, to: `tool:${tool}`, edge_type: 'uses_tool' });
    for (const dep of card.dependencies || []) edges.push({ from: card.id, to: `dep:${dep}`, edge_type: 'depends_on' });
  }

  const ranked = cards
    .map((card) => {
      const s = card.scores || {};
      const rank =
        0.35 * Number(s.graph_authority || 0) +
        0.25 * Number(s.retrieval_frequency || 0) +
        0.2 * Number(s.feature_coverage || 0) +
        0.1 * Number(s.test_coverage || 0) +
        0.1 * Number(s.recency || 0);
      return {
        ...card,
        scores: {
          ...s,
          rank_score: Number(rank.toFixed(6)),
        },
      };
    })
    .sort((a, b) => Number(b.scores.rank_score || 0) - Number(a.scores.rank_score || 0));

  const top = ranked.slice(0, Math.max(1, TOP_N));

  return {
    cards: ranked,
    top,
    edges,
    sourceFileCount,
    knownTables: [...knownTables].sort(),
  };
}

async function ensureDirFor(filePath) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
}

async function writeJson(filePath, value) {
  await ensureDirFor(filePath);
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

async function writeJsonl(filePath, rows) {
  await ensureDirFor(filePath);
  const payload = rows.map((row) => JSON.stringify(row)).join('\n');
  await fs.writeFile(filePath, `${payload}${rows.length ? '\n' : ''}`, 'utf8');
}

function toTopMd(topCards) {
  const lines = [
    '# Top 100 Codebase Summary Cards',
    '',
    `- generatedAt: ${NOW}`,
    `- cards: ${topCards.length}`,
    '',
    '| Rank | Card ID | Path | Type | Score |',
    '| --- | --- | --- | --- | --- |',
  ];

  topCards.forEach((card, idx) => {
    lines.push(`| ${idx + 1} | ${card.id} | ${card.path} | ${card.summary_type} | ${Number(card.scores.rank_score || 0).toFixed(4)} |`);
  });

  lines.push('');
  return lines.join('\n');
}

function buildClusterTraversal(topCards) {
  const byDir = new Map();
  const byFeature = new Map();

  for (const card of topCards) {
    const dir = normalizePath(path.posix.dirname(card.path || 'unknown'));
    byDir.set(dir, (byDir.get(dir) || 0) + 1);
    for (const label of card.labels || []) {
      byFeature.set(label, (byFeature.get(label) || 0) + 1);
    }
  }

  const topDirs = [...byDir.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([directory, count]) => ({ directory, count }));

  const topFeatures = [...byFeature.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([feature, count]) => ({ feature, count }));

  return {
    topDirectories: topDirs,
    topFeatures,
    summary: `top-100 traversal across ${topDirs.length} high-density directories and ${topFeatures.length} feature labels`,
  };
}

async function persistRedis(cards, topCards) {
  let Redis;
  try {
    ({ default: Redis } = await import('ioredis'));
  } catch {
    return { ok: false, reason: 'ioredis_not_installed' };
  }

  const redis = new Redis(process.env.REDIS_URL || 'redis://127.0.0.1:6379', {
    lazyConnect: true,
    connectTimeout: 3000,
  });

  try {
    const pipeline = redis.pipeline();
    for (const card of cards.slice(0, 5000)) {
      const pathHash = hashToPathKey(card.path);
      pipeline.set(`card:summary:${card.id}`, JSON.stringify(card));
      pipeline.sadd(`card:path:${pathHash}`, card.id);
      for (const feature of card.labels.slice(0, 8)) {
        pipeline.sadd(`card:feature:${feature}`, card.id);
      }
    }

    pipeline.set(
      `semantic:codebase-map:${stableId('top100')}`,
      JSON.stringify({ generatedAt: NOW, ids: topCards.map((card) => card.id) }),
    );

    await pipeline.exec();
    return { ok: true, cachedCards: Math.min(cards.length, 5000) };
  } catch (error) {
    recordError('persist_redis', 'summary_cards', error, { cardCount: cards.length });
    return { ok: false, reason: error instanceof Error ? error.message : String(error) };
  } finally {
    await redis.quit().catch(() => {});
  }
}

async function persistQdrant(cards) {
  const qdrant = process.env.QDRANT_URL || 'http://127.0.0.1:6333';
  const collection = process.env.SUMMARY_CARDS_QDRANT_COLLECTION || 'summary_cards_768';
  const batchSize = Number(process.env.SUMMARY_CARDS_QDRANT_BATCH_SIZE || 250);

  const createBody = {
    vectors: { size: 768, distance: 'Cosine' },
  };

  const points = cards.slice(0, 5000).map((card) => ({
    id: stableUuid(card.id),
    vector: toVector768(`${card.id}:${card.summary}`),
    payload: {
      id: card.id,
      path: card.path,
      summary_type: card.summary_type,
      summary: card.summary,
      labels: card.labels,
      routes: card.routes,
      tables: card.tables,
      tools: card.tools,
      dependencies: card.dependencies,
      metadata: card.metadata,
      centroidId: (card.labels.find((label) => /^gpu:\d+$/.test(label)) || null),
      scores: card.scores,
      created_at: card.created_at,
      vectorSource: 'synthetic_hash',
    },
  }));

  try {
    await fetch(`${qdrant}/collections/${collection}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(createBody),
    }).catch(() => null);

    let upserted = 0;
    for (let index = 0; index < points.length; index += batchSize) {
      const batch = points.slice(index, index + batchSize);
      const res = await fetch(`${qdrant}/collections/${collection}/points?wait=true`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ points: batch }),
      });

      if (!res.ok) {
        const body = await res.text().catch(() => '');
        recordError('persist_qdrant', collection, `http_${res.status}`, { status: res.status, body: body.slice(0, 240) });
        return { ok: false, reason: `http_${res.status}:${body.slice(0, 240)}` };
      }

      upserted += batch.length;
    }

    return { ok: true, upserted, collection, batchSize };
  } catch (error) {
    recordError('persist_qdrant', collection, error, { cardCount: cards.length });
    return { ok: false, reason: error instanceof Error ? error.message : String(error) };
  }
}

async function persistPostgres(cards) {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    recordError('persist_postgres', 'summary_cards', 'missing_DATABASE_URL');
    return { ok: false, reason: 'missing_DATABASE_URL' };
  }

  let pg;
  try {
    ({ default: pg } = await import('pg'));
  } catch {
    recordError('persist_postgres', 'summary_cards', 'pg_not_installed');
    return { ok: false, reason: 'pg_not_installed' };
  }

  const client = new pg.Client({ connectionString });

  try {
    await client.connect();
    await client.query('CREATE EXTENSION IF NOT EXISTS vector');
    await client.query(`
      CREATE TABLE IF NOT EXISTS summary_cards (
        id bigserial PRIMARY KEY,
        card_key text NOT NULL UNIQUE,
        path text NOT NULL,
        summary_type text NOT NULL,
        summary text NOT NULL,
        symbols text[] NOT NULL DEFAULT '{}'::text[],
        routes text[] NOT NULL DEFAULT '{}'::text[],
        tables text[] NOT NULL DEFAULT '{}'::text[],
        tools text[] NOT NULL DEFAULT '{}'::text[],
        dependencies text[] NOT NULL DEFAULT '{}'::text[],
        labels text[] NOT NULL DEFAULT '{}'::text[],
        metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
        embedding vector(768),
        created_at timestamptz NOT NULL DEFAULT now()
      )
    `);

    for (const card of cards.slice(0, 5000)) {
      await client.query(
        `
          INSERT INTO summary_cards (
            card_key, path, summary_type, summary, symbols, routes, tables, tools, dependencies, labels, metadata, embedding, created_at
          ) VALUES (
            $1, $2, $3, $4, $5::text[], $6::text[], $7::text[], $8::text[], $9::text[], $10::text[], $11::jsonb, NULL, $12::timestamptz
          )
          ON CONFLICT (card_key) DO UPDATE SET
            path = EXCLUDED.path,
            summary_type = EXCLUDED.summary_type,
            summary = EXCLUDED.summary,
            symbols = EXCLUDED.symbols,
            routes = EXCLUDED.routes,
            tables = EXCLUDED.tables,
            tools = EXCLUDED.tools,
            dependencies = EXCLUDED.dependencies,
            labels = EXCLUDED.labels,
            metadata = EXCLUDED.metadata,
            created_at = EXCLUDED.created_at
        `,
        [
          card.id,
          card.path,
          card.summary_type,
          card.summary,
          card.symbols || [],
          card.routes || [],
          card.tables || [],
          card.tools || [],
          card.dependencies || [],
          card.labels || [],
          JSON.stringify({ scores: card.scores, search: card.search, metadata: card.metadata }),
          card.created_at,
        ],
      );
    }

    return { ok: true, upserted: Math.min(cards.length, 5000) };
  } catch (error) {
    recordError('persist_postgres', 'summary_cards', error, { cardCount: cards.length });
    return { ok: false, reason: error instanceof Error ? error.message : String(error) };
  } finally {
    await client.end().catch(() => {});
  }
}

async function appendLlmsUpdate(sourceFileCount) {
  const llmsPath = path.join(ROOT, 'LLMS.md');
  const existing = await readText(llmsPath, '');
  const marker = '<!-- AGENTS-GEN v1 · do not edit below this line -->';

  const section = [
    '## 2026-05-21 - Codebase Map / Atlas / Semantic Index Update',
    '',
    `- Analyzed ${sourceFileCount.toLocaleString()} deterministic source files.`,
    '- Enriched top 45 files with Gemma4 summaries.',
    '- Wrote `docs/graph/batch-gpu-analysis-report.json`.',
    '- Updated `docs/graph/codebase-map.md`.',
    '- Updated `memory/atlas/codebase-atlas.latest.md`.',
    '- Generated summary-card plan for path, symbol, route, table, tool, error, and test mappings.',
    '- Next: top-100 summary cards, Qdrant centroid tags, Neo4j GraphRAG report, CouchDB report snapshot, DuckDB analytics report.',
    '',
  ].join('\n');

  if (existing.includes('## 2026-05-21 - Codebase Map / Atlas / Semantic Index Update')) {
    return { ok: true, skipped: true };
  }

  if (existing.includes(marker)) {
    const [head, tail] = existing.split(marker);
    const merged = `${head.trimEnd()}\n\n${section}${marker}${tail}`;
    if (!DRY_RUN) await fs.writeFile(llmsPath, merged, 'utf8');
    return { ok: true, skipped: false };
  }

  const merged = `${existing.trimEnd()}\n\n${section}`;
  if (!DRY_RUN) await fs.writeFile(llmsPath, merged, 'utf8');
  return { ok: true, skipped: false };
}

async function main() {
  const bridgeStatus = getNativeBridgeStatus();
  const generated = await generateCards();
  const traversal = buildClusterTraversal(generated.top);

  const laneReport = {
    generatedAt: NOW,
    source: {
      graph: normalizePath(path.relative(ROOT, PATHS.graph)),
      batch: normalizePath(path.relative(ROOT, PATHS.batch)),
      atlas: normalizePath(path.relative(ROOT, PATHS.atlas)),
    },
    sourceFiles: generated.sourceFileCount,
    runtime: {
      bridge: bridgeStatus,
    },
    cardCount: generated.cards.length,
    edgeCount: generated.edges.length,
    cardTypes: generated.cards.reduce((acc, card) => {
      acc[card.summary_type] = (acc[card.summary_type] || 0) + 1;
      return acc;
    }, {}),
    outputs: {
      cardsJsonl: normalizePath(path.relative(ROOT, PATHS.cardsJsonl)),
      edgesJsonl: normalizePath(path.relative(ROOT, PATHS.edgesJsonl)),
      top100Json: normalizePath(path.relative(ROOT, PATHS.top100Json)),
      top100Toon: normalizePath(path.relative(ROOT, PATHS.top100Toon)),
      top100Md: normalizePath(path.relative(ROOT, PATHS.top100Md)),
    },
    storage: {
      postgres: APPLY_POSTGRES,
      qdrant: APPLY_QDRANT,
      redis: APPLY_REDIS,
    },
    dryRun: DRY_RUN,
  };

  const topPacket = {
    generatedAt: NOW,
    scoring: '0.35 graph_authority + 0.25 retrieval_frequency + 0.20 feature_coverage + 0.10 test_coverage + 0.10 recency',
    clusterTraversal: traversal,
    cards: generated.top,
  };

  const neo4jReport = {
    generatedAt: NOW,
    relations: {
      File_to_SummaryCard: generated.cards.length,
      SummaryCard_to_Symbol: generated.edges.filter((edge) => edge.edge_type === 'summarizes_symbol').length,
      SummaryCard_to_Route: generated.edges.filter((edge) => edge.edge_type === 'touches_route').length,
      SummaryCard_to_Table: generated.edges.filter((edge) => edge.edge_type === 'touches_table').length,
      SummaryCard_to_Feature: generated.edges.filter((edge) => edge.edge_type === 'has_label').length,
    },
    cypherHint: 'MERGE (c:SummaryCard {id:$id})-[:HAS_LABEL]->(:Feature {name:$label}) ...',
  };

  const couchReport = {
    generatedAt: NOW,
    db: 'karpathy_wiki',
    snapshotDocId: `summary_cards_snapshot:${NOW.slice(0, 10)}`,
    cards: generated.cards.length,
    topN: generated.top.length,
    status: DRY_RUN ? 'dry-run' : 'ready-to-write',
  };

  const duckdbReport = {
    generatedAt: NOW,
    mode: 'analytics-only',
    suggestedSql: [
      'SELECT summary_type, COUNT(*) AS cnt FROM read_json_auto(\'memory/cards/codebase-summary-cards.jsonl\') GROUP BY 1 ORDER BY 2 DESC;',
      'SELECT path, scores.rank_score FROM read_json_auto(\'memory/cards/top-100-codebase-summary-cards.json\') ORDER BY scores.rank_score DESC LIMIT 25;',
    ],
    cards: generated.cards.length,
    edges: generated.edges.length,
    clusterTraversal: traversal,
  };

  if (!DRY_RUN) {
    await writeJsonl(PATHS.cardsJsonl, generated.cards);
    await writeJsonl(PATHS.edgesJsonl, generated.edges);
    await writeJson(PATHS.top100Json, topPacket);
    await writeJson(PATHS.laneReport, laneReport);
    await writeJson(PATHS.neo4jReport, neo4jReport);
    await writeJson(PATHS.couchReport, couchReport);
    await writeJson(PATHS.duckdbReport, duckdbReport);

    await ensureDirFor(PATHS.top100Toon);
    await fs.writeFile(PATHS.top100Toon, `${toToon(topPacket, 'top_100_codebase_summary_cards')}\n`, 'utf8');

    await ensureDirFor(PATHS.top100Md);
    await fs.writeFile(PATHS.top100Md, `${toTopMd(generated.top)}\n`, 'utf8');
  }

  const storageResults = {
    postgres: { ok: false, reason: 'not_requested' },
    qdrant: { ok: false, reason: 'not_requested' },
    redis: { ok: false, reason: 'not_requested' },
  };

  if (!DRY_RUN && APPLY_POSTGRES) {
    storageResults.postgres = await persistPostgres(generated.cards);
  }
  if (!DRY_RUN && APPLY_QDRANT) {
    storageResults.qdrant = await persistQdrant(generated.cards);
  }
  if (!DRY_RUN && APPLY_REDIS) {
    storageResults.redis = await persistRedis(generated.cards, generated.top);
  }

  const llms = await appendLlmsUpdate(generated.sourceFileCount);
  const errorQueues = !DRY_RUN ? await syncErrorQueuesRedis() : { ok: false, reason: 'dry_run' };

  const errorListReport = {
    generatedAt: NOW,
    runtime: {
      bridge: bridgeStatus,
    },
    errorCount: ERROR_LIST.length,
    errors: ERROR_LIST,
  };

  const errorQueueRows = ERROR_LIST.map((row, idx) => ({
    id: `summary-card-error:${idx + 1}:${stableId(JSON.stringify(row))}`,
    created_at: NOW,
    pipeline: 'summary-card-normalizer',
    stage: row.stage,
    target: row.target,
    error: row.error,
    details: row.details,
    research_hints: [
      'hmm_logger',
      'karpathy_autoresearch',
      'deep_research_subagent',
      'aicrawl',
      'firecrawl',
      'pydantic',
      'vercel_sdk',
    ],
  }));

  if (!DRY_RUN) {
    await writeJson(PATHS.errorList, errorListReport);
    await writeJsonl(PATHS.errorQueue, errorQueueRows);
  }

  if (SMOKE_ONLY || REPORT_ONLY) {
    console.log(JSON.stringify({
      ok: true,
      mode: SMOKE_ONLY ? 'smoke' : 'report-only',
      dryRun: true,
      sourceFiles: generated.sourceFileCount,
      cards: generated.cards.length,
      edges: generated.edges.length,
      topN: generated.top.length,
      cardTypes: generated.cards.reduce((acc, card) => {
        acc[card.summary_type] = (acc[card.summary_type] || 0) + 1;
        return acc;
      }, {}),
      outputs: {
        cardsJsonl: normalizePath(path.relative(ROOT, PATHS.cardsJsonl)),
        top100Json: normalizePath(path.relative(ROOT, PATHS.top100Json)),
        top100Toon: normalizePath(path.relative(ROOT, PATHS.top100Toon)),
        top100Md: normalizePath(path.relative(ROOT, PATHS.top100Md)),
        laneReport: normalizePath(path.relative(ROOT, PATHS.laneReport)),
        errorList: normalizePath(path.relative(ROOT, PATHS.errorList)),
        errorQueue: normalizePath(path.relative(ROOT, PATHS.errorQueue)),
      },
      storage: {
        postgres: { ok: false, reason: 'not_requested' },
        qdrant: { ok: false, reason: 'not_requested' },
        redis: { ok: false, reason: 'not_requested' },
      },
      llmsUpdate: { ok: true, skipped: true, reason: 'smoke_or_report_only' },
      errors: {
        count: ERROR_LIST.length,
        runtimeBridge: bridgeStatus,
        redisQueues: errorQueues,
      },
    }, null, 2));
    return;
  }

  console.log(JSON.stringify({
    ok: true,
    dryRun: DRY_RUN,
    sourceFiles: generated.sourceFileCount,
    cards: generated.cards.length,
    edges: generated.edges.length,
    topN: generated.top.length,
    cardTypes: generated.cards.reduce((acc, card) => {
      acc[card.summary_type] = (acc[card.summary_type] || 0) + 1;
      return acc;
    }, {}),
    outputs: {
      cardsJsonl: normalizePath(path.relative(ROOT, PATHS.cardsJsonl)),
      top100Json: normalizePath(path.relative(ROOT, PATHS.top100Json)),
      top100Toon: normalizePath(path.relative(ROOT, PATHS.top100Toon)),
      top100Md: normalizePath(path.relative(ROOT, PATHS.top100Md)),
      laneReport: normalizePath(path.relative(ROOT, PATHS.laneReport)),
      errorList: normalizePath(path.relative(ROOT, PATHS.errorList)),
      errorQueue: normalizePath(path.relative(ROOT, PATHS.errorQueue)),
    },
    storage: storageResults,
    llmsUpdate: llms,
    errors: {
      count: ERROR_LIST.length,
      runtimeBridge: bridgeStatus,
      redisQueues: errorQueues,
    },
  }, null, 2));
}

main().catch((error) => {
  console.error('[normalize-codebase-summary-cards] failed:', error instanceof Error ? error.message : String(error));
  process.exit(1);
});
