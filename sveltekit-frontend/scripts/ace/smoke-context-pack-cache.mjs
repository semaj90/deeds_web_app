import fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const SNAPSHOT_DIR = path.resolve(ROOT, '.cache', 'ace', 'context-packs');
const REDIS_CONTAINER = process.env.REDIS_CONTAINER ?? process.env.DEEDS_REDIS_CONTAINER ?? 'legal-ai-valkey';

function buildAceContextCacheKey(contextId, version = 'v1') {
  return `ace:context:${contextId}:${version}`;
}

function runDocker(args) {
  return spawnSync('docker', args, { encoding: 'utf8', windowsHide: true });
}

async function readRedisJson(key) {
  const result = runDocker(['exec', REDIS_CONTAINER, 'redis-cli', 'GET', key]);
  if (result.status !== 0) return null;
  const raw = (result.stdout || '').trim();
  if (!raw || raw === '(nil)') return null;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

async function setRedisJson(key, value) {
  const result = runDocker(['exec', '-i', REDIS_CONTAINER, 'redis-cli', 'SET', key, JSON.stringify(value)]);
  if (result.status !== 0) {
    throw new Error((result.stderr || result.stdout || '').trim() || `Failed to set ${key}`);
  }
}

async function main() {
  await fs.mkdir(SNAPSHOT_DIR, { recursive: true });
  const cacheKey = buildAceContextCacheKey('smoke-context-pack', 'v1');
  const snapshotPath = path.join(SNAPSHOT_DIR, `${sanitizeCacheKey(cacheKey)}.json`);

  const tscManifest = await readRedisJson('code:ts:diag:manifest');
  const tscDiagnostics =
    tscManifest && typeof tscManifest === 'object'
      ? {
          errors: Number(tscManifest.total ?? 0),
          warnings: 0,
          rawOutputPath: 'redis://code:ts:diag:manifest',
        }
      : {
          errors: 0,
          warnings: 0,
          rawOutputPath: '',
        };

  const pack = {
    id: 'smoke-context-pack',
    contextId: 'smoke-context-pack',
    cacheKey,
    queryHash: 'smoke-query-hash',
    intent: 'smoke',
    coordinates: {
      clusterId: 'cluster_smoke',
      somRow: 1,
      somCol: 2,
      manifold4: [0.1, -0.2, 0.3, 0.4],
    },
    chunkIds: ['chunk:1', 'chunk:2'],
    summaryIds: ['summary:1'],
    sourceRefs: ['src/lib/server/cache/ace-context-pack-cache.ts'],
    graphPaths: ['file:src/lib/server/cache/ace-context-pack-cache.ts -> cache:ace'],
    featureMapPackets: [{ family: 'ace-cache', signal: 'smoke' }],
    wikiCards: [{ title: 'ACE Cache', score: 1 }],
    relationshipReports: [{ relation: 'uses', target: 'Redis' }],
    tscDiagnostics,
    turboVecCandidates: [{ id: 'turbovec:smoke', score: 0.99 }],
    retrievalTrace: { redisHit: false, qdrantHits: 1, degraded: false },
    toolPolicy: { allowed: ['rg', 'atlas.search'], forbidden: ['read_full_file'] },
    nextSteps: ['persist pointer', 'confirm snapshot'],
    degraded: false,
    snapshotUrl: `file://${snapshotPath}`,
    version: 'v1',
    createdAt: new Date().toISOString(),
    summary: 'Smoke test pack for ACE context pack cache',
    metadata: {
      typescriptDiagnostics: tscDiagnostics,
    },
    pointers: {
      seaweedPath: `file://${snapshotPath}`,
      nvmePath: `file://${snapshotPath}`,
    },
  };

  // Best-effort: compute a compact authority score from Karpathy Redis if available.
  try {
    const filePaths = (pack.chunkIds ?? []).map((id) => String(id)).filter(Boolean);
    if (filePaths.length) {
      // HMGET returns one value per key
      const args = [
        'exec',
        REDIS_CONTAINER,
        'redis-cli',
        'HMGET',
        'gpu:karpathy:scores',
        ...filePaths,
      ];
      const res = runDocker(args);
      if (res.status === 0) {
        const out = (res.stdout || '').trim();
        // redis-cli HMGET prints values separated by newlines; parse each line
        const lines = out
          .split(/\r?\n/)
          .map((l) => l.trim())
          .filter(Boolean);
        let sum = 0;
        let count = 0;
        for (const line of lines) {
          try {
            const parsed = JSON.parse(line);
            const a = parsed?.authority ?? parsed?.pr ?? parsed?.blend ?? null;
            const n = Number(a ?? null);
            if (Number.isFinite(n)) {
              const norm = n > 1 ? Math.min(1, n / 100) : Math.max(0, n);
              sum += norm;
              count++;
            }
          } catch {
            const n = Number(line);
            if (Number.isFinite(n)) {
              const norm = n > 1 ? Math.min(1, n / 100) : Math.max(0, n);
              sum += norm;
              count++;
            }
          }
        }
        // Always attach a best-effort authority number (0 if no scores found)
        const score = count > 0 ? sum / count : 0;
        pack.authority = { score, source: 'gpu' };
      }
    }
  } catch {
    // non-fatal
  }

  await fs.writeFile(snapshotPath, JSON.stringify(pack, null, 2), 'utf8');
  await setRedisJson(`ace:ctx:${cacheKey}`, pack);
  const redisReadback = await readRedisJson(`ace:ctx:${cacheKey}`);
  const redisOk = Boolean(redisReadback && redisReadback.cacheKey === cacheKey);
  const snapshotExists = await exists(snapshotPath);

  const report = {
    cacheKey,
    snapshotPath,
    snapshotExists,
    redisOk,
    tscDiagnostics,
  };

  console.log(JSON.stringify(report, null, 2));

  if (!snapshotExists || !redisOk) {
    process.exitCode = 1;
  }
}

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function sanitizeCacheKey(key) {
  return key.replace(/[:<>"/\\|?*]+/g, '_');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
