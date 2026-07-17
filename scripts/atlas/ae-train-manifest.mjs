#!/usr/bin/env node
/**
 * scripts/atlas/ae-train-manifest.mjs
 *
 * Manifest generator for the AE train control plane.
 *
 * Reads docs/atlas/feature-registry.json, resolves Qdrant point IDs
 * for each source-ref, builds a topologically ordered compression deque
 * queue, and emits:
 *   docs/reports/ae-train-manifest.json  (machine-readable)
 *   docs/reports/ae-train-manifest.md    (human-readable summary)
 *
 * Usage:
 *   node scripts/atlas/ae-train-manifest.mjs               (generate)
 *   node scripts/atlas/ae-train-manifest.mjs --dry-run     (validate only)
 *   node scripts/atlas/ae-train-manifest.mjs --limit 50    (cap at 50 entries)
 *   node scripts/atlas/ae-train-manifest.mjs --ae-version 1.0.1
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '../..');

// ── Import contract ───────────────────────────────────────────────────────────
const { CONTRACT_VERSION, validateManifest } = await import(
  './lib/ae-train-contract.mjs'
);

// ── Config ────────────────────────────────────────────────────────────────────
const QDRANT_URL       = process.env.QDRANT_URL       ?? 'http://localhost:6333';
const COLLECTION       = 'codebase_chunks_768';
const EMBED_DIM        = 768;
const TARGET_DIM       = 64;
const REGISTRY_PATH    = resolve(REPO_ROOT, 'docs/atlas/feature-registry.json');
const REPORTS_DIR      = resolve(REPO_ROOT, 'docs/reports');
const MANIFEST_PATH    = resolve(REPORTS_DIR, 'ae-train-manifest.json');
const MANIFEST_MD_PATH = resolve(REPORTS_DIR, 'ae-train-manifest.md');

const args        = process.argv.slice(2);
const DRY_RUN     = args.includes('--dry-run');
const VERBOSE     = args.includes('--verbose');
const LIMIT       = (() => {
  const idx = args.indexOf('--limit');
  return idx >= 0 ? parseInt(args[idx + 1], 10) : Infinity;
})();
const AE_VERSION  = (() => {
  const idx = args.indexOf('--ae-version');
  return idx >= 0 ? args[idx + 1] : '1.0.0';
})();

const log  = (...a) => console.log(...a);
const vlog = (...a) => { if (VERBOSE) console.log(...a); };

// ── Feature-registry loader ───────────────────────────────────────────────────

function loadRegistry() {
  if (!existsSync(REGISTRY_PATH)) {
    throw new Error(`feature-registry.json not found at ${REGISTRY_PATH}`);
  }
  const raw = readFileSync(REGISTRY_PATH, 'utf8');
  const entries = JSON.parse(raw);
  if (!Array.isArray(entries)) {
    throw new Error('feature-registry.json must be a JSON array');
  }
  log(`[manifest] loaded ${entries.length} entries from feature-registry.json`);
  return entries;
}

// ── Source-ref → Qdrant point resolution ─────────────────────────────────────
// Scroll Qdrant codebase_chunks_768 filtering by source_ref payload field.

async function resolveQdrantPoint(sourceRef) {
  // Strip local: prefix and anchor
  const cleanRef = sourceRef.replace(/^local:/, '').replace(/#.*$/, '');

  const body = JSON.stringify({
    filter: {
      must: [{ key: 'source_ref', match: { value: cleanRef } }],
    },
    limit: 1,
    with_payload: false,
    with_vector: false,
  });

  const res = await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points/scroll`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
    signal:  AbortSignal.timeout(10_000),
  });

  if (!res.ok) return null;

  const data = await res.json();
  const points = data?.result?.points ?? [];
  return points[0]?.id ?? null;
}

// ── Priority scoring ──────────────────────────────────────────────────────────
// Higher priority = train first.  Rules (additive):
//   +40  status === 'implemented'
//   +20  has sourceRefs
//   +20  missing.length === 0
//   +10  featureKey contains 'embedding' | 'vector' | 'ae' | 'autoencoder'
//   +10  has resolved Qdrant point

function scorePriority(entry, hasQdrantPoint) {
  let score = 0;
  if (entry.status === 'implemented') score += 40;
  if (Array.isArray(entry.sourceRefs) && entry.sourceRefs.length > 0) score += 20;
  if (Array.isArray(entry.missing) && entry.missing.length === 0) score += 20;
  const key = (entry.featureKey ?? '').toLowerCase();
  if (/embedding|vector|ae|autoencoder|latent/.test(key)) score += 10;
  if (hasQdrantPoint) score += 10;
  return Math.min(score, 100);
}

// ── Topological deque ordering ────────────────────────────────────────────────
// Sort by priority DESC, then featureKey ASC for determinism.

function buildDeque(entries) {
  return [...entries].sort((a, b) => {
    if (b.priority !== a.priority) return b.priority - a.priority;
    return (a.packet_key ?? '').localeCompare(b.packet_key ?? '');
  });
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  log(`[manifest] AE train manifest generator  contract=${CONTRACT_VERSION}`);
  log(`[manifest] dry_run=${DRY_RUN}  ae_version=${AE_VERSION}  limit=${LIMIT}`);

  const registry = loadRegistry();

  // Apply limit
  const candidates = LIMIT === Infinity ? registry : registry.slice(0, LIMIT);

  // Build manifest entries by resolving Qdrant points
  const records    = [];
  const queueRaw   = [];
  const errors     = [];
  let   queueId    = 0;
  const now        = new Date().toISOString();

  log(`[manifest] resolving ${candidates.length} registry entries against Qdrant …`);

  for (const entry of candidates) {
    const sourceRefs = Array.isArray(entry.sourceRefs) ? entry.sourceRefs : [];
    // Prefer the first non-local file source-ref
    const primaryRef = sourceRefs[0] ?? `feature:${entry.featureKey}`;
    const cleanRef   = primaryRef.replace(/^local:/, '').replace(/#.*$/, '');

    let qdrantPointId = null;
    try {
      qdrantPointId = await resolveQdrantPoint(primaryRef);
    } catch (err) {
      vlog(`[manifest]   WARN qdrant lookup failed for ${cleanRef}: ${err.message}`);
    }

    const hasPt     = qdrantPointId !== null;
    const priority  = scorePriority(entry, hasPt);
    const packetKey = `feature:${entry.featureKey}`;

    const manifestEntry = {
      packet_key:        packetKey,
      source_ref:        cleanRef,
      feature_type:      'sae_latent',
      version:           AE_VERSION,
      qdrant_collection: COLLECTION,
      qdrant_point_id:   qdrantPointId ?? `synthetic:${packetKey}`,
      embed_dim:         EMBED_DIM,
      priority,
      status:            hasPt ? 'pending' : 'error',
      error:             hasPt ? undefined : 'no_qdrant_point',
    };

    records.push(manifestEntry);

    if (hasPt) {
      queueRaw.push({
        queue_id:          queueId++,
        packet_key:        packetKey,
        source_ref:        cleanRef,
        qdrant_collection: COLLECTION,
        qdrant_point_id:   qdrantPointId,
        embed_dim:         EMBED_DIM,
        target_dim:        TARGET_DIM,
        version:           AE_VERSION,
        priority,
        enqueued_at:       now,
      });
    } else {
      errors.push({ packet_key: packetKey, error: 'no_qdrant_point' });
    }

    vlog(`[manifest]   ${hasPt ? '✓' : '✗'} ${cleanRef}  priority=${priority}`);
  }

  // Topological deque order
  const queue = buildDeque(queueRaw);

  const manifest = {
    contract_version:  CONTRACT_VERSION,
    generated_at:      now,
    ae_version:        AE_VERSION,
    qdrant_collection: COLLECTION,
    embed_dim:         EMBED_DIM,
    target_dim:        TARGET_DIM,
    total_records:     records.length,
    records,
    queue,
  };

  // Validate against contract
  try {
    validateManifest(manifest);
    log(`[manifest] contract validation passed`);
  } catch (err) {
    log(`[manifest] ERROR contract validation failed: ${err.message}`);
    process.exit(1);
  }

  // Summary stats
  const nPending = records.filter(r => r.status === 'pending').length;
  const nError   = records.filter(r => r.status === 'error').length;

  log(`[manifest] records=${records.length}  pending=${nPending}  errors=${nError}`);
  log(`[manifest] queue size=${queue.length}`);

  if (DRY_RUN) {
    log(`[manifest] DRY RUN — no files written`);
    return;
  }

  // Write JSON manifest
  if (!existsSync(REPORTS_DIR)) {
    mkdirSync(REPORTS_DIR, { recursive: true });
  }

  writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2), 'utf8');
  log(`[manifest] wrote ${MANIFEST_PATH}`);

  // Write Markdown summary
  const md = buildMarkdown(manifest, errors);
  writeFileSync(MANIFEST_MD_PATH, md, 'utf8');
  log(`[manifest] wrote ${MANIFEST_MD_PATH}`);
}

// ── Markdown builder ──────────────────────────────────────────────────────────

function buildMarkdown(manifest, errors) {
  const lines = [
    `# AE Train Manifest`,
    ``,
    `| Field | Value |`,
    `|---|---|`,
    `| Contract version | \`${manifest.contract_version}\` |`,
    `| Generated | ${manifest.generated_at} |`,
    `| AE version | ${manifest.ae_version} |`,
    `| Qdrant collection | \`${manifest.qdrant_collection}\` |`,
    `| Input dim | ${manifest.embed_dim} |`,
    `| Latent dim | ${manifest.target_dim} |`,
    `| Total records | ${manifest.total_records} |`,
    `| Queue size | ${manifest.queue.length} |`,
    ``,
    `## Queue (top 20 by priority)`,
    ``,
    `| # | packet_key | source_ref | priority |`,
    `|---|---|---|---|`,
  ];

  for (const entry of manifest.queue.slice(0, 20)) {
    lines.push(
      `| ${entry.queue_id} | \`${entry.packet_key}\` | ${entry.source_ref} | ${entry.priority} |`,
    );
  }

  if (errors.length > 0) {
    lines.push(``, `## Errors (no Qdrant point found)`, ``);
    lines.push(`| packet_key | error |`);
    lines.push(`|---|---|`);
    for (const e of errors.slice(0, 20)) {
      lines.push(`| \`${e.packet_key}\` | ${e.error} |`);
    }
    if (errors.length > 20) {
      lines.push(`| … | … (${errors.length - 20} more) |`);
    }
  }

  lines.push(``, `## Next steps`, ``);
  lines.push(`\`\`\`bash`);
  lines.push(`# Train AE and write sae_latent feature records`);
  lines.push(`node scripts/atlas/train-autoencoder-768-64.mjs`);
  lines.push(`# Dry-run first`);
  lines.push(`node scripts/atlas/train-autoencoder-768-64.mjs --dry-run`);
  lines.push(`\`\`\``);

  return lines.join('\n') + '\n';
}

main().catch(err => {
  console.error('[manifest] FATAL:', err.message);
  process.exit(1);
});
