#!/usr/bin/env node
/**
 * Graphify Health Reporter — writes docs/graph/graphify-health.json + .md
 *
 * Checks:
 *   - Redis: wiki note count, gemma4Summary coverage
 *   - Redis: BoW chunk tile count (texture:bow:chunk:*)
 *   - Redis: BoW cluster tile count (texture:bow:cluster:*)
 *   - Qdrant: glyph_atlas point count
 *   - Filesystem: docs/graph/codebase-graph.json stats
 *   - Filesystem: AGENTS.md mirror count (src/**\/AGENTS.md)
 *   - ACE smoke result (non-blocking WARN for offline server)
 *
 * Usage:
 *   node scripts/graphify-health.mjs
 *   node scripts/graphify-health.mjs --quiet   (suppress console, write files only)
 *   node scripts/graphify-health.mjs --json    (print JSON to stdout, no files)
 */

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'fs';
import { join, resolve } from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { loadRepoEnv, resolveRedisUrl } from '../../scripts/atlas/connection-config.mjs';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const ROOT = resolve(__dirname, '..');
const ENV = loadRepoEnv(process.env);

const REDIS_URL   = resolveRedisUrl(ENV);
const REDIS_PASSWORD = String(ENV.REDIS_PASSWORD ?? ENV.VALKEY_PASSWORD ?? '').trim() || undefined;
const QDRANT_URL  = ENV.QDRANT_URL  ?? 'http://localhost:6333';
const QUIET       = process.argv.includes('--quiet');
const JSON_ONLY   = process.argv.includes('--json');

function log(...args) { if (!QUIET && !JSON_ONLY) console.log(...args); }

function readJsonFile(filePath) {
  if (!existsSync(filePath)) return null;
  try {
    return JSON.parse(readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

async function readRedisJsonLike(redis, key) {
  const keyType = await redis.type(key).catch(() => 'none');
  if (keyType === 'string') return redis.get(key).catch(() => null);
  if (keyType === 'hash') {
    const hash = await redis.hGetAll(key).catch(() => null);
    return hash ? JSON.stringify(hash) : null;
  }
  return null;
}

// ── Redis checks ─────────────────────────────────────────────────────────────

async function redisStats(redis) {
  const wikiKeys  = await redis.keys('wiki:note:dir:*');
  let withSummary = 0;
  for (const k of wikiKeys) {
    const raw = await readRedisJsonLike(redis, k);
    if (!raw) continue;
    try {
      const note = JSON.parse(raw);
      if (note.gemma4Summary && note.gemma4Summary.length > 20) withSummary++;
    } catch { /* skip */ }
  }

  const bowChunkKeys   = await redis.keys('texture:bow:chunk:*');
  const bowClusterKeys = await redis.keys('texture:bow:cluster:*');

  const manifoldRaw = await readRedisJsonLike(redis, 'cluster:kmeans:k20:manifold4:all');
  const manifoldCount  = manifoldRaw ? JSON.parse(manifoldRaw).length : 0;
  // Check for various SOM grid key formats
  const somWeights     = (await redis.exists('som:weights')) || (await redis.exists('cluster:kmeans:k20:som:grid'));
  const autoencoderWeightsType = await redis.type('ace:autoencoder:weights');
  const autoencoderMetaType = await redis.type('ace:autoencoder:meta');
  const autoencoderEncodedType = await redis.type('gpu:karpathy:encoded');
  const autoencoderWeightsTrainedAt =
    autoencoderMetaType === 'hash' ? await redis.hGet('ace:autoencoder:meta', 'trainedAt') : null;
  const autoencoderCentroidsPresent = (await redis.exists('gpu:autoencoder:centroids_64_meta')) > 0;
  const autoencoderEncodedCount =
    autoencoderEncodedType === 'hash' ? await redis.hLen('gpu:karpathy:encoded') : 0;

  return {
    wikiNoteCount: wikiKeys.length,
    gemma4SummaryCount: withSummary,
    gemma4Coverage: wikiKeys.length > 0 ? Math.round((withSummary / wikiKeys.length) * 100) : 0,
    bowChunkTiles: bowChunkKeys.length,
    bowClusterTiles: bowClusterKeys.length,
    manifoldClusterCount: manifoldCount,
    somWeightsPresent: somWeights > 0,
    autoencoderWeightsType,
    autoencoderMetaType,
    autoencoderEncodedType,
    autoencoderWeightsTrainedAt,
    autoencoderCentroidsPresent,
    autoencoderEncodedCount,
    autoencoderReady:
      autoencoderWeightsType === 'hash' &&
      autoencoderMetaType === 'hash' &&
      autoencoderEncodedType === 'hash' &&
      Boolean(autoencoderWeightsTrainedAt) &&
      autoencoderCentroidsPresent &&
      autoencoderEncodedCount > 0,
  };
}

// ── Qdrant check ─────────────────────────────────────────────────────────────

async function qdrantStats() {
  try {
    const res = await fetch(`${QDRANT_URL}/collections/glyph_atlas`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return { glyphCount: 0, qdrantReachable: false };
    const info = await res.json();
    return {
      glyphCount:      info?.result?.points_count ?? 0,
      qdrantReachable: true,
    };
  } catch {
    return { glyphCount: 0, qdrantReachable: false };
  }
}

// ── Filesystem checks ─────────────────────────────────────────────────────────

function graphJsonStats() {
  const path = join(ROOT, 'docs/graph/codebase-graph.json');
  if (!existsSync(path)) return { exists: false, nodeCount: 0, edgeCount: 0, lastModified: null };
  try {
    const stat  = { mtime: new Date() };
    const graph = JSON.parse(readFileSync(path, 'utf-8'));
    return {
      exists:       true,
      nodeCount:    Array.isArray(graph.nodes) ? graph.nodes.length : 0,
      edgeCount:    Array.isArray(graph.edges) ? graph.edges.length : 0,
      lastModified: stat.mtime.toISOString(),
    };
  } catch {
    return { exists: true, nodeCount: 0, edgeCount: 0, lastModified: null };
  }
}

function agentsMdCount() {
  let count = 0;
  function walk(dir) {
    try {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules')
          walk(join(dir, entry.name));
        else if (entry.isFile() && entry.name === 'AGENTS.md')
          count++;
      }
    } catch { /* skip */ }
  }
  walk(join(ROOT, 'src'));
  return count;
}

// ── ACE smoke (lightweight, non-blocking) ────────────────────────────────────

// ── Atlas seed meta (A4 — Phase 11D) ────────────────────────────────────────

function readSeedMeta() {
  const metaPath = join(ROOT, '.tmp', 'atlas-cartridge-seed-meta.json');
  if (!existsSync(metaPath)) {
    return { seed_count: 0, seedGenerated: false, seedWarning: true, status: 'missing',
             areaBreakdown: {}, clusterBreakdown: {}, warning: 'seed meta not found — run atlas:cartridge-seed' };
  }
  try {
    return JSON.parse(readFileSync(metaPath, 'utf-8'));
  } catch {
    return { seed_count: 0, seedGenerated: false, seedWarning: true, status: 'parse_error',
             areaBreakdown: {}, clusterBreakdown: {}, warning: 'Failed to parse atlas-cartridge-seed-meta.json' };
  }
}

async function aceSmokeResult(redis, qdrantInfo) {
  // Quick Redis sanity
  let wikiKeys = [];
  try {
    wikiKeys = await redis.keys('wiki:note:dir:*');
  } catch {
    /* */
  }

  return {
    wikiNotesPresent: wikiKeys.length > 0,
    glyphAtlasPresent: qdrantInfo.glyphCount > 0,
    httpProbesSkipped: true, // requires running dev server
  };
}

// ── Atlas cartridge-seed stats ───────────────────────────────────────────────

function seedStats() {
  const metaPath = join(ROOT, '.tmp', 'atlas-cartridge-seed-meta.json');
  if (!existsSync(metaPath)) {
    return { seedCount: 0, seedStatus: 'not_run', seedGeneratedAt: null, seedWarning: null };
  }
  try {
    const meta = JSON.parse(readFileSync(metaPath, 'utf-8'));
    return {
      seedCount:       meta.seed_count      ?? 0,
      seedStatus:      meta.status          ?? 'unknown',
      seedGeneratedAt: meta.generatedAt     ?? null,
      seedWarning:     meta.warning         ?? null,
    };
  } catch {
    return { seedCount: 0, seedStatus: 'parse_error', seedGeneratedAt: null, seedWarning: 'Failed to parse seed meta JSON' };
  }
}

function graphifyStartupCache() {
  const candidates = [
    join(ROOT, '.tmp', 'graphify-daily-startup.json'),
    join(ROOT, 'logs', 'task-output', 'graphify-daily-startup.json'),
  ];
  for (const p of candidates) {
    const data = readJsonFile(p);
    if (data) {
      return {
        path: p,
        ...data,
      };
    }
  }
  return {
    path: null,
    generatedAt: null,
    status: 'missing',
    reason: 'missing',
    detail: 'graphify daily validation cache not found',
  };
}

// ── ts7 check ────────────────────────────────────────────────────────────────

function ts7Check() {
  try {
    // tsgo if available, else skip
    execSync('node --version', { timeout: 3000 });
    return { available: false, note: 'run npm run check:ts7 separately' };
  } catch {
    return { available: false, note: 'unavailable' };
  }
}

// ── Format markdown ──────────────────────────────────────────────────────────

function formatMd(h) {
  const coveragePct = h.gemma4Coverage + '%';
  const bowStatus   = h.bowChunkTiles > 0 ? '✅' : '⚠️';
  const glyphStatus = h.glyphCount > 0 ? '✅' : '⚠️';
  const wikiStatus  = h.wikiNoteCount > 0 ? '✅' : '❌';
  const graphStatus = h.graphNodeCount > 0 ? '✅' : '⚠️';
  const agentsStatus= h.agentsMdCount > 0 ? '✅' : '⚠️';
  const autoencoderStatus = h.autoencoderReady ? '✅' : '⚠️';
  const seedStatus = h.seedStatus === 'ok' ? '✅' : h.seedStatus === 'not_run' ? '⚠️' : '❌';
  const graphifyStatus = h.graphifyStartup?.status === 'complete'
    ? '✅'
    : h.graphifyStartup?.status === 'skipped'
      ? '⚠️'
      : h.graphifyStartup?.status === 'failed'
        ? '❌'
        : '⚠️';
  const autoencoderDetail = h.autoencoderReady
    ? `trainedAt=${h.autoencoderWeightsTrainedAt}, centroids=${h.autoencoderCentroidsPresent ? 'yes' : 'no'}, encoded=${h.autoencoderEncodedCount}`
    : `weightsType=${h.autoencoderWeightsType ?? 'unknown'}, encodedType=${h.autoencoderEncodedType ?? 'unknown'}, centroids=${h.autoencoderCentroidsPresent ? 'yes' : 'no'}`;

  return `# Graphify Health Report

*Generated: ${h.generatedAt}*

## Summary

| Metric | Value | Status |
|--------|-------|--------|
| Redis wiki notes | ${h.wikiNoteCount} | ${wikiStatus} |
| Gemma4 summaries | ${h.gemma4SummaryCount} / ${h.wikiNoteCount} (${coveragePct}) | ${h.gemma4Coverage >= 80 ? '✅' : h.gemma4Coverage >= 40 ? '⚠️' : '❌'} |
| BoW chunk tiles | ${h.bowChunkTiles} | ${bowStatus} |
| BoW cluster tiles | ${h.bowClusterTiles} | ${bowStatus} |
| Qdrant glyph_atlas | ${h.glyphCount} pts | ${glyphStatus} |
| Graph JSON nodes | ${h.graphNodeCount} | ${graphStatus} |
| Graph JSON edges | ${h.graphEdgeCount} | ${graphStatus} |
| AGENTS.md mirrors | ${h.agentsMdCount} | ${agentsStatus} |
| Manifold clusters | ${h.manifoldClusterCount} | ${h.manifoldClusterCount > 0 ? '✅' : '⚠️'} |
| SOM Weights | ${h.somWeightsPresent ? '✅' : '❌'} | ${h.somWeightsPresent ? '✅' : '❌'} |
| Autoencoder weights | ${autoencoderDetail} | ${autoencoderStatus} |
| Atlas seed count | ${h.seedCount} | ${h.seedGenerated ? '\u2705' : h.seedWarning ? '\u26a0\ufe0f' : '\u274c'} |
| Atlas seed status | ${h.seedStatus} | - |
| Graphify daily | ${h.graphifyStartup?.status ?? 'missing'} (${h.graphifyStartup?.reason ?? 'unknown'}) | ${graphifyStatus} |
${Object.keys(h.seedAreaBreakdown ?? {}).length > 0 ? `| Seed area breakdown | ${Object.entries(h.seedAreaBreakdown).map(([k,v]) => `${k}:${v}`).join(', ')} | - |\n` : ''}

## Graphify Tiers

| Tier | Command | Status |
|------|---------|--------|
| **Daily map** | \`npm run graphify:daily\` | ${h.wikiNoteCount > 100 ? '✅ populated' : '⚠️ run needed'} |
| **Semantic index** | \`npm run graphify:semantic\` | ${h.graphNodeCount > 0 ? '✅ indexed' : '⚠️ run needed'} |
| **GPU batch** | \`npm run graphify:batch-gpu-analysis\` | ${h.gemma4Coverage >= 80 ? '✅ complete' : `⚠️ ${h.gemma4Coverage}% done`} |
| **BoW tiles** | \`npm run graphify:bow-tiles:fast\` | ${h.bowChunkTiles > 100 ? '✅ built' : '⚠️ run needed'} |
| **ACE smoke** | \`npm run graphify:ace-smoke\` | ${h.aceSmokeWikiOk && h.aceSmokeGlyphOk ? '✅ pass' : '⚠️ partial'} |

## Recommendations

${h.graphifyStartup?.status === 'failed' ? `- ⚠️  Graphify failed due to ${h.graphifyStartup?.reason ?? 'unknown'} — refresh the graph after fixing the upstream cause\n` : ''}${h.graphifyStartup?.status === 'skipped' && h.graphifyStartup?.reason && h.graphifyStartup.reason !== 'cooldown' ? `- ⚠️  Graphify skipped because ${h.graphifyStartup.reason} — refresh the graph after the service/env issue is resolved\n` : ''}${h.gemma4Coverage < 80 ? `- ⚠️  Run \`npm run graphify:batch-gpu-analysis\` — only ${coveragePct} of wiki notes have Gemma4 summaries\n` : ''}${h.bowChunkTiles === 0 ? `- ⚠️  Run \`npm run graphify:bow-tiles:fast\` — no BoW tiles in Redis\n` : ''}${h.glyphCount === 0 ? `- ⚠️  Run \`npm run graphify:batch-gpu-analysis\` — glyph_atlas is empty\n` : ''}${h.agentsMdCount === 0 ? `- ⚠️  Run \`npm run graphify:agents-md\` — no AGENTS.md mirrors found\n` : ''}${h.gemma4Coverage >= 80 && h.bowChunkTiles > 100 && h.glyphCount > 0 ? `- ✅ All tiers healthy — no action needed\n` : ''}
${h.autoencoderReady ? '' : `- ⚠️  Run \`npm run graphify:autoencoder:train\` — autoencoder is still on Xavier placeholder weights\n`}
## Raw JSON

See \`docs/graph/graphify-health.json\` for machine-readable data.
`;
}

// ── Main ─────────────────────────────────────────────────────────────────────

let redis = null;
try {
  const redisMod = await import('redis');
  const createClient = redisMod.createClient ?? redisMod.default?.createClient;
  if (typeof createClient === 'function') {
    redis = createClient({ url: REDIS_URL, password: REDIS_PASSWORD });
    await redis.connect();
  } else if (!QUIET && !JSON_ONLY) {
    console.error('Redis client module unavailable — some metrics will be 0');
  }
} catch {
  if (!QUIET && !JSON_ONLY) console.error(`Cannot reach Redis at ${REDIS_URL} — some metrics will be 0`);
  redis = null;
}

log('Collecting graphify health metrics…');

const [rStats, qStats] = await Promise.all([
  redis
    ? redisStats(redis)
    : Promise.resolve({
        wikiNoteCount: 0,
        gemma4SummaryCount: 0,
        gemma4Coverage: 0,
        bowChunkTiles: 0,
        bowClusterTiles: 0,
        manifoldClusterCount: 0,
        somWeightsPresent: false,
        autoencoderWeightsType: 'none',
        autoencoderEncodedType: 'none',
        autoencoderWeightsTrainedAt: null,
        autoencoderCentroidsPresent: false,
        autoencoderEncodedCount: 0,
        autoencoderReady: false,
      }),
  qdrantStats(),
]);

const gStats  = graphJsonStats();
const aCount  = agentsMdCount();
const sStats  = seedStats();
const gStartup = graphifyStartupCache();
const smoke   = redis ? await aceSmokeResult(redis, qStats) : { wikiNotesPresent: false, glyphAtlasPresent: false, httpProbesSkipped: true };
const ts7     = ts7Check();

if (redis) await redis.quit().catch(() => {});

const health = {
  generatedAt: new Date().toISOString(),
  // Redis
  wikiNoteCount: rStats.wikiNoteCount,
  gemma4SummaryCount: rStats.gemma4SummaryCount,
  gemma4Coverage: rStats.gemma4Coverage,
  bowChunkTiles: rStats.bowChunkTiles,
  bowClusterTiles: rStats.bowClusterTiles,
  manifoldClusterCount: rStats.manifoldClusterCount,
  somWeightsPresent: rStats.somWeightsPresent,
  autoencoderWeightsType: rStats.autoencoderWeightsType,
  autoencoderEncodedType: rStats.autoencoderEncodedType,
  autoencoderWeightsTrainedAt: rStats.autoencoderWeightsTrainedAt,
  autoencoderCentroidsPresent: rStats.autoencoderCentroidsPresent,
  autoencoderEncodedCount: rStats.autoencoderEncodedCount,
  autoencoderReady: rStats.autoencoderReady,
  // Qdrant
  glyphCount: qStats.glyphCount,
  qdrantReachable: qStats.qdrantReachable,
  // Filesystem
  graphNodeCount: gStats.nodeCount,
  graphEdgeCount: gStats.edgeCount,
  graphLastModified: gStats.lastModified,
  agentsMdCount: aCount,
  // ACE smoke
  aceSmokeWikiOk: smoke.wikiNotesPresent,
  aceSmokeGlyphOk: smoke.glyphAtlasPresent,
  aceSmokeHttpSkipped: smoke.httpProbesSkipped,
  // Atlas cartridge seed
  seedCount:       sStats.seedCount,
  seedStatus:      sStats.seedStatus,
  seedGeneratedAt: sStats.seedGeneratedAt,
  seedWarning:     sStats.seedWarning,
  graphifyStartup:  gStartup,
  // ts7
  ts7Available: ts7.available,
  ts7Note: ts7.note,
};

if (JSON_ONLY) {
  console.log(JSON.stringify(health, null, 2));
  process.exit(0);
}

// Write JSON
const jsonPath = join(ROOT, 'docs/graph/graphify-health.json');
const mdPath   = join(ROOT, 'docs/graph/graphify-health.md');

writeFileSync(jsonPath, JSON.stringify(health, null, 2));
writeFileSync(mdPath, formatMd(health));

log('');
log('=== Graphify Health ===');
log(`  Wiki notes:      ${health.wikiNoteCount} (${health.gemma4Coverage}% with Gemma4 summaries)`);
log(`  BoW chunk tiles: ${health.bowChunkTiles}`);
log(`  BoW cluster:     ${health.bowClusterTiles}`);
log(`  Glyph atlas:     ${health.glyphCount} pts`);
log(`  Graph nodes:     ${health.graphNodeCount}`);
log(`  Manifold cls:    ${health.manifoldClusterCount} (SOM: ${health.somWeightsPresent ? 'OK' : 'MISSING'})`);
log(`  AGENTS.md files: ${health.agentsMdCount}`);
log('');
log(`  ✓ Wrote ${jsonPath}`);
log(`  ✓ Wrote ${mdPath}`);
log(`  Seed count:      ${health.seedCount} (${health.seedStatus})`);
if (health.seedMsgWarning) log(`  Seed warning:    ${health.seedMsgWarning}`);
log(`  Graphify daily:  ${health.graphifyStartup?.status ?? 'missing'} (${health.graphifyStartup?.reason ?? 'unknown'})`);
