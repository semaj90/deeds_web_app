#!/usr/bin/env node
/**
 * purge-qdrant-noise.mjs
 *
 * Phase C of Parent Atlas cleanup: delete noise points from Qdrant
 * codebase_chunks_768 that were identified by audit-qdrant-noise.mjs.
 *
 * Safety gates (ALL must pass to proceed):
 *   1. --apply AND --confirm-noise-purge flags must both be present
 *   2. Noise percentage must be < 50% (refuses to delete majority of collection)
 *   3. No point from a safe prefix (src/, scripts/, tests/, drizzle/, etc.) is deleted
 *   4. Audit run must have completed (reads from qdrant-noise-audit.json, or re-scans)
 *
 * Usage:
 *   node scripts/atlas/purge-qdrant-noise.mjs              # dry-run (shows what would be deleted)
 *   node scripts/atlas/purge-qdrant-noise.mjs --apply --confirm-noise-purge   # actual purge
 *   node scripts/atlas/purge-qdrant-noise.mjs --batch-size=500   # override batch size (default 100)
 *
 * Output:
 *   memory/exports/qdrant-noise-purge.json
 *   memory/exports/qdrant-noise-purge.md
 *
 * Exit code: 0 = success (or dry-run complete), 1 = safety gate failed, 2 = Qdrant error
 */

import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(__dirname, '../..');

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const CONFIRMED = args.includes('--confirm-noise-purge');
const batchArg = args.find(a => a.startsWith('--batch-size='));
const BATCH_SIZE = batchArg ? parseInt(batchArg.split('=')[1], 10) : 100;

const QDRANT_URL = process.env.QDRANT_URL ?? 'http://localhost:6333';
const COLLECTION = 'codebase_chunks_768';

// ── Safety gate: require both flags for live run ──────────────────────────────

if (APPLY && !CONFIRMED) {
  console.error('[noise-purge] ERROR: --apply requires --confirm-noise-purge to prevent accidental deletes.');
  console.error('[noise-purge] Run: node scripts/atlas/purge-qdrant-noise.mjs --apply --confirm-noise-purge');
  process.exit(1);
}

if (APPLY) {
  console.log('[noise-purge] ⚠️  LIVE MODE — points will be deleted from Qdrant');
} else {
  console.log('[noise-purge] DRY-RUN — no points will be deleted');
}

// ── Noise patterns (must stay in sync with audit-qdrant-noise.mjs) ────────────

const NOISE_PATTERNS = [
  { pattern: '.venv/', label: 'python-virtualenv' },
  { pattern: 'node_modules/', label: 'node-modules' },
  { pattern: '.svelte-kit/', label: 'sveltekit-generated' },
  { pattern: '.vite/', label: 'vite-cache' },
  { pattern: 'dist/', label: 'dist-build' },
  { pattern: 'build/', label: 'build-output' },
  { pattern: 'coverage/', label: 'test-coverage' },
  { pattern: 'api-cleanup/', label: 'api-cleanup-stubs' },
  { pattern: 'backup/', label: 'backup-files' },
  { pattern: 'reports/', label: 'generated-reports' },
  { pattern: '__pycache__/', label: 'python-bytecache' },
  { pattern: 'site-packages/', label: 'python-site-packages' },
  { pattern: '.next/', label: 'nextjs-output' },
  { pattern: '.nuxt/', label: 'nuxtjs-output' },
  { pattern: '.output/', label: 'generic-build-output' },
  { pattern: 'granite-docling-', label: 'model-artifact-granite' },
  { pattern: 'models/embedding', label: 'model-artifact-embedding' },
  { pattern: 'turbovec/', label: 'turbovec-artifact' },
];

const SAFE_PREFIXES = [
  'src/',
  'scripts/',
  'tests/',
  'drizzle/',
  'static/',
  'docs/',
  'sveltekit-frontend/src/',
  'sveltekit-frontend/scripts/',
  'sveltekit-frontend/tests/',
  'sveltekit-frontend/static/',
];

const PATH_FIELDS = [
  'file_path', 'filePath', 'relativePath', 'relative_path',
  'path', 'stable_key', 'stableKey', 'sourceRef', 'source_ref',
];

function extractPath(payload) {
  if (!payload) return null;
  for (const f of PATH_FIELDS) {
    if (payload[f] && typeof payload[f] === 'string') return payload[f];
  }
  return null;
}

function classifyNoise(rawPath) {
  if (!rawPath) return { noisy: false, label: null };
  const p = rawPath.replace(/\\/g, '/').replace(/^[A-Z]:\//, '').replace(/^\/+/, '').toLowerCase();
  for (const safe of SAFE_PREFIXES) {
    if (p.startsWith(safe.toLowerCase())) return { noisy: false, label: null };
  }
  for (const { pattern, label } of NOISE_PATTERNS) {
    if (p.includes(pattern.toLowerCase())) return { noisy: true, label };
  }
  return { noisy: false, label: null };
}

// ── Check prior audit result for safety gate ──────────────────────────────────

const AUDIT_PATH = resolve(REPO, 'memory/exports/qdrant-noise-audit.json');
let priorAudit = null;
if (existsSync(AUDIT_PATH)) {
  try {
    priorAudit = JSON.parse(readFileSync(AUDIT_PATH, 'utf8'));
    console.log(`[noise-purge] Prior audit found: ${priorAudit.ts}`);
    if (!priorAudit.safe_to_purge) {
      console.error(`[noise-purge] SAFETY GATE: Prior audit blocked purge — ${priorAudit.purge_blocked_reason}`);
      process.exit(1);
    }
  } catch {
    console.warn('[noise-purge] Could not read prior audit — will re-scan');
  }
}

// ── Scroll and collect noisy point IDs ───────────────────────────────────────

console.log(`[noise-purge] Scanning ${COLLECTION} to collect noisy point IDs...`);

let total = 0;
let noisy = 0;
const noisyIds = [];
const noiseBuckets = {};
let offset = null;

try {
  while (true) {
    const body = { limit: 250, with_payload: true, with_vector: false };
    if (offset !== null) body.offset = offset;

    const res = await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points/scroll`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) throw new Error(`Qdrant scroll HTTP ${res.status}`);
    const data = await res.json();
    const points = data.result?.points ?? [];
    if (points.length === 0) break;

    for (const pt of points) {
      total++;
      const rawPath = extractPath(pt.payload);
      const { noisy: isNoisy, label } = classifyNoise(rawPath);
      if (isNoisy) {
        noisy++;
        noisyIds.push(pt.id);
        noiseBuckets[label] = (noiseBuckets[label] ?? 0) + 1;
      }
    }

    offset = data.result?.next_page_offset ?? null;
    if (total % 10000 === 0) {
      process.stdout.write(`  scanned=${total} noisy=${noisy}\r`);
    }
    if (offset === null) break;
  }
} catch (err) {
  console.error(`[noise-purge] Qdrant scan error: ${err.message}`);
  process.exit(2);
}

process.stdout.write('\n');
const noisePct = total > 0 ? noisy / total : 0;
console.log(`[noise-purge] Scan complete: ${total} total, ${noisy} noisy (${(noisePct * 100).toFixed(2)}%)`);

// ── Safety gate: refuse if >50% noisy ────────────────────────────────────────

if (noisePct >= 0.5) {
  console.error(`[noise-purge] SAFETY GATE BLOCKED: Noise is ${(noisePct * 100).toFixed(1)}% (>= 50%). Refusing purge.`);
  console.error('[noise-purge] This likely indicates a mis-classification. Review patterns in audit-qdrant-noise.mjs.');
  process.exit(1);
}

// ── Dry-run report ────────────────────────────────────────────────────────────

if (!APPLY) {
  console.log('\n[noise-purge] DRY-RUN summary:');
  for (const [label, count] of Object.entries(noiseBuckets).sort(([, a], [, b]) => b - a)) {
    console.log(`  ${label.padEnd(36)} ${count.toString().padStart(6)}`);
  }
  console.log(`\n  Would delete ${noisy.toLocaleString()} / ${total.toLocaleString()} points (${(noisePct * 100).toFixed(2)}%)`);
  console.log(`  ${(total - noisy).toLocaleString()} points would remain`);
  console.log('\n[noise-purge] To apply: node scripts/atlas/purge-qdrant-noise.mjs --apply --confirm-noise-purge');
  process.exit(0);
}

// ── Live purge ────────────────────────────────────────────────────────────────

console.log(`\n[noise-purge] Deleting ${noisy.toLocaleString()} points in batches of ${BATCH_SIZE}...`);

let deleted = 0;
let failed = 0;

for (let i = 0; i < noisyIds.length; i += BATCH_SIZE) {
  const batch = noisyIds.slice(i, i + BATCH_SIZE);
  try {
    const res = await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points/delete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ points: batch }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.error(`[noise-purge] Batch delete failed HTTP ${res.status}: ${body.slice(0, 200)}`);
      failed += batch.length;
    } else {
      deleted += batch.length;
    }
  } catch (err) {
    console.error(`[noise-purge] Batch delete error: ${err.message}`);
    failed += batch.length;
  }

  if ((i / BATCH_SIZE) % 10 === 0) {
    process.stdout.write(`  deleted=${deleted} failed=${failed}\r`);
  }
}

process.stdout.write('\n');

// ── Write output report ───────────────────────────────────────────────────────

const OUT_DIR = resolve(REPO, 'memory/exports');
mkdirSync(OUT_DIR, { recursive: true });
const ts = new Date().toISOString();

const reportJson = {
  ts,
  mode: APPLY ? 'APPLY' : 'DRY_RUN',
  collection: COLLECTION,
  totals_before: total,
  noisy_found: noisy,
  noisy_pct: `${(noisePct * 100).toFixed(2)}%`,
  deleted,
  failed,
  remaining: total - deleted,
  buckets: Object.entries(noiseBuckets)
    .sort(([, a], [, b]) => b - a)
    .map(([label, count]) => ({ label, count })),
};

writeFileSync(resolve(OUT_DIR, 'qdrant-noise-purge.json'), JSON.stringify(reportJson, null, 2) + '\n');

const mdLines = [
  `# Qdrant Noise Purge`,
  ``,
  `Generated: ${ts}`,
  `Mode: **${reportJson.mode}**`,
  ``,
  `## Results`,
  ``,
  `| Metric | Value |`,
  `|--------|-------|`,
  `| Points before purge | ${total.toLocaleString()} |`,
  `| Points deleted | ${deleted.toLocaleString()} |`,
  `| Points remaining | ${(total - deleted).toLocaleString()} |`,
  `| Failed deletes | ${failed.toLocaleString()} |`,
  `| Noise % | ${reportJson.noisy_pct} |`,
  ``,
  `## Deleted Buckets`,
  ``,
  `| Label | Count |`,
  `|-------|-------|`,
  ...reportJson.buckets.map(b => `| \`${b.label}\` | ${b.count.toLocaleString()} |`),
];

writeFileSync(resolve(OUT_DIR, 'qdrant-noise-purge.md'), mdLines.join('\n') + '\n');

console.log('\n═══════════════════════════════════════════════════════════════');
console.log(`  Deleted : ${deleted.toLocaleString()} / ${noisy.toLocaleString()} noisy points`);
console.log(`  Failed  : ${failed.toLocaleString()}`);
console.log(`  Remaining: ${(total - deleted).toLocaleString()} / ${total.toLocaleString()}`);
console.log('═══════════════════════════════════════════════════════════════');
console.log(`  Reports: memory/exports/qdrant-noise-purge.{json,md}`);
console.log('═══════════════════════════════════════════════════════════════');

process.exit(failed > 0 ? 2 : 0);
