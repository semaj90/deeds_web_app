#!/usr/bin/env node
/**
 * Graphify Audit — Gemma4 llama-server + @ast-grep/napi + HMM Kanban
 *
 * Pipeline:
 *   1. Scan source files (TypeScript/Svelte/JS)
 *   2. Extract real AST features via @ast-grep/napi (pseudo-reranker signal)
 *   3. Run LangExtract via llama-server :8090 (legal + code entities)
 *   4. Merge AST + entity signals → blend confidence score
 *   5. Call Gemma4 at llama-server :8090 for audit recommendations
 *   6. Classify each recommendation via HMM Viterbi (error state detection)
 *   7. Write HMM-classified tasks into LangGraph Kanban queue (Postgres + JSON)
 *
 * Usage:
 *   node scripts/graphify-audit/graphify-audit-gemma4.mjs [flags]
 *   npm run graphify:audit
 *   npm run graphify:audit:dry
 *   npm run graphify:audit:full
 *
 * Flags:
 *   --dry-run        Analyse + print, do NOT write Kanban tasks to Postgres
 *   --gemma4         Enable live Gemma4 recommendation call (default: off in dry-run)
 *   --limit=N        Max files to audit (default: 50)
 *   --verbose        Print per-file details
 *   --output-dir=X   Output JSON directory (default: .tmp)
 *   --health         Print service health check and exit
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import { loadRepoEnv, resolveDatabaseUrl } from '../atlas/connection-config.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');

Object.assign(process.env, loadRepoEnv(process.env));

// ── Config ────────────────────────────────────────────────────────────────────
const DRY_RUN   = process.argv.includes('--dry-run');
const USE_GEMMA4 = process.argv.includes('--gemma4') || !DRY_RUN;
const VERBOSE   = process.argv.includes('--verbose');
const HEALTH_ONLY = process.argv.includes('--health');
const LIMIT     = parseInt(process.argv.find(a => a.startsWith('--limit='))?.split('=')[1] || '50');
const OUTPUT_DIR = process.argv.find(a => a.startsWith('--output-dir='))?.split('=')[1] || '.tmp';

const LLAMA_URL  = (process.env.LLAMA_SERVER_URL || 'http://127.0.0.1:8090').replace(/\/+$/, '');
const GEMMA4_MODEL = process.env.LANGEXTRACT_MODEL || 'gemma4-legal-iq4xs-direct.gguf';
const DATABASE_URL = resolveDatabaseUrl(loadRepoEnv(process.env));

fs.mkdirSync(path.resolve(ROOT, OUTPUT_DIR), { recursive: true });

// ── Logging ───────────────────────────────────────────────────────────────────
function log(msg, level = 'info') {
  const icon = { info: '✓', warn: '⚠', error: '✗', debug: '◆' }[level] || '•';
  console.log(`[${new Date().toISOString().slice(11, 19)}] ${icon} ${msg}`);
}
function vlog(msg) { if (VERBOSE) log(msg, 'debug'); }

// ── HMM tables (mirrors hmm-error-classifier.ts) ─────────────────────────────
const HMM_STATES = [
  'schema_mismatch', 'missing_dependency', 'stale_cache',
  'retrieval_miss', 'worker_timeout', 'codec_failure',
  'audit_recommendation', 'unknown',
];

const HMM_EMISSION = {
  schema_mismatch:      { SQL_RELATION_MISSING: 0.9, COLUMN_MISSING: 0.8, HTTP_500: 0.3, TYPECHECK_FAIL: 0.4 },
  missing_dependency:   { IMPORT_FAIL: 0.9, HTTP_404: 0.5, TYPECHECK_FAIL: 0.6 },
  stale_cache:          { EMPTY_RESULT: 0.7, HTTP_404: 0.4 },
  retrieval_miss:       { EMPTY_RESULT: 0.9, HTTP_404: 0.6, HTTP_500: 0.2 },
  worker_timeout:       { TIMEOUT: 0.95, HTTP_500: 0.4, EMPTY_RESULT: 0.3 },
  codec_failure:        { DECODE_FAIL: 0.95, HTTP_500: 0.3, TYPECHECK_FAIL: 0.5 },
  // Gemma4 architectural recommendations — detected via ARCH_SIGNAL, not error logs
  audit_recommendation: { ARCH_SIGNAL: 0.90, REFACTOR_SIGNAL: 0.85, TYPECHECK_FAIL: 0.10 },
  unknown:              { HTTP_500: 0.3, EMPTY_RESULT: 0.2, TIMEOUT: 0.2 },
};

const HMM_PRIOR = {
  schema_mismatch: 0.18, missing_dependency: 0.14, stale_cache: 0.14,
  retrieval_miss: 0.18, worker_timeout: 0.14, codec_failure: 0.09,
  audit_recommendation: 0.08, unknown: 0.05,
};

const HMM_ACTION = {
  schema_mismatch:      'Run drizzle-kit introspect; verify CREATE TABLE migration applied',
  missing_dependency:   'Run npm install in sveltekit-frontend; check $lib alias resolution',
  stale_cache:          'Invalidate BitFrost keys; run atlas:phase8:step1:bitfrost:warm',
  retrieval_miss:       'Check Qdrant collection count and codebase_chunk_index population',
  worker_timeout:       'Check Gemma4 :8090 health; increase AbortSignal.timeout; reduce batch',
  codec_failure:        'Verify @msgpack/msgpack round-trip; check BYTEA column integrity',
  audit_recommendation: 'Create review/refactor task in LangGraph Kanban; queue for operator review',
  unknown:              'Inspect error details; escalate to operator',
};

// Architectural keywords that route Gemma4 recs to audit_recommendation state
const ARCH_KEYWORDS = /refactor|consolidat|extract.*service|separate.*concern|improve.*perf|dedup|dead.?code|remove.*unused|migrate.*to|replace.*with|abstract|modularize/i;
const REFACTOR_KEYWORDS = /should be|consider|recommend|suggest|would benefit|ought to|ideally|better approach/i;

const OBS_PATTERNS = [
  { re: /relation.*does not exist|table.*not found/i,  obs: 'SQL_RELATION_MISSING' },
  { re: /column.*does not exist/i,                      obs: 'COLUMN_MISSING' },
  { re: /cannot find module|import.*fail|ERR_MODULE/i,  obs: 'IMPORT_FAIL' },
  { re: /404|not found/i,                               obs: 'HTTP_404' },
  { re: /500|internal server error/i,                   obs: 'HTTP_500' },
  { re: /timeout|timed out|ETIMEDOUT|AbortError/i,      obs: 'TIMEOUT' },
  { re: /empty result|no rows|0 rows/i,                 obs: 'EMPTY_RESULT' },
  { re: /decode.*fail|msgpack|BYTEA|binary.*invalid/i,  obs: 'DECODE_FAIL' },
  { re: /TypeScript|TS\d{4}|type.*error|svelte-check/i, obs: 'TYPECHECK_FAIL' },
  // Gemma4 architectural recommendation signals (not runtime errors)
  { re: ARCH_KEYWORDS,                                   obs: 'ARCH_SIGNAL' },
  { re: REFACTOR_KEYWORDS,                               obs: 'REFACTOR_SIGNAL' },
];

function normalizeObs(text) {
  for (const { re, obs } of OBS_PATTERNS) {
    if (re.test(text)) return obs;
  }
  return null;
}

function hmmClassify(observations) {
  if (!observations.length) return { state: 'unknown', confidence: 0 };

  let scores = {};
  for (const s of HMM_STATES) {
    scores[s] = HMM_PRIOR[s] * (HMM_EMISSION[s][observations[0]] ?? 0.01);
  }
  for (let t = 1; t < observations.length; t++) {
    const next = {};
    for (const s of HMM_STATES) next[s] = scores[s] * (HMM_EMISSION[s][observations[t]] ?? 0.01);
    scores = next;
  }
  let best = 'unknown', bestScore = -1;
  for (const [s, v] of Object.entries(scores)) {
    if (v > bestScore) { bestScore = v; best = s; }
  }
  const total = Object.values(scores).reduce((a, b) => a + b, 0);
  return { state: best, confidence: total > 0 ? parseFloat((bestScore / total).toFixed(4)) : 0 };
}

// ── AST feature extraction via @ast-grep/napi ─────────────────────────────────
let astGrep = null;
async function loadAstGrep() {
  if (astGrep) return astGrep;
  try {
    const require = createRequire(import.meta.url);
    astGrep = require(path.join(ROOT, 'sveltekit-frontend/node_modules/@ast-grep/napi'));
    return astGrep;
  } catch {
    return null;
  }
}

function detectLang(file) {
  if (file.endsWith('.tsx')) return 'Tsx';
  if (file.endsWith('.jsx')) return 'Jsx';
  if (file.endsWith('.js') || file.endsWith('.mjs')) return 'JavaScript';
  return 'TypeScript';
}

async function extractAstFeatures(code, file) {
  const napi = await loadAstGrep();
  if (!napi) return [];

  const lang = detectLang(file);
  let root;
  try {
    root = napi.parse(lang, code);
  } catch {
    try { root = napi.parse('TypeScript', code); } catch { return []; }
  }

  const features = [];
  const seen = new Set();

  // Named functions
  for (const node of root.root().findAll({ rule: { kind: 'function_declaration' } })) {
    const name = node.child(1)?.text() ?? '<anon>';
    const line = node.range().start.line + 1;
    const key = `fn:${name}:${line}`;
    if (seen.has(key)) continue;
    seen.add(key);
    features.push({ type: 'ast_function', name, line, confidence: 0.95 });
  }

  // Arrow functions
  for (const node of root.root().findAll({ rule: { kind: 'lexical_declaration' } })) {
    const decl = node.find({ rule: { kind: 'variable_declarator' } });
    if (!decl?.find({ rule: { kind: 'arrow_function' } })) continue;
    const name = decl.child(0)?.text() ?? '<anon>';
    const line = node.range().start.line + 1;
    const key = `arrow:${name}:${line}`;
    if (seen.has(key)) continue;
    seen.add(key);
    features.push({ type: 'ast_arrow', name, line, confidence: 0.92 });
  }

  // Classes
  for (const node of root.root().findAll({ rule: { kind: 'class_declaration' } })) {
    const name = node.find({ rule: { kind: 'type_identifier' } })?.text() ?? '<anon>';
    const line = node.range().start.line + 1;
    const key = `cls:${name}:${line}`;
    if (seen.has(key)) continue;
    seen.add(key);
    features.push({ type: 'ast_class', name, line, confidence: 0.95 });
  }

  return features;
}

// ── LangExtract via llama-server ──────────────────────────────────────────────
async function extractEntitiesViaLlama(text) {
  const systemPrompt =
    'You are a legal/code entity extractor. Return ONLY a JSON array. ' +
    'Each item: {"class":"TYPE","text":"exact text","attr":{}} ' +
    'Types: PARTY, DATE, CITATION, MONEY, STATUTE, CONCEPT, LOCATION, FUNCTION. ' +
    'No explanation, no markdown.';

  const payload = JSON.stringify({
    model: GEMMA4_MODEL,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user',   content: `Extract entities:\n\n${text.slice(0, 2000)}` },
    ],
    temperature: 0.1,
    max_tokens: 512,
    stream: false,
  });

  const resp = await fetch(`${LLAMA_URL}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: payload,
    signal: AbortSignal.timeout(60_000),
  });

  if (!resp.ok) throw new Error(`llama-server HTTP ${resp.status}`);
  const data = await resp.json();
  const raw = (data.choices?.[0]?.message?.content ?? '').trim()
    .replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();

  let entities = [];
  try {
    const parsed = JSON.parse(raw);
    entities = Array.isArray(parsed) ? parsed : [];
  } catch {
    for (const m of raw.matchAll(/\{[^{}]+\}/g)) {
      try { const o = JSON.parse(m[0]); if (o.class && o.text) entities.push(o); } catch { }
    }
  }
  return entities;
}

// ── Gemma4 recommendation call ────────────────────────────────────────────────
async function getGemma4Recommendations(astFeatures, entities, fileList) {
  const featureSummary = [
    ...astFeatures.map(f => `[AST/${f.type}] ${f.name} (conf ${f.confidence})`),
    ...entities.map(e => `[ENTITY/${e.class}] ${e.text}`),
  ].slice(0, 30).join('\n');

  const fileSample = fileList.slice(0, 20).join('\n');

  const systemPrompt =
    'You are a senior code auditor for a legal AI platform (SvelteKit + TypeScript + Postgres + Qdrant + LangGraph). ' +
    'Given extracted AST features and entities, produce 5–8 prioritised recommendations. ' +
    'Each recommendation must specify: title, priority (high/medium/low), category ' +
    '(schema|dependency|cache|retrieval|timeout|codec|refactor), ' +
    'affected_files (list), and suggested_action. ' +
    'Return ONLY valid JSON: {"recommendations":[{...}]}. No markdown.';

  const userPrompt =
    `Files audited (sample):\n${fileSample}\n\n` +
    `Extracted features:\n${featureSummary}\n\n` +
    'Produce recommendations for the LangGraph error-fixing Kanban queue.';

  const payload = JSON.stringify({
    model: GEMMA4_MODEL,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user',   content: userPrompt },
    ],
    temperature: 0.3,
    max_tokens: 1024,
    stream: true,
  });

  const resp = await fetch(`${LLAMA_URL}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: payload,
    signal: AbortSignal.timeout(90_000),
  });
  if (!resp.ok) throw new Error(`Gemma4 HTTP ${resp.status}`);

  // Assemble SSE stream
  let assembled = '';
  const decoder = new TextDecoder();
  let buf = '';
  for await (const chunk of resp.body) {
    buf += decoder.decode(chunk, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop() ?? '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;
      const payload = trimmed.slice(5).trim();
      if (payload === '[DONE]') break;
      try {
        const parsed = JSON.parse(payload);
        assembled += parsed.choices?.[0]?.delta?.content ?? '';
      } catch { }
    }
  }

  const raw = assembled.trim()
    .replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();

  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : (parsed.recommendations ?? []);
  } catch {
    // Partial JSON — extract objects
    const recs = [];
    for (const m of raw.matchAll(/\{[^{}]+\}/g)) {
      try { recs.push(JSON.parse(m[0])); } catch { }
    }
    return recs;
  }
}

// ── Kanban task builder ───────────────────────────────────────────────────────
function buildKanbanTask(rec, hmmResult, idx) {
  const taskId = `graphify-audit-${Date.now()}-${idx}`;
  const priority = rec.priority ?? 'medium';
  const lane = priority === 'high' ? 'todo' : 'in_progress';

  return {
    task_id: taskId,
    packet_key: `graphify:audit:${rec.category ?? 'unknown'}:${idx}`,
    feature_id: rec.category ?? 'audit',
    feature_label: rec.title ?? 'Graphify Audit Task',
    source_refs: Array.isArray(rec.affected_files) ? rec.affected_files.slice(0, 5) : [],
    lane,
    status: 'pending',
    policy_score: priority === 'high' ? 0.9 : priority === 'low' ? 0.4 : 0.65,
    error_pattern: hmmResult.state,
    hmm_confidence: hmmResult.confidence,
    hmm_suggested_action: HMM_ACTION[hmmResult.state],
    gemma4_recommendation: rec.suggested_action ?? '',
    ast_reranker_signal: rec._astSignal ?? null,
    langextract_signal: rec._entitySignal ?? null,
    blend_confidence: rec._blendConfidence ?? null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

// ── Health check ──────────────────────────────────────────────────────────────
async function checkHealth() {
  const checks = {};

  // Gemma4 / llama-server
  try {
    const r = await fetch(`${LLAMA_URL}/v1/models`, { signal: AbortSignal.timeout(5000) });
    const d = await r.json();
    checks.llama_server = { ok: r.ok, model: d.data?.[0]?.id ?? 'unknown', url: LLAMA_URL };
  } catch (e) {
    checks.llama_server = { ok: false, error: e.message, url: LLAMA_URL };
  }

  // @ast-grep/napi
  const napi = await loadAstGrep();
  checks.ast_grep = { ok: !!napi, note: napi ? 'loaded' : 'unavailable — regex fallback' };

  log(`llama-server: ${checks.llama_server.ok ? '✓' : '✗'} ${checks.llama_server.model ?? checks.llama_server.error}`);
  log(`ast-grep/napi: ${checks.ast_grep.ok ? '✓' : '✗'} ${checks.ast_grep.note}`);
  return checks;
}

// ── Write Kanban tasks to Postgres ────────────────────────────────────────────
async function persistKanbanTasks(tasks) {
  let pg;
  try {
    const { default: pg_ } = await import('pg');
    pg = pg_;
  } catch {
    log('pg not available — skipping Postgres write', 'warn');
    return;
  }

  const pool = new pg.Pool({ connectionString: DATABASE_URL });
  try {
    // Table may not exist yet — create it if missing
    await pool.query(`
      CREATE TABLE IF NOT EXISTS graphify_audit_kanban (
        task_id            TEXT PRIMARY KEY,
        packet_key         TEXT NOT NULL,
        feature_id         TEXT,
        feature_label      TEXT,
        source_refs        TEXT[],
        lane               TEXT NOT NULL DEFAULT 'todo',
        status             TEXT NOT NULL DEFAULT 'pending',
        policy_score       REAL,
        error_pattern      TEXT,
        hmm_confidence     REAL,
        hmm_suggested_action TEXT,
        gemma4_recommendation TEXT,
        ast_reranker_signal  JSONB,
        langextract_signal   JSONB,
        blend_confidence   REAL,
        created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    let inserted = 0;
    for (const task of tasks) {
      try {
        await pool.query(`
          INSERT INTO graphify_audit_kanban
            (task_id, packet_key, feature_id, feature_label, source_refs,
             lane, status, policy_score, error_pattern, hmm_confidence,
             hmm_suggested_action, gemma4_recommendation,
             ast_reranker_signal, langextract_signal, blend_confidence,
             created_at, updated_at)
          VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
          ON CONFLICT (task_id) DO UPDATE SET
            status = EXCLUDED.status,
            updated_at = NOW()
        `, [
          task.task_id, task.packet_key, task.feature_id, task.feature_label,
          task.source_refs, task.lane, task.status, task.policy_score,
          task.error_pattern, task.hmm_confidence, task.hmm_suggested_action,
          task.gemma4_recommendation,
          task.ast_reranker_signal ? JSON.stringify(task.ast_reranker_signal) : null,
          task.langextract_signal  ? JSON.stringify(task.langextract_signal)  : null,
          task.blend_confidence,
          task.created_at, task.updated_at,
        ]);
        inserted++;
      } catch (e) {
        log(`Failed to insert ${task.task_id}: ${e.message}`, 'warn');
      }
    }
    log(`Postgres: ${inserted}/${tasks.length} kanban tasks written`);
  } finally {
    await pool.end();
  }
}

// ── Main pipeline ─────────────────────────────────────────────────────────────
async function main() {
  log(`Graphify Audit — Gemma4 + AST-Grep + LangExtract + HMM Kanban`);
  log(`llama-server: ${LLAMA_URL}  model: ${GEMMA4_MODEL}`);
  log(`dry-run: ${DRY_RUN}  limit: ${LIMIT}  gemma4: ${USE_GEMMA4}`);

  if (HEALTH_ONLY) {
    await checkHealth();
    process.exit(0);
  }

  const health = await checkHealth();

  // ── Step 1: Scan files ────────────────────────────────────────────────────
  log('Step 1: Scanning source files...');
  const srcBase = path.join(ROOT, 'sveltekit-frontend/src');
  const exts = new Set(['.ts', '.svelte', '.js', '.mjs', '.tsx']);

  async function scanDir(dir) {
    const results = [];
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return results; }
    for (const e of entries) {
      if (e.name === 'node_modules' || e.name === '.svelte-kit' || e.name === 'build') continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) results.push(...await scanDir(full));
      else if (e.isFile() && exts.has(path.extname(e.name))) results.push(full);
    }
    return results;
  }

  const allFiles = await scanDir(srcBase);
  const files = allFiles.slice(0, LIMIT);
  log(`  Found ${allFiles.length} files → auditing ${files.length}`);

  // ── Step 2: AST feature extraction (pseudo-reranker) ─────────────────────
  log('Step 2: AST feature extraction (@ast-grep/napi pseudo-reranker)...');
  const allAstFeatures = [];
  const fileFeatureMap = new Map();

  for (const file of files) {
    let code;
    try { code = fs.readFileSync(file, 'utf8'); } catch { continue; }
    const relPath = path.relative(ROOT, file);
    const features = await extractAstFeatures(code, file);
    if (features.length) {
      allAstFeatures.push(...features.map(f => ({ ...f, file: relPath })));
      fileFeatureMap.set(relPath, features);
    }
    vlog(`  ${relPath}: ${features.length} AST features`);
  }

  log(`  Total AST features extracted: ${allAstFeatures.length}`);

  // ── Step 3: LangExtract entities from Gemma4 (sample of high-complexity files) ──
  log('Step 3: LangExtract entity extraction via llama-server...');
  const allEntities = [];

  // Pick the files with most AST features (highest complexity signal)
  const complexFiles = [...fileFeatureMap.entries()]
    .sort(([, a], [, b]) => b.length - a.length)
    .slice(0, 10);

  for (const [relPath, features] of complexFiles) {
    vlog(`  LangExtract: ${relPath} (${features.length} AST features)`);
    if (health.llama_server?.ok) {
      try {
        const code = fs.readFileSync(path.join(ROOT, relPath), 'utf8');
        const entities = await extractEntitiesViaLlama(code);
        allEntities.push(...entities.map(e => ({ ...e, file: relPath })));
        vlog(`    → ${entities.length} entities`);
      } catch (e) {
        vlog(`    ✗ ${e.message}`);
      }
    } else {
      vlog(`    ✗ llama-server unavailable — skipping LangExtract`);
    }
  }

  log(`  Total entities extracted: ${allEntities.length}`);

  // ── Step 4: Blend AST + entity signals ───────────────────────────────────
  log('Step 4: Blending AST + entity confidence signals...');

  // Group by file; compute blend score = 0.6·ast_density + 0.4·entity_density
  const fileScores = new Map();
  for (const f of files) {
    const rel = path.relative(ROOT, f);
    const astCount  = fileFeatureMap.get(rel)?.length ?? 0;
    const entCount  = allEntities.filter(e => e.file === rel).length;
    const astDensity  = Math.min(astCount  / 20, 1.0);
    const entDensity  = Math.min(entCount  / 10, 1.0);
    const blend = parseFloat((0.6 * astDensity + 0.4 * entDensity).toFixed(4));
    if (blend > 0) fileScores.set(rel, { astCount, entCount, blend });
  }

  const topFiles = [...fileScores.entries()]
    .sort(([, a], [, b]) => b.blend - a.blend)
    .slice(0, 20);

  log(`  Top-20 files by blend score:${VERBOSE ? '' : ' (use --verbose to see all)'}`);
  for (const [file, score] of topFiles) {
    vlog(`    ${score.blend.toFixed(3)} | ast=${score.astCount} ent=${score.entCount} | ${file}`);
  }

  // ── Step 5: Gemma4 recommendations ───────────────────────────────────────
  log('Step 5: Gemma4 audit recommendations via llama-server...');
  let recommendations = [];

  if (USE_GEMMA4 && health.llama_server?.ok) {
    try {
      recommendations = await getGemma4Recommendations(
        allAstFeatures.slice(0, 50),
        allEntities.slice(0, 30),
        topFiles.map(([f]) => f),
      );
      log(`  Gemma4 returned ${recommendations.length} recommendations`);
    } catch (e) {
      log(`  Gemma4 call failed: ${e.message}`, 'warn');
    }
  } else if (!health.llama_server?.ok) {
    log(`  llama-server unavailable — generating mock recommendations`, 'warn');
  }

  // Fall back to structural recommendations based on AST analysis
  if (!recommendations.length) {
    const highComplexity = [...fileFeatureMap.entries()]
      .filter(([, fs]) => fs.length > 10)
      .map(([f]) => f);

    recommendations = [
      {
        title: 'Large function density in analysis layer',
        priority: 'high',
        category: 'refactor',
        affected_files: highComplexity.slice(0, 5),
        suggested_action: 'Review files with >10 AST features; split large modules; add complexity guards',
      },
      {
        title: 'LangExtract entity extraction not running on all files',
        priority: 'medium',
        category: 'retrieval',
        affected_files: [],
        suggested_action: 'Ensure llama-server :8090 is healthy; run npm run graphify:audit:gemma4',
      },
      {
        title: 'Missing HMM observation signals in error_signal_stream',
        priority: 'medium',
        category: 'schema',
        affected_files: ['sveltekit-frontend/src/lib/server/analysis/hmm-error-classifier.ts'],
        suggested_action: 'Populate error_signal_stream table; run atlas:phase8 pipeline to produce signals',
      },
    ];
    log(`  Using ${recommendations.length} structural recommendations (Gemma4 offline)`);
  }

  // ── Step 6: HMM classification of each recommendation ────────────────────
  log('Step 6: HMM Viterbi classification of recommendations...');
  const kanbanTasks = [];

  for (let i = 0; i < recommendations.length; i++) {
    const rec = recommendations[i];

    // Derive observations from recommendation text
    const sigText = [rec.title, rec.suggested_action, rec.category].join(' ');
    const obs = [normalizeObs(sigText)].filter(Boolean);

    // Also derive from affected files (check if they match known error patterns)
    for (const af of (rec.affected_files ?? [])) {
      const fileObs = normalizeObs(af);
      if (fileObs) obs.push(fileObs);
    }

    const hmmResult = hmmClassify(obs);

    // Attach blend signal from top-file scores
    const topFile = (rec.affected_files ?? [])[0];
    const blendSignal = topFile ? fileScores.get(topFile) : null;
    rec._astSignal    = blendSignal ? { astCount: blendSignal.astCount, file: topFile } : null;
    rec._entitySignal = allEntities.filter(e => topFile && e.file === topFile).slice(0, 3);
    rec._blendConfidence = blendSignal?.blend ?? null;

    const task = buildKanbanTask(rec, hmmResult, i);
    kanbanTasks.push(task);

    log(`  [${i + 1}] ${rec.priority?.toUpperCase() ?? 'MED'} | HMM:${hmmResult.state}(${hmmResult.confidence}) | ${rec.title?.slice(0, 60) ?? 'Untitled'}`);
  }

  // ── Step 7: Write output ──────────────────────────────────────────────────
  log('Step 7: Writing Kanban tasks...');

  const outBase = path.resolve(ROOT, OUTPUT_DIR);
  const outKanban = path.join(outBase, 'graphify-audit-kanban-tasks.json');
  const outSummary = path.join(outBase, 'graphify-audit-summary.json');

  const summary = {
    run_at: new Date().toISOString(),
    config: { DRY_RUN, USE_GEMMA4, LIMIT, llama_url: LLAMA_URL, model: GEMMA4_MODEL },
    health,
    stats: {
      files_scanned: files.length,
      ast_features: allAstFeatures.length,
      entities_extracted: allEntities.length,
      recommendations: recommendations.length,
      kanban_tasks: kanbanTasks.length,
      top_files: topFiles.map(([f, s]) => ({ file: f, blend: s.blend })),
    },
    hmm_distribution: Object.fromEntries(
      HMM_STATES.map(s => [s, kanbanTasks.filter(t => t.error_pattern === s).length])
    ),
    kanban_tasks: kanbanTasks,
  };

  fs.writeFileSync(outKanban,  JSON.stringify(kanbanTasks, null, 2));
  fs.writeFileSync(outSummary, JSON.stringify(summary, null, 2));
  log(`  Kanban tasks: ${outKanban}`);
  log(`  Summary:      ${outSummary}`);

  if (!DRY_RUN) {
    await persistKanbanTasks(kanbanTasks);
  } else {
    log('  DRY-RUN: Postgres write skipped');
  }

  // ── Final report ──────────────────────────────────────────────────────────
  log('');
  log('═══════════════════════════════════════════════════════════════');
  log('✓ Graphify Audit Complete');
  log(`  Files scanned:        ${files.length}`);
  log(`  AST features:         ${allAstFeatures.length}  (pseudo-reranker signal)`);
  log(`  LangExtract entities: ${allEntities.length}`);
  log(`  Recommendations:      ${recommendations.length}  (Gemma4 ${health.llama_server?.ok ? 'LIVE' : 'OFFLINE'})`);
  log(`  Kanban tasks written: ${kanbanTasks.length}  (HMM-classified → LangGraph queue)`);
  log(`  HMM distribution:`);
  for (const [s, n] of Object.entries(summary.hmm_distribution)) {
    if (n > 0) log(`    ${s}: ${n}`);
  }
  if (DRY_RUN) log(`  DRY-RUN: no Postgres writes`);
  log('═══════════════════════════════════════════════════════════════');
}

main().catch(e => {
  log(`Fatal: ${e.message}`, 'error');
  console.error(e);
  process.exit(1);
});
