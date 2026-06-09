#!/usr/bin/env node
/**
 * audit-qdrant-noise.mjs
 *
 * Phase B of Parent Atlas cleanup: dry-run scan of Qdrant codebase_chunks_768
 * to identify "noise" points — chunks derived from build artifacts, vendored
 * dependencies, temp dirs, and generated output that have no value in the
 * codebase intelligence index.
 *
 * Noise patterns (path must match ANY of these to be classified noisy):
 *   .venv/              Python virtualenv
 *   node_modules/       Node.js dependencies
 *   .svelte-kit/        SvelteKit generated output
 *   .vite/              Vite cache
 *   dist/               Build output
 *   build/              Build output
 *   coverage/           Test coverage reports
 *   api-cleanup/        Legacy API migration stubs
 *   backup/             Backup copies
 *   reports/            Generated report output
 *   __pycache__/        Python bytecode cache
 *   site-packages/      Python installed packages
 *   .next/              Next.js output
 *   .nuxt/              Nuxt.js output
 *   .output/            Generic build output
 *   granite-docling-*/  Model artifact directories
 *   models/embedding*/  Embedding model artifacts
 *   turbovec/           Turbovec model artifacts
 *
 * Safe paths (NEVER flagged as noisy, even if path contains a noise token):
 *   src/                Canonical source files
 *   scripts/            Project scripts
 *   tests/              Test files
 *   drizzle/            DB migrations
 *   static/             Static assets
 *   docs/               Documentation
 *   sveltekit-frontend/src/  Frontend source
 *
 * Usage:
 *   node scripts/atlas/audit-qdrant-noise.mjs
 *   node scripts/atlas/audit-qdrant-noise.mjs --verbose
 *   node scripts/atlas/audit-qdrant-noise.mjs --json
 *
 * Output:
 *   memory/exports/qdrant-noise-audit.json
 *   memory/exports/qdrant-noise-audit.md
 *
 * Exit code: 0 always (dry-run only — use purge-qdrant-noise.mjs to delete)
 */

import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync, writeFileSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(__dirname, '../..');

const args = process.argv.slice(2);
const VERBOSE = args.includes('--verbose');
const JSON_ONLY = args.includes('--json');

const QDRANT_URL = process.env.QDRANT_URL ?? 'http://localhost:6333';
const COLLECTION = 'codebase_chunks_768';

// ── Noise pattern definitions ─────────────────────────────────────────────────

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

// Paths that OVERRIDE noise classification — these are always safe
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

// Payload fields that may contain a path
const PATH_FIELDS = [
  'file_path', 'filePath', 'relativePath', 'relative_path',
  'path', 'stable_key', 'stableKey', 'sourceRef', 'source_ref',
];

// ── Classification helpers ────────────────────────────────────────────────────

function extractPath(payload) {
  if (!payload) return null;
  for (const f of PATH_FIELDS) {
    if (payload[f] && typeof payload[f] === 'string') return payload[f];
  }
  return null;
}

function classifyNoise(rawPath) {
  if (!rawPath) return { noisy: false, label: null };

  // Normalise separators, strip leading slashes/drive
  const p = rawPath.replace(/\\/g, '/').replace(/^[A-Z]:\//, '').replace(/^\/+/, '').toLowerCase();

  // Safe prefix check first
  for (const safe of SAFE_PREFIXES) {
    if (p.startsWith(safe.toLowerCase())) return { noisy: false, label: null };
  }

  // Noise pattern check
  for (const { pattern, label } of NOISE_PATTERNS) {
    if (p.includes(pattern.toLowerCase())) return { noisy: true, label };
  }

  return { noisy: false, label: null };
}

// ── Scroll Qdrant ─────────────────────────────────────────────────────────────

if (!JSON_ONLY) console.log(`[noise-audit] Scanning Qdrant ${COLLECTION} for noise points...\n`);

let total = 0;
let noisy = 0;
let noPath = 0;
const noiseBuckets = {}; // label → count
const noisySamples = {}; // label → first 5 paths
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

    if (!res.ok) {
      console.error(`[noise-audit] Qdrant scroll failed: HTTP ${res.status}`);
      break;
    }

    const data = await res.json();
    const points = data.result?.points ?? [];
    if (points.length === 0) break;

    for (const pt of points) {
      total++;
      const rawPath = extractPath(pt.payload);

      if (!rawPath) {
        noPath++;
        continue;
      }

      const { noisy: isNoisy, label } = classifyNoise(rawPath);
      if (isNoisy) {
        noisy++;
        noiseBuckets[label] = (noiseBuckets[label] ?? 0) + 1;
        if (!noisySamples[label]) noisySamples[label] = [];
        if (noisySamples[label].length < 5) noisySamples[label].push(rawPath);

        if (VERBOSE && !JSON_ONLY) {
          console.log(`  NOISY [${label}] ${rawPath}`);
        }
      }
    }

    offset = data.result?.next_page_offset ?? null;

    if (!JSON_ONLY && total % 10000 === 0) {
      process.stdout.write(`  scanned=${total} noisy=${noisy} (${((noisy / total) * 100).toFixed(1)}%)\r`);
    }

    if (offset === null) break;
  }
} catch (err) {
  console.error(`[noise-audit] Qdrant unavailable: ${err.message}`);
  process.exit(0); // Graceful — report as skipped
}

if (!JSON_ONLY) process.stdout.write('\n');

// ── Build results ─────────────────────────────────────────────────────────────

const noisePct = total > 0 ? noisy / total : 0;
const noPathPct = total > 0 ? noPath / total : 0;
const cleanPoints = total - noisy - noPath;

// Sort buckets by count desc
const sortedBuckets = Object.entries(noiseBuckets)
  .sort(([, a], [, b]) => b - a)
  .map(([label, count]) => ({
    label,
    count,
    pct: `${((count / total) * 100).toFixed(2)}%`,
    samples: noisySamples[label] ?? [],
  }));

const result = {
  ts: new Date().toISOString(),
  collection: COLLECTION,
  qdrant_url: QDRANT_URL,
  totals: {
    total,
    noisy,
    clean: cleanPoints,
    no_path: noPath,
    noise_pct: `${(noisePct * 100).toFixed(2)}%`,
    no_path_pct: `${(noPathPct * 100).toFixed(2)}%`,
  },
  safe_to_purge: noisePct < 0.5,
  purge_blocked_reason: noisePct >= 0.5 ? `Noise exceeds 50% (${(noisePct * 100).toFixed(1)}%) — refusing purge` : null,
  buckets: sortedBuckets,
  noise_patterns: NOISE_PATTERNS.map(n => n.pattern),
  safe_prefixes: SAFE_PREFIXES,
};

// ── Write output ──────────────────────────────────────────────────────────────

const OUT_DIR = resolve(REPO, 'memory/exports');
mkdirSync(OUT_DIR, { recursive: true });

writeFileSync(resolve(OUT_DIR, 'qdrant-noise-audit.json'), JSON.stringify(result, null, 2) + '\n');

// Markdown report
const mdLines = [
  `# Qdrant Noise Audit`,
  ``,
  `Generated: ${result.ts}`,
  `Collection: \`${COLLECTION}\``,
  ``,
  `## Summary`,
  ``,
  `| Metric | Count | % |`,
  `|--------|-------|---|`,
  `| Total points | ${total.toLocaleString()} | 100% |`,
  `| Noisy points | ${noisy.toLocaleString()} | ${result.totals.noise_pct} |`,
  `| Clean points | ${cleanPoints.toLocaleString()} | ${((cleanPoints / total) * 100).toFixed(2)}% |`,
  `| No-path points | ${noPath.toLocaleString()} | ${result.totals.no_path_pct} |`,
  ``,
  `**Safe to purge:** ${result.safe_to_purge ? '✅ Yes' : '❌ No'}`,
  result.purge_blocked_reason ? `**Blocked reason:** ${result.purge_blocked_reason}` : '',
  ``,
  `## Noise Buckets`,
  ``,
  `| Label | Count | % | Sample Paths |`,
  `|-------|-------|---|--------------|`,
  ...sortedBuckets.map(b =>
    `| \`${b.label}\` | ${b.count.toLocaleString()} | ${b.pct} | ${b.samples.slice(0, 2).map(s => `\`${s.slice(0, 60)}\``).join(', ')} |`
  ),
  ``,
  `## Purge Command`,
  ``,
  `\`\`\`bash`,
  `# Review the above, then run with both flags to actually purge:`,
  `node scripts/atlas/purge-qdrant-noise.mjs --apply --confirm-noise-purge`,
  `\`\`\``,
  ``,
  `## Noise Patterns Checked`,
  ``,
  ...NOISE_PATTERNS.map(n => `- \`${n.pattern}\` — ${n.label}`),
  ``,
  `## Safe Prefixes (Never Flagged)`,
  ``,
  ...SAFE_PREFIXES.map(s => `- \`${s}\``),
].filter(l => l !== undefined);

writeFileSync(resolve(OUT_DIR, 'qdrant-noise-audit.md'), mdLines.join('\n') + '\n');

// ── Console output ────────────────────────────────────────────────────────────

if (!JSON_ONLY) {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`  Collection : ${COLLECTION}`);
  console.log(`  Total      : ${total.toLocaleString()} points`);
  console.log(`  Noisy      : ${noisy.toLocaleString()} (${result.totals.noise_pct})`);
  console.log(`  Clean      : ${cleanPoints.toLocaleString()}`);
  console.log(`  No-path    : ${noPath.toLocaleString()} (${result.totals.no_path_pct})`);
  console.log('───────────────────────────────────────────────────────────────');
  for (const b of sortedBuckets) {
    console.log(`  ${b.label.padEnd(32)} ${b.count.toString().padStart(6)} (${b.pct})`);
  }
  console.log('───────────────────────────────────────────────────────────────');
  if (result.safe_to_purge) {
    console.log(`  ✅ Safe to purge — run with --apply --confirm-noise-purge`);
  } else {
    console.log(`  ❌ ${result.purge_blocked_reason}`);
  }
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`  Reports: memory/exports/qdrant-noise-audit.{json,md}`);
  console.log('═══════════════════════════════════════════════════════════════');
}

process.exit(0);
