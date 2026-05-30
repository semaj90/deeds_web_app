#!/usr/bin/env node
/**
 * build-codebase-feature-map.mjs
 *
 * Semantic feature labelling for the codebase — analogous to build-repo-env-map.mjs
 * but for semantic feature area analysis instead of env variable usage.
 *
 * Each "feature area" is derived from path segments (e.g. src/lib/server/ace/ → "ace").
 * Signals extracted per file:
 *   routeType    — SvelteKit route type (+server.ts, +page.svelte, etc.)
 *   dbTables     — Drizzle table references
 *   cacheKeys    — Redis key prefixes used
 *   mcpTools     — MCP tool registrations
 *   exports      — exported symbol names
 *   errorMarkers — error fingerprint patterns
 *   hasLlmCall   — file calls a local LLM
 *
 * Usage:
 *   node scripts/atlas/build-codebase-feature-map.mjs
 *   node scripts/atlas/build-codebase-feature-map.mjs --dry-run
 *   node scripts/atlas/build-codebase-feature-map.mjs --limit 500
 *
 * Outputs:
 *   .tmp/codebase-feature-map.json   — machine-readable feature→files map
 *   .tmp/codebase-feature-map.md     — human-readable summary
 *   docs/graph/codebase-feature-map.json — committed artifact
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  loadConfig,
  collectFiles,
  resolveRepoPath,
  readText,
  writeJson,
  writeMarkdown,
  REPO_ROOT,
  fileLanguage,
  toPosixPath,
} from './_atlas-utils.mjs';

const __dir  = path.dirname(fileURLToPath(import.meta.url));
const argv   = process.argv.slice(2);
const DRY_RUN  = argv.includes('--dry-run');
const VERBOSE  = argv.includes('--verbose');
const LIMIT_I  = argv.indexOf('--limit');
const LIMIT    = LIMIT_I >= 0 ? Number(argv[LIMIT_I + 1]) : null;

const config     = loadConfig();
const ignoreDirs = new Set(config.ignoreDirs ?? []);

// ── Feature area taxonomy ──────────────────────────────────────────────────
// Maps directory segments to canonical semantic feature keys
const FEATURE_TAXONOMY = {
  // ACE / retrieval layers
  ace:              'ace.context_assembly',
  'ace-context':    'ace.context_assembly',
  'context-assembler': 'ace.context_assembly',

  // Auth
  auth:             'auth.authentication',
  session:          'auth.session_management',
  oauth:            'auth.oauth',

  // AI / LLM
  ai:               'ai.llm_synthesis',
  ollama:           'ai.llm_synthesis',
  gemma:            'ai.llm_synthesis',
  'openai-facade':  'ai.llm_synthesis',

  // Search & retrieval
  search:           'search.retrieval',
  hyperrag:         'search.hyperrag',
  qdrant:           'search.qdrant_vector',
  engram:           'search.engram_memory',

  // Graph
  neo4j:            'graph.neo4j_traversal',
  graphrag:         'graph.graphrag',
  graph:            'graph.neo4j_traversal',

  // Cases / legal
  cases:            'legal.case_management',
  evidence:         'legal.evidence',
  citations:        'legal.citations',
  forensics:        'legal.forensics',

  // Scoring / ranking
  scoring:          'ranking.authority_score',
  authority:        'ranking.authority_score',
  karpathy:         'ranking.karpathy_blend',
  xgboost:          'ranking.xgboost_hotness',

  // Cache / storage
  cache:            'cache.redis_bifrost',
  redis:            'cache.redis_bifrost',
  'bifrost':        'cache.redis_bifrost',

  // Schema / DB
  db:               'db.drizzle_schema',
  schema:           'db.drizzle_schema',
  drizzle:          'db.drizzle_schema',
  migrations:       'db.migrations',

  // GPU / compute
  gpu:              'gpu.libtorch_bridge',
  libtorch:         'gpu.libtorch_bridge',
  simd:             'gpu.simd_bridge',
  cuda:             'gpu.cuda_compute',
  topology:         'gpu.som_topology',

  // Routes / API
  routes:           'api.sveltekit_routes',
  api:              'api.sveltekit_routes',
  mcp:              'api.mcp_tools',

  // Knowledge / docs
  knowledge:        'knowledge.doc_ingestion',
  wiki:             'knowledge.wiki_notes',
  atlas:            'knowledge.atlas_pipeline',

  // Memory
  memory:           'memory.episodic',
  engram:           'memory.episodic',

  // Analysis
  analysis:         'analysis.entity_extraction',
  entity:           'analysis.entity_extraction',
  langextract:      'analysis.lang_extraction',

  // Error handling
  error:            'errors.error_handling',
  'error-agent':    'errors.error_handling',
};

function deriveFeatureArea(relPath) {
  const parts = toPosixPath(relPath).split('/').filter(Boolean);
  // look for known taxonomy segments deepest first
  for (let i = parts.length - 1; i >= 0; i--) {
    const seg = parts[i].toLowerCase().replace(/\.[^.]+$/, '');
    if (FEATURE_TAXONOMY[seg]) return FEATURE_TAXONOMY[seg];
    // strip common prefixes like build-, run-, smoke-, audit-
    const stripped = seg.replace(/^(build|run|smoke|audit|generate|extract|ingest|index|export|sync|check|validate|test|create|update|delete|get|post|patch)-/, '');
    if (FEATURE_TAXONOMY[stripped]) return FEATURE_TAXONOMY[stripped];
  }
  // fallback to top-level directory grouping
  const libIdx = parts.indexOf('lib');
  if (libIdx >= 0 && parts.length > libIdx + 1) return `lib.${parts[libIdx + 1]}`;
  const routesIdx = parts.indexOf('routes');
  if (routesIdx >= 0) return 'api.sveltekit_routes';
  const top = parts[0] ?? 'repo-root';
  return `workspace.${top}`;
}

// ── Signal extractors ─────────────────────────────────────────────────────────

const ROUTE_PATTERNS = [
  { re: /\+page\.svelte$/,        type: 'svelte_page' },
  { re: /\+page\.server\.ts$/,    type: 'page_server' },
  { re: /\+server\.ts$/,          type: 'api_route' },
  { re: /\+layout\.svelte$/,      type: 'layout' },
  { re: /\+layout\.server\.ts$/,  type: 'layout_server' },
  { re: /\+error\.svelte$/,       type: 'error_boundary' },
];

const DB_TABLES = [
  'users','cases','evidence','documents','citations','sessions','ragMessages',
  'statutes','codebaseChunks','contextTimeline','featureImplementations',
  'fileSummaries','fixerPatterns','llmSynthesisEvents','graphPathwayCards',
  'graphHyperedges','agentObservations','workflowRuns','scenarioCache',
  'errorFingerprints',
];
const DB_TABLE_RE = new RegExp(`\\b(${DB_TABLES.join('|')})\\b`, 'g');

const CACHE_KEY_RE = /['"]((?:ace|bifrost|code|session|embed|gpu|wiki|cache|cluster|graph|kag|summary|user|rec):[a-zA-Z0-9_:*-]{2,40})['"]/g;

const MCP_TOOL_RE = /server\.tool\s*\(\s*['"]([^'"]+)['"]/g;

const EXPORT_RE = /export\s+(?:const|function|class|type|interface|async function)\s+(\w+)/g;

const ERROR_FINGERPRINT_RE = /(?:fingerprint|errorCode|errorType|errorClass|ErrorType)\s*[:=]\s*['"]([^'"]+)['"]/g;

const LLM_CALL_RE = /(?:OLLAMA_BASE|TURBO_BASE|TURBOQUANT_BASE_URL|\/api\/generate|\/api\/chat|gemma4|ollama\.chat|openai\.create)/i;

function extractSignals(filePath, content) {
  const rel = toPosixPath(path.relative(REPO_ROOT, filePath));

  // Route type
  let routeType = null;
  for (const { re, type } of ROUTE_PATTERNS) {
    if (re.test(filePath)) { routeType = type; break; }
  }

  // DB tables
  const dbTables = new Set();
  let m;
  DB_TABLE_RE.lastIndex = 0;
  while ((m = DB_TABLE_RE.exec(content))) dbTables.add(m[1]);

  // Cache keys
  const cacheKeys = new Set();
  CACHE_KEY_RE.lastIndex = 0;
  while ((m = CACHE_KEY_RE.exec(content))) cacheKeys.add(m[1]);

  // MCP tools
  const mcpTools = new Set();
  MCP_TOOL_RE.lastIndex = 0;
  while ((m = MCP_TOOL_RE.exec(content))) mcpTools.add(m[1]);

  // Exports
  const exports = new Set();
  EXPORT_RE.lastIndex = 0;
  while ((m = EXPORT_RE.exec(content))) exports.add(m[1]);

  // Error fingerprints
  const errorMarkers = new Set();
  ERROR_FINGERPRINT_RE.lastIndex = 0;
  while ((m = ERROR_FINGERPRINT_RE.exec(content))) errorMarkers.add(m[1]);

  // LLM call
  const hasLlmCall = LLM_CALL_RE.test(content);

  // Compute simple completeness score
  const score = (routeType ? 2 : 0)
    + dbTables.size
    + (cacheKeys.size > 0 ? 1 : 0)
    + (mcpTools.size > 0 ? 2 : 0)
    + Math.min(exports.size, 5)
    + (hasLlmCall ? 1 : 0);

  return {
    rel,
    lang: fileLanguage(rel),
    routeType,
    dbTables: [...dbTables],
    cacheKeys: [...cacheKeys],
    mcpTools: [...mcpTools],
    exports: [...exports].slice(0, 20),
    errorMarkers: [...errorMarkers],
    hasLlmCall,
    lines: content.split('\n').length,
    score,
  };
}

// ── Main ──────────────────────────────────────────────────────────────────────

const scanRoots = config.scanRoots.map(r => resolveRepoPath(r));
const SRC_EXT = new Set(['.ts', '.tsx', '.js', '.mjs', '.svelte', '.cjs', '.mts']);

const allFiles = [];
for (const root of scanRoots) {
  collectFiles(root, ignoreDirs, (fp, name) => {
    const ext = path.extname(name).toLowerCase();
    return SRC_EXT.has(ext);
  }, allFiles);
}

const files = LIMIT ? allFiles.slice(0, LIMIT) : allFiles;
console.log(`[codebase-feature-map] Scanning ${files.length} files from ${scanRoots.length} roots`);

// Feature map: featureKey → { files, signals aggregate }
/** @type {Map<string, { files: string[], dbTables: Set<string>, cacheKeys: Set<string>, mcpTools: Set<string>, exports: Set<string>, errorMarkers: Set<string>, routeTypes: Set<string>, hasLlmCall: boolean, totalLines: number, topScoreFile: string, topScore: number }>} */
const featureMap = new Map();

let processed = 0;
for (const fp of files) {
  const content = readText(fp, '');
  if (!content.trim()) continue;

  const rel = toPosixPath(path.relative(REPO_ROOT, fp));
  const featureKey = deriveFeatureArea(rel);
  const signals = extractSignals(fp, content);

  if (!featureMap.has(featureKey)) {
    featureMap.set(featureKey, {
      files: [],
      dbTables:     new Set(),
      cacheKeys:    new Set(),
      mcpTools:     new Set(),
      exports:      new Set(),
      errorMarkers: new Set(),
      routeTypes:   new Set(),
      hasLlmCall:   false,
      totalLines:   0,
      topScoreFile: '',
      topScore:     0,
    });
  }

  const fa = featureMap.get(featureKey);
  fa.files.push(rel);
  signals.dbTables.forEach(t => fa.dbTables.add(t));
  signals.cacheKeys.forEach(k => fa.cacheKeys.add(k));
  signals.mcpTools.forEach(t => fa.mcpTools.add(t));
  signals.exports.forEach(e => fa.exports.add(e));
  signals.errorMarkers.forEach(e => fa.errorMarkers.add(e));
  if (signals.routeType) fa.routeTypes.add(signals.routeType);
  if (signals.hasLlmCall) fa.hasLlmCall = true;
  fa.totalLines += signals.lines;
  if (signals.score > fa.topScore) {
    fa.topScore = signals.score;
    fa.topScoreFile = rel;
  }

  processed++;
  if (VERBOSE && processed % 200 === 0) {
    console.log(`  [${processed}/${files.length}] features found: ${featureMap.size}`);
  }
}

console.log(`[codebase-feature-map] Processed ${processed} files → ${featureMap.size} feature areas`);

// ── Serialize ─────────────────────────────────────────────────────────────────

function computeStatus(fa) {
  const fileCount = fa.files.length;
  const hasRoute = fa.routeTypes.size > 0;
  const hasDb = fa.dbTables.size > 0;
  const hasMcp = fa.mcpTools.size > 0;
  if (fileCount > 15 && hasDb && hasRoute) return 'implemented';
  if (fileCount > 5 && (hasDb || hasRoute || hasMcp)) return 'partial';
  if (fileCount > 2) return 'stub';
  return 'candidate';
}

const featureMapJson = {
  generatedAt: new Date().toISOString(),
  repoName: config.repoName,
  totalFiles: processed,
  totalFeatureAreas: featureMap.size,
  features: Object.fromEntries(
    [...featureMap.entries()].sort((a, b) => b[1].files.length - a[1].files.length).map(([key, fa]) => [
      key,
      {
        fileCount: fa.files.length,
        status: computeStatus(fa),
        topScoreFile: fa.topScoreFile,
        dbTables: [...fa.dbTables],
        cacheKeys: [...fa.cacheKeys].slice(0, 10),
        mcpTools: [...fa.mcpTools],
        routeTypes: [...fa.routeTypes],
        hasLlmCall: fa.hasLlmCall,
        totalLines: fa.totalLines,
        exports: [...fa.exports].slice(0, 15),
        errorMarkers: [...fa.errorMarkers].slice(0, 10),
        // Include top-30 files sorted by path
        files: fa.files.sort().slice(0, 30),
      },
    ])
  ),
};

// ── Markdown report ───────────────────────────────────────────────────────────

function buildMarkdown(data) {
  const lines = [
    `# Codebase Feature Map`,
    ``,
    `Generated: ${data.generatedAt}  |  Files: ${data.totalFiles}  |  Features: ${data.totalFeatureAreas}`,
    ``,
    `## Feature Area Summary`,
    ``,
    `| Feature Area | Files | Status | DB Tables | MCP Tools | Route Types |`,
    `|---|---|---|---|---|---|`,
  ];
  for (const [key, fa] of Object.entries(data.features).slice(0, 50)) {
    const routeStr = fa.routeTypes.join(', ') || '—';
    const dbStr    = fa.dbTables.slice(0, 3).join(', ') || '—';
    const mcpStr   = fa.mcpTools.slice(0, 2).join(', ') || '—';
    lines.push(`| \`${key}\` | ${fa.fileCount} | ${fa.status} | ${dbStr} | ${mcpStr} | ${routeStr} |`);
  }
  lines.push('');
  lines.push('## Top Feature Areas by File Count');
  lines.push('');
  for (const [key, fa] of Object.entries(data.features).slice(0, 15)) {
    lines.push(`### ${key}`);
    lines.push(`- **Files**: ${fa.fileCount}  |  **Status**: ${fa.status}  |  **Lines**: ${fa.totalLines}`);
    if (fa.dbTables.length) lines.push(`- **DB tables**: ${fa.dbTables.join(', ')}`);
    if (fa.mcpTools.length) lines.push(`- **MCP tools**: ${fa.mcpTools.join(', ')}`);
    if (fa.cacheKeys.length) lines.push(`- **Cache keys**: ${fa.cacheKeys.slice(0, 5).join(', ')}`);
    if (fa.hasLlmCall) lines.push(`- **LLM integration**: yes`);
    lines.push(`- **Top file**: \`${fa.topScoreFile}\``);
    lines.push('');
  }
  return lines.join('\n');
}

// ── Write outputs ─────────────────────────────────────────────────────────────

const TMP_JSON = resolveRepoPath('.tmp/codebase-feature-map.json');
const TMP_MD   = resolveRepoPath('.tmp/codebase-feature-map.md');
const DOCS_JSON = resolveRepoPath('docs/graph/codebase-feature-map.json');

if (DRY_RUN) {
  console.log(`[codebase-feature-map] DRY RUN — would write:`);
  console.log(`  ${TMP_JSON}`);
  console.log(`  ${TMP_MD}`);
  console.log(`  ${DOCS_JSON}`);
  console.log(`\nTop 10 feature areas:`);
  for (const [key, fa] of Object.entries(featureMapJson.features).slice(0, 10)) {
    console.log(`  ${key}: ${fa.fileCount} files, status=${fa.status}`);
  }
} else {
  writeJson(TMP_JSON, featureMapJson);
  writeMarkdown(TMP_MD, buildMarkdown(featureMapJson));
  writeJson(DOCS_JSON, featureMapJson);
  console.log(`[codebase-feature-map] Written → ${TMP_JSON}`);
  console.log(`[codebase-feature-map] Written → ${TMP_MD}`);
  console.log(`[codebase-feature-map] Written → ${DOCS_JSON}`);
}

console.log(`\nSummary: ${featureMap.size} feature areas across ${processed} files`);
const statuses = {};
for (const fa of Object.values(featureMapJson.features)) {
  statuses[fa.status] = (statuses[fa.status] ?? 0) + 1;
}
for (const [status, count] of Object.entries(statuses)) {
  console.log(`  ${status}: ${count}`);
}
