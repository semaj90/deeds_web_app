#!/usr/bin/env node
/**
 * run-authority-scores.mjs
 *
 * Standalone runner — reads PageRank + Louvain community from Neo4j and
 * patches graphAuthorityScore onto codebase_chunks_768 Qdrant payloads.
 *
 * Inlines the logic from neo4j-gds.ts so it runs without the SvelteKit
 * compile pipeline.
 *
 * Usage:
 *   node scripts/run-authority-scores.mjs
 *   node scripts/run-authority-scores.mjs --dry-run
 *   node scripts/run-authority-scores.mjs --limit=2000
 *
 * Environment (from .env):
 *   QDRANT_URL       — default http://127.0.0.1:6333
 *   NEO4J_URI        — default bolt://localhost:7687
 *   NEO4J_USER       — default neo4j
 *   NEO4J_PASSWORD   — default deeds123
 */

import { resolve, dirname, join } from 'node:path';
import { mkdirSync, writeFileSync, readdirSync, existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const args = process.argv.slice(2);
const dryRun  = args.includes('--dry-run');
const limitArg = args.find(a => a.startsWith('--limit='));
const limit    = limitArg ? parseInt(limitArg.slice(8), 10) : 5000;

// Load .env for credentials
try {
  const { config } = await import('dotenv');
  config({ path: resolve(__dirname, '../.env') });
} catch { /* dotenv optional */ }

const QDRANT_URL    = process.env.QDRANT_URL       ?? 'http://127.0.0.1:6333';
const NEO4J_URI     = process.env.NEO4J_URI        ?? 'bolt://localhost:7687';
const NEO4J_USER    = process.env.NEO4J_USER       ?? 'neo4j';
const NEO4J_PASS    = process.env.NEO4J_PASSWORD   ?? 'deeds123';
const COLLECTION    = 'codebase_chunks_768';

console.log(`[authority] limit=${limit}${dryRun ? '  DRY RUN' : ''}`);
console.log(`[authority] Neo4j: ${NEO4J_URI}  Qdrant: ${QDRANT_URL}`);

// ── 1. Query Neo4j for top PageRank nodes ─────────────────────────────────────

let neo4j;
try {
  const { default: neo4jPkg } = await import('neo4j-driver');
  neo4j = neo4jPkg;
} catch {
  console.error('[authority] ✗ neo4j-driver not installed. Run: npm install neo4j-driver');
  process.exit(1);
}

const driver  = neo4j.driver(NEO4J_URI, neo4j.auth.basic(NEO4J_USER, NEO4J_PASS));
const session = driver.session();

let nodes = [];
try {
  const result = await session.run(
    `MATCH (n)
     WHERE (n.graphPageRank IS NOT NULL OR n.graphAuthorityScore IS NOT NULL)
       AND (n.stableKey IS NOT NULL OR n.filePath IS NOT NULL)
     RETURN coalesce(n.stableKey, n.filePath) AS stableKey,
            coalesce(n.graphPageRank, n.graphAuthorityScore) AS graphPageRank,
            coalesce(n.louvainCommunity, n.communityId) AS louvainCommunity
     ORDER BY coalesce(n.graphPageRank, n.graphAuthorityScore) DESC
     LIMIT $limit`,
    { limit: neo4j.int(limit) }
  );

  nodes = result.records.map(r => ({
    stableKey:        r.get('stableKey'),
    graphPageRank:    r.get('graphPageRank'),
    louvainCommunity: r.get('louvainCommunity') ?? undefined,
  }));
  console.log(`[authority] Neo4j: ${nodes.length} nodes with PageRank`);
} catch (err) {
  console.error('[authority] ✗ Neo4j query failed:', err.message);
  process.exit(1);
} finally {
  await session.close();
  await driver.close();
}

if (nodes.length === 0) {
  console.log('[authority] No scored nodes — run graphify:batch to compute PageRank first.');
  process.exit(0);
}

// ── 2. Build stableKey → composite authority score ────────────────────────────

const maxPR = Math.max(...nodes.map(n => n.graphPageRank), 1e-9);
const scoreMap = new Map();
for (const node of nodes) {
  const normPR     = node.graphPageRank / maxPR;
  const commBoost  = node.louvainCommunity !== undefined ? 0.1 : 0;
  scoreMap.set(node.stableKey, Math.min(normPR * 0.7 + commBoost * 0.3, 1));
}

if (dryRun) {
  const sample = [...scoreMap.entries()].slice(0, 3);
  console.log('[authority] DRY RUN — sample scores:');
  for (const [k, v] of sample) console.log(`  ${k}  →  ${v.toFixed(4)}`);
  console.log(`[authority] Would patch up to ${scoreMap.size} Qdrant payloads.`);
  process.exit(0);
}

// ── 3. Scroll Qdrant and patch matching payloads ──────────────────────────────

let mirrored = 0;
let offset   = undefined;
const BATCH  = 100;
const t0     = Date.now();

while (true) {
  const scrollBody = JSON.stringify({
    limit: BATCH,
    with_payload: ['stable_key', 'relativePath', 'file_path'],
    with_vector:  false,
    ...(offset != null ? { offset } : {}),
  });

  const scrollRes = await fetch(
    `${QDRANT_URL}/collections/${COLLECTION}/points/scroll`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: scrollBody }
  ).catch(() => null);

  if (!scrollRes?.ok) {
    console.error(`[authority] Qdrant scroll failed (${scrollRes?.status ?? 'network error'})`);
    break;
  }

  const data = await scrollRes.json();
  const pts  = data.result?.points ?? [];
  if (pts.length === 0) break;

  for (const pt of pts) {
    // Try stable_key first, then relativePath stripped of leading src/, then file_path
    const rawKey = pt.payload?.stable_key
      ?? pt.payload?.relativePath
      ?? pt.payload?.file_path;
    if (!rawKey) continue;
    // Normalize: strip leading 'src/' so 'src/lib/...' matches 'lib/...'
    const sk = rawKey.replace(/^src\//, '');
    if (!scoreMap.has(sk)) continue;

    await fetch(
      `${QDRANT_URL}/collections/${COLLECTION}/points/payload`,
      {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ payload: { graphAuthorityScore: scoreMap.get(sk) }, points: [pt.id] }),
      }
    ).catch(() => {});
    mirrored++;
  }

  offset = data.result?.next_page_offset ?? null;
  if (!offset || pts.length < BATCH) break;
}

const dur = Date.now() - t0;
console.log(`[authority] ✓ Mirrored ${mirrored} authority scores in ${dur}ms`);

// ── 4. Write authority_scores.json into latest run dir that has graph_nodes.json ─

const MEMORY_RUNS = resolve(__dirname, '..', 'memory', 'runs');
const nowStr = new Date().toISOString();

// Prefer a run dir that already contains graph_nodes.json (synthesis-ready)
let selectedRunId = null;
let selectedRunDir = null;
try {
  const allDirs = readdirSync(MEMORY_RUNS).sort().reverse();
  for (const d of allDirs) {
    const dir = join(MEMORY_RUNS, d);
    if (existsSync(join(dir, 'graph_nodes.json'))) {
      selectedRunId  = d;
      selectedRunDir = dir;
      break;
    }
  }
} catch { /* MEMORY_RUNS doesn't exist yet */ }

// Fallback: create a new run dir
if (!selectedRunDir) {
  selectedRunId  = nowStr.slice(0, 19).replace(/[:T]/g, '-');
  selectedRunDir = join(MEMORY_RUNS, selectedRunId);
  console.log(`[authority] No existing run dir with graph_nodes.json — creating ${selectedRunId}`);
} else {
  console.log(`[authority] Writing into existing run dir: ${selectedRunId}`);
}

try {
  mkdirSync(selectedRunDir, { recursive: true });
  const artifact = {
    runId:         selectedRunId,
    writtenAt:     nowStr,
    nodesScored:   nodes.length,
    nodesMirrored: mirrored,
    durationMs:    dur,
    collection:    COLLECTION,
    neo4jUri:      NEO4J_URI,
    qdrantUrl:     QDRANT_URL,
    selectedRunDir,
    topScores: [...scoreMap.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([stableKey, score]) => ({ stableKey, score })),
  };
  writeFileSync(join(selectedRunDir, 'authority_scores.json'), JSON.stringify(artifact, null, 2));
  console.log(`[authority] Artifact → memory/runs/${selectedRunId}/authority_scores.json`);

  // P2: authority_pipeline_trace.json — cross-stage audit trail
  try {
    const gdsLatestPath = resolve(__dirname, '..', 'memory', 'graphify', 'gds', 'latest.json');
    const gdsLatest = existsSync(gdsLatestPath) ? JSON.parse(readFileSync(gdsLatestPath, 'utf8')) : null;

    const tsgoPath = resolve(__dirname, '..', 'scratch', 'audits', 'tsgo-diagnostics.json');
    let tsgoErrorCount = 0;
    if (existsSync(tsgoPath)) {
      try {
        const tsgoRaw = JSON.parse(readFileSync(tsgoPath, 'utf8'));
        const tsgoList = tsgoRaw.diagnostics ?? tsgoRaw;
        tsgoErrorCount = Array.isArray(tsgoList) ? tsgoList.length : 0;
      } catch { /* non-fatal */ }
    }

    const trace = {
      traceWrittenAt:      nowStr,
      selectedAuthorityRunDir: selectedRunDir,
      gdsVersion:          gdsLatest?.gdsAvailable ? 'available' : 'unavailable',
      pagerankNodes:       gdsLatest?.pagerankRows ?? 0,
      authorityNodes:      scoreMap.size,
      allAuthoritiesCount: gdsLatest?.allAuthorities?.length ?? gdsLatest?.topAuthorities?.length ?? 0,
      tsgoErrorCount,
      clustersWithAuthority: 0,  // TODO: populated by synthesize-next-actions after synthesis
      qdrantDryRunMatches:   mirrored,
      errors:              [],
    };
    writeFileSync(join(selectedRunDir, 'authority_pipeline_trace.json'), JSON.stringify(trace, null, 2));
    console.log(`[authority] Trace  → memory/runs/${selectedRunId}/authority_pipeline_trace.json`);
  } catch { /* non-fatal */ }
} catch { /* non-fatal */ }