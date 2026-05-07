#!/usr/bin/env node
/**
 * wire-synthesis-grpo.mjs
 *
 * Bridges synthesis_summary.json cluster risk scores → GRPO NES memory cartridge system.
 *
 * For each P0/P1 cluster in the latest synthesis run:
 *   1. Maps risk float (0-1) → NES riskLevel: ≥0.8 → critical, ≥0.5 → high, ≥0.3 → medium, else low
 *   2. Maps riskLevel → NES priority (0-255): critical → 255, high → 192, medium → 128, low → 64
 *   3. Updates Qdrant codebase_chunks_768 payload: grpo_reward + nes_risk_level + nes_priority
 *      (filters by neo4j_gpuCluster match OR som_cluster match)
 *   4. Writes Redis key nes:cluster_risk:{cluster_key} = JSON with 6h TTL
 *   5. Writes Redis key nes:grpo:last_wired = runId + timestamp
 *
 * Usage:
 *   node scripts/graph/wire-synthesis-grpo.mjs
 *   node scripts/graph/wire-synthesis-grpo.mjs --run-id=2026-05-07T15-56-22
 *   node scripts/graph/wire-synthesis-grpo.mjs --dry-run
 *
 * npm: "wire:synthesis:grpo": "node scripts/graph/wire-synthesis-grpo.mjs"
 */

import { readFile, readdir, writeFile } from 'node:fs/promises';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT        = resolve(__dirname, '../..');
const MEMORY_RUNS = resolve(ROOT, 'memory/runs');

const QDRANT_URL  = process.env.QDRANT_URL      ?? 'http://127.0.0.1:6333';
const REDIS_URL   = process.env.REDIS_URL       ?? 'redis://127.0.0.1:6379';
const REDIS_PASS  = process.env.REDIS_PASSWORD  ?? 'redis';

const DRY_RUN     = process.argv.includes('--dry-run');
const RUN_ID_ARG  = process.argv.find(a => a.startsWith('--run-id='))?.split('=')[1];

const COLLECTION  = 'codebase_chunks_768';
const NES_TTL_SEC = 6 * 3600; // 6 hours

// ── Risk mapping ──────────────────────────────────────────────────────────────

function riskToLevel(risk) {
  if (risk >= 0.8) return 'critical';
  if (risk >= 0.5) return 'high';
  if (risk >= 0.3) return 'medium';
  return 'low';
}

function levelToPriority(level) {
  switch (level) {
    case 'critical': return 255;
    case 'high':     return 192;
    case 'medium':   return 128;
    default:         return 64;
  }
}

// ── Latest run resolver ───────────────────────────────────────────────────────

async function resolveRunDir() {
  if (RUN_ID_ARG) {
    const dir = join(MEMORY_RUNS, RUN_ID_ARG);
    return dir;
  }
  const entries = (await readdir(MEMORY_RUNS, { withFileTypes: true }))
    .filter(e => e.isDirectory())
    .map(e => e.name)
    .sort()
    .reverse();
  if (!entries.length) throw new Error(`No run directories found in ${MEMORY_RUNS}`);
  // Find the most recent run dir that has synthesis_summary.json
  const { existsSync: exists } = await import('node:fs');
  for (const name of entries) {
    const candidate = join(MEMORY_RUNS, name, 'synthesis_summary.json');
    if (exists(candidate)) return join(MEMORY_RUNS, name);
  }
  throw new Error(`No run dir with synthesis_summary.json found in ${MEMORY_RUNS}`);
}

// ── Cluster key parsing ───────────────────────────────────────────────────────

// "cluster:gpu:6" → 6  |  "cluster:dir:foo" → null  |  6 → 6
function parseGpuClusterId(clusterKey) {
  if (typeof clusterKey === 'number') return clusterKey;
  const m = String(clusterKey).match(/cluster:gpu:(\d+)/);
  return m ? parseInt(m[1], 10) : null;
}

// Build a Qdrant filter that matches neo4j_gpuCluster (int) OR som_cluster (int)
// for gpu-style clusters, AND always includes a cluster_key string match as fallback.
function buildClusterFilter(clusterKey) {
  const gpuId = parseGpuClusterId(clusterKey);
  const conditions = [
    { key: 'cluster_key', match: { value: clusterKey } },
  ];
  if (gpuId !== null) {
    conditions.push({ key: 'neo4j_gpuCluster', match: { value: gpuId } });
    conditions.push({ key: 'som_cluster',       match: { value: gpuId } });
  }
  return { should: conditions };
}

// ── Qdrant helpers ────────────────────────────────────────────────────────────

async function qdrantSetPayload(filter, payload) {
  const url = `${QDRANT_URL}/collections/${COLLECTION}/points/payload`;
  const body = { payload, filter };
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Qdrant setPayload failed (${res.status}): ${text.slice(0, 200)}`);
  }
  return res.json();
}

async function qdrantCountByCluster(clusterKey) {
  const url = `${QDRANT_URL}/collections/${COLLECTION}/points/count`;
  const body = { filter: buildClusterFilter(clusterKey) };
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) return 0;
  const data = await res.json();
  return data?.result?.count ?? 0;
}

// ── Redis helper (raw TCP, no ioredis dep in plain mjs) ───────────────────────

let _redis = null;

async function getRedis() {
  if (_redis) return _redis;

  // Dynamic import so the script fails gracefully if ioredis isn't available
  let Redis;
  try {
    ({ default: Redis } = await import('ioredis'));
  } catch {
    throw new Error('ioredis not found — run `npm install` in sveltekit-frontend first');
  }

  _redis = new Redis(REDIS_URL, { password: REDIS_PASS, lazyConnect: true });
  _redis.on('error', () => {});
  await _redis.connect().catch(() => {});
  return _redis;
}

async function redisSetEx(key, ttl, value) {
  const redis = await getRedis();
  await redis.setex(key, ttl, typeof value === 'string' ? value : JSON.stringify(value));
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  // 1. Load synthesis_summary.json
  const runDir = await resolveRunDir();
  const summaryPath = join(runDir, 'synthesis_summary.json');
  let summary;
  try {
    summary = JSON.parse(await readFile(summaryPath, 'utf8'));
  } catch (err) {
    console.error(`✗ Cannot read ${summaryPath}: ${err.message}`);
    process.exit(1);
  }

  const runId  = summary.runId ?? 'unknown';
  const p0     = summary.p0 ?? [];
  const p1     = summary.p1 ?? [];
  const allClusters = [...p0, ...p1];

  console.log(`\n[wire-synthesis-grpo] Run: ${runId}`);
  console.log(`  Clusters to wire: ${allClusters.length} (P0: ${p0.length}, P1: ${p1.length})`);
  if (DRY_RUN) console.log('  --dry-run: Qdrant + Redis writes SKIPPED\n');

  if (!allClusters.length) {
    console.log('  No clusters found — nothing to wire.');
    process.exit(0);
  }

  // 2a. Load tsgo diagnostics for per-file diag counts
  const tsgoPath = resolve(ROOT, 'scratch/audits/tsgo-diagnostics.json');
  let tsgoByFile = {};
  try {
    const raw = JSON.parse(await readFile(tsgoPath, 'utf8'));
    const diags = Array.isArray(raw) ? raw : (raw.diagnostics ?? []);
    for (const d of diags) {
      const fp = d.file_path || d.file;
      if (fp) tsgoByFile[fp] = (tsgoByFile[fp] ?? 0) + 1;
    }
  } catch { /* tsgo report absent */ }

  const hasTsgo = Object.keys(tsgoByFile).length > 0;
  if (hasTsgo) console.log(`  tsgo diagnostics loaded: ${Object.keys(tsgoByFile).length} files with errors`);

  // 2b. Build file → clusterKey map from graph_nodes.json for accurate per-cluster tsgo7 counts
  //     topFiles only covers 5 files — this covers all files in the cluster
  const nodesPath = join(runDir, 'graph_nodes.json');
  const fileToCluster = {};
  try {
    const nodes = JSON.parse(await readFile(nodesPath, 'utf8'));
    for (const n of nodes) {
      const fp = n.file_path || n.filePath || n.path || '';
      const ck = n.clusterKey || n.cluster_key || n.neo4j_gpuCluster;
      if (fp && ck) fileToCluster[fp] = String(ck);
    }
  } catch { /* graph_nodes.json absent — fall back to topFiles only */ }

  // 3. Process each cluster
  const results = [];
  for (const entry of allClusters) {
    const clusterKey  = entry.cluster;
    const risk        = typeof entry.risk === 'number' ? entry.risk : 0;
    const tier        = p0.includes(entry) ? 'P0' : 'P1';
    const riskLevel   = riskToLevel(risk);
    const priority    = levelToPriority(riskLevel);

    // tsgo7 diag count: sum diagnostics for ALL files in this cluster
    // Uses graph_nodes.json file→cluster map when available; falls back to topFiles only
    const topFiles = entry.topFiles ?? [];
    let tsgo7Diags;
    if (hasTsgo && Object.keys(fileToCluster).length > 0) {
      // Count all error files whose cluster matches this clusterKey (or numeric gpuId)
      const gpuId = parseGpuClusterId(clusterKey);
      tsgo7Diags = 0;
      for (const [fp, diagCount] of Object.entries(tsgoByFile)) {
        const fc = fileToCluster[fp];
        if (fc === clusterKey || (gpuId !== null && fc === String(gpuId))) {
          tsgo7Diags += diagCount;
        }
      }
    } else {
      // Fallback: topFiles only (may undercount)
      tsgo7Diags = hasTsgo
        ? topFiles.reduce((sum, f) => sum + (tsgoByFile[f] ?? 0), 0)
        : (entry.diagCount ?? 0);
    }

    console.log(`  ${tier} ${clusterKey}  risk=${risk.toFixed(3)}  tsgo7=${tsgo7Diags}  → ${riskLevel} (priority ${priority})`);

    const nesPayload = {
      grpo_reward:    risk,
      nes_risk_level: riskLevel,
      nes_priority:   priority,
      tsgo7_diags:    tsgo7Diags,
    };

    const nesRedisValue = {
      clusterKey,
      risk,
      riskLevel,
      priority,
      tier,
      runId,
      // tsgo7 (TypeScript 7 native compiler) diagnostics for top files in this cluster
      tsgo7Diags,
      diagCount:    entry.diagCount    ?? 0,
      shallowCount: entry.shallowCount ?? 0,
      protocols:    entry.protocols    ?? [],
      topFiles,
      wiredAt: new Date().toISOString(),
    };

    if (!DRY_RUN) {
      // 2a. Count matching Qdrant points (informational)
      const count = await qdrantCountByCluster(clusterKey).catch(() => -1);

      // 2b. Update Qdrant payload for all matching chunks
      await qdrantSetPayload(buildClusterFilter(clusterKey), nesPayload);

      // 2c. Write Redis NES risk key (6h TTL)
      const redisKey = `nes:cluster_risk:${clusterKey}`;
      await redisSetEx(redisKey, NES_TTL_SEC, nesRedisValue);

      results.push({ clusterKey, riskLevel, priority, tsgo7Diags, qdrantCount: count });
      console.log(`    ✓ Qdrant chunks updated: ${count >= 0 ? count : 'unknown'}`);
      console.log(`    ✓ Redis ${redisKey} set (TTL ${NES_TTL_SEC}s)`);
    } else {
      results.push({ clusterKey, riskLevel, priority, tsgo7Diags, qdrantCount: '(dry-run)' });
      console.log(`    (dry-run) would update Qdrant + Redis`);
    }
  }

  // 3. Write last-wired marker to Redis
  if (!DRY_RUN) {
    await redisSetEx('nes:grpo:last_wired', NES_TTL_SEC, {
      runId,
      clustersWired: results.length,
      wiredAt: new Date().toISOString(),
    });
    console.log(`\n  ✓ nes:grpo:last_wired set`);
  }

  // 4. Summary
  console.log('\n── Summary ────────────────────────────────────────────────────');
  for (const r of results) {
    const countStr = typeof r.qdrantCount === 'number' ? `${r.qdrantCount} chunks` : r.qdrantCount;
    console.log(`  ${r.clusterKey}  → ${r.riskLevel} (${r.priority})  tsgo7=${r.tsgo7Diags}  ${countStr}`);
  }

  const critical = results.filter(r => r.riskLevel === 'critical').length;
  const high     = results.filter(r => r.riskLevel === 'high').length;
  const medium   = results.filter(r => r.riskLevel === 'medium').length;
  const low      = results.filter(r => r.riskLevel === 'low').length;
  console.log(`\n  critical:${critical}  high:${high}  medium:${medium}  low:${low}`);
  console.log(`\n${DRY_RUN ? '✓ Dry run complete (no writes)' : '✓ Wire complete'}`);

  // 5. Write synthesis_grpo_wiring.json artifact to the run directory
  const artifact = {
    runId,
    wiredAt: new Date().toISOString(),
    dryRun: DRY_RUN,
    clusterCount: results.length,
    summary: { critical, high, medium, low },
    clusters: results,
  };
  const artifactPath = join(await resolveRunDir(), 'synthesis_grpo_wiring.json');
  await writeFile(artifactPath, JSON.stringify(artifact, null, 2), 'utf8');
  console.log(`  ✓ Artifact: ${artifactPath}`);

  const redis = await getRedis().catch(() => null);
  if (redis) redis.quit().catch(() => {});
}

main().catch(err => {
  console.error('✗ Fatal:', err.message);
  process.exit(1);
});
