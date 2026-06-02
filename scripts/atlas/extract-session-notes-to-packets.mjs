#!/usr/bin/env node
/**
 * extract-session-notes-to-packets.mjs
 *
 * Reads session note files (docs/6_1_26/*.txt, root *.txt session logs) and
 * extracts lines matching given keyword patterns into structured JSON packets
 * aligned to the parent atlas schema:
 *   { sourceRef, featureId, title, summary, hits[], createdAt }
 *
 * Usage:
 *   node scripts/atlas/extract-session-notes-to-packets.mjs \
 *     --terms="turbovec,turbo3,turbo4,turboquant,turbo.quant" \
 *     --label="turbovec" \
 *     --out=docs/reports/packets/turbovec-session-packets.json
 *
 *   node scripts/atlas/extract-session-notes-to-packets.mjs \
 *     --terms="napi,n-api,tensorrt_bridge,libtorch,simd" \
 *     --label="napi" \
 *     --out=docs/reports/packets/napi-session-packets.json
 */
import { readFileSync, readdirSync, statSync, mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname, basename, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '../..');

// ── Args ──────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
function arg(name) {
  const a = args.find(a => a.startsWith(`--${name}=`));
  return a ? a.slice(name.length + 3) : null;
}

const TERMS_RAW = arg('terms') ?? 'turbovec,turbo3,turbo4,turboquant';
const LABEL = arg('label') ?? 'session-extract';
const OUT = arg('out') ?? `docs/reports/packets/${LABEL}-session-packets.json`;
const MAX_HITS_PER_FILE = parseInt(arg('max-per-file') ?? '200', 10);
const CONTEXT_LINES = parseInt(arg('context') ?? '0', 10);

const terms = TERMS_RAW.split(',').map(t => t.trim()).filter(Boolean);
const pattern = new RegExp(terms.join('|'), 'i');

// ── Feature ID inference from content ─────────────────────────────────────────
const FEATURE_PATTERNS = [
  [/turboquant|turbo[234]|kv.cache|ctk|ctv/i, 'turboquant-kv-cache'],
  [/n-?api|tensorrt_bridge|libtorch|cuda.*bridge/i, 'napi-gpu-bridge'],
  [/simd.?json|simdjson|fast.json/i, 'simdjson-bridge'],
  [/qdrant|vector.search|codebase_chunks/i, 'qdrant-vector-search'],
  [/semantic.packet|task_semantic|agent_pickup/i, 'task-semantic-packets'],
  [/karpathy|blend.score|pagerank/i, 'karpathy-authority-blend'],
  [/vlm|vision.model|mmproj/i, 'vlm-lane'],
  [/graphify|som.topology|hypergraph/i, 'graphify-pipeline'],
  [/parent.atlas|feature.atlas|sourceRef/i, 'parent-atlas'],
  [/drizzle|migration|schema.postgres/i, 'drizzle-schema'],
  [/redis|bifrost|cache.hit/i, 'redis-cache'],
  [/langfuse|inference.log|observability/i, 'langfuse-observability'],
];

function inferFeatureId(text) {
  for (const [re, id] of FEATURE_PATTERNS) {
    if (re.test(text)) return id;
  }
  return 'general';
}

// ── Session file discovery ────────────────────────────────────────────────────
const SESSION_DIRS = [
  resolve(REPO_ROOT, 'docs/6_1_26'),
  resolve(REPO_ROOT, 'docs'),
  resolve(REPO_ROOT),
].filter(d => existsSync(d));

function isSessionFile(filepath) {
  const b = basename(filepath);
  const ext = extname(b);
  if (!['.txt', '.md'].includes(ext)) return false;
  // Match patterns: 318_26.txt, 5_14_26__.txt, docs/6_1_26/*, nextsteps, etc.
  return /(\d{3,4}_26|\d+_\d+_26|6_1_26|nextstep|next_step|todo|roadmap)/i.test(b);
}

function* walkSessionFiles(dir, depth = 0) {
  if (depth > 3) return;
  let entries;
  try { entries = readdirSync(dir); } catch { return; }
  for (const entry of entries) {
    const full = resolve(dir, entry);
    let stat;
    try { stat = statSync(full); } catch { continue; }
    if (stat.isDirectory() && depth < 2 && !entry.startsWith('.') &&
        !['node_modules', 'deeds_labs', '.venv-py313-backup', 'claude-mem'].includes(entry)) {
      yield* walkSessionFiles(full, depth + 1);
    } else if (stat.isFile() && isSessionFile(full)) {
      yield full;
    }
  }
}

// ── Extract hits from a file ───────────────────────────────────────────────────
function extractHits(filepath) {
  let content;
  try {
    // Try UTF-8 first, fall back to latin1
    content = readFileSync(filepath, 'utf8');
  } catch {
    try { content = readFileSync(filepath, 'latin1'); } catch { return []; }
  }

  const lines = content.split('\n');
  const hits = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!pattern.test(line)) continue;
    if (hits.length >= MAX_HITS_PER_FILE) break;

    const contextBefore = CONTEXT_LINES > 0
      ? lines.slice(Math.max(0, i - CONTEXT_LINES), i).filter(l => l.trim())
      : [];
    const contextAfter = CONTEXT_LINES > 0
      ? lines.slice(i + 1, i + 1 + CONTEXT_LINES).filter(l => l.trim())
      : [];

    hits.push({
      lineNum: i + 1,
      text: line.trim().slice(0, 500),
      context: [...contextBefore, ...contextAfter].map(l => l.trim().slice(0, 200)),
      featureId: inferFeatureId(line),
    });
  }
  return hits;
}

// ── Build packets ─────────────────────────────────────────────────────────────
function buildPacket(filepath, hits) {
  const rel = filepath.replace(REPO_ROOT + '\\', '').replace(REPO_ROOT + '/', '').replace(/\\/g, '/');
  const b = basename(filepath, extname(filepath));

  // Extract date from filename e.g. 318_26 → 2026-03-18, 5_14_26 → 2026-05-14
  let sessionDate = null;
  const m = b.match(/(\d{1,2})_(\d{2})_?(\d{2})?/);
  if (m) {
    const [, a, b2, c] = m;
    if (c) {
      sessionDate = `2026-${String(a).padStart(2,'0')}-${String(b2).padStart(2,'0')}`;
    } else if (parseInt(a) <= 12) {
      sessionDate = `2026-${String(a).padStart(2,'0')}-${String(b2).padStart(2,'0')}`;
    }
  }

  // Group hits by featureId
  const byFeature = {};
  for (const hit of hits) {
    (byFeature[hit.featureId] ??= []).push(hit);
  }

  // Generate summary from first 3 hits
  const topTexts = hits.slice(0, 3).map(h => h.text).join(' | ');
  const summary = topTexts.slice(0, 300);

  return {
    id: `${LABEL}:${rel}`,
    sourceRef: rel,
    sessionDate,
    title: b.replace(/_/g, ' ').replace(/\b26\b/, '2026'),
    label: LABEL,
    terms,
    hitCount: hits.length,
    featureIds: [...new Set(hits.map(h => h.featureId))],
    summary,
    byFeature: Object.fromEntries(
      Object.entries(byFeature).map(([fid, fhits]) => [fid, fhits.map(h => ({
        lineNum: h.lineNum,
        text: h.text,
        context: h.context,
      }))])
    ),
    createdAt: new Date().toISOString(),
  };
}

// ── Main ──────────────────────────────────────────────────────────────────────
const discovered = new Set();
for (const dir of SESSION_DIRS) {
  for (const f of walkSessionFiles(dir)) {
    discovered.add(f);
  }
}

console.log(`[extract] Scanning ${discovered.size} session files for: ${terms.join(', ')}`);

const packets = [];
let totalHits = 0;

for (const filepath of [...discovered].sort()) {
  const hits = extractHits(filepath);
  if (!hits.length) continue;
  totalHits += hits.length;
  packets.push(buildPacket(filepath, hits));
}

// Sort by hitCount desc
packets.sort((a, b) => b.hitCount - a.hitCount);

console.log(`[extract] Found ${packets.length} files with matches, ${totalHits} total hits`);

// Write output
const outPath = resolve(REPO_ROOT, OUT);
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, JSON.stringify({ label: LABEL, terms, totalFiles: packets.length, totalHits, generatedAt: new Date().toISOString(), packets }, null, 2));
console.log(`[extract] Written → ${OUT} (${Math.round(statSync(outPath).size / 1024)} KB)`);

// Print top hits summary
console.log('\nTop files by hit count:');
packets.slice(0, 15).forEach(p => {
  console.log(`  ${p.hitCount.toString().padStart(4)}  ${p.sourceRef}  [${p.featureIds.join(', ')}]`);
});
