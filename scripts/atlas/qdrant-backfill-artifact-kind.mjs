#!/usr/bin/env node
/**
 * Qdrant Artifact-Kind Backfill
 *
 * Classifies every Qdrant point's source_ref into an artifact_kind
 * (per atlas.repo-artifact.v1.okf) and backfills the `kind` payload field
 * on points that currently have kind=NONE or kind missing.
 *
 * Also backfills `artifact_kind` as a separate indexed field so agentic
 * dense search can filter by artifact type.
 *
 * Classification is deterministic from source_ref alone — no DB required.
 * Qdrant is updated via batch set_payload calls (500 points per batch).
 *
 * Usage:
 *   node scripts/atlas/qdrant-backfill-artifact-kind.mjs [--dry-run] [--verbose] [--json]
 *   node scripts/atlas/qdrant-backfill-artifact-kind.mjs --kind=source_module  # only one kind
 *   node scripts/atlas/qdrant-backfill-artifact-kind.mjs --missing-only        # skip already-classified
 *   node scripts/atlas/qdrant-backfill-artifact-kind.mjs --collection=codebase_chunks_384_hybrid
 *   node scripts/atlas/qdrant-backfill-artifact-kind.mjs --reclassify-unknown  # re-run only on artifact_kind=unknown points
 */

import { writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dir = dirname(fileURLToPath(import.meta.url));

const DRY_RUN           = process.argv.includes('--dry-run');
const VERBOSE           = process.argv.includes('--verbose');
const JSON_OUT          = process.argv.includes('--json');
const MISSING_ONLY      = process.argv.includes('--missing-only');
const RECLASSIFY_UNKNOWN = process.argv.includes('--reclassify-unknown');
const KIND_FILTER       = process.argv.find(a => a.startsWith('--kind='))?.split('=')[1] ?? null;
const COL_FLAG          = process.argv.find(a => a.startsWith('--collection='))?.split('=')[1] ?? null;

const QDRANT_URL        = process.env.QDRANT_URL || 'http://127.0.0.1:6333';
const QDRANT_COLLECTION = COL_FLAG || process.env.ATLAS_QDRANT_COLLECTION || 'codebase_chunks_768';
const SCROLL_BATCH = 500;
const UPDATE_BATCH = 500;

function log(...args) { if (VERBOSE) console.log(...args); }

// ── Artifact kind classifier ──────────────────────────────────────────────────
// Deterministic from source_ref alone. Mirrors atlas.repo-artifact.v1.okf.

function classifySourceRef(sourceRef) {
  if (!sourceRef) return 'unknown';
  const sr = sourceRef.toLowerCase();

  // Strip common prefixes for easier matching
  const bare = sr
    .replace(/^sveltekit-frontend\//, '')
    .replace(/^packages\/[^/]+\//, '')
    .replace(/^scripts\//, 'scripts/')
    .replace(/^simd-bridge\//, 'simd-bridge/');

  // Schema contracts (before source_module since .ts could match either)
  if (sr.endsWith('.okf') || bare.startsWith('schemas/')) return 'schema_contract';
  if (sr.includes('.schema.json') || sr.includes('.schema.ts')) return 'schema_contract';

  // Migration scripts
  if (bare.startsWith('drizzle/') || bare.startsWith('migrations/')) return 'migration_script';
  if (sr.endsWith('.sql')) return 'migration_script';

  // Test files (before source_module)
  if (
    sr.endsWith('.spec.ts') || sr.endsWith('.spec.js') || sr.endsWith('.test.ts') ||
    sr.endsWith('.test.js') || bare.startsWith('tests/') || bare.startsWith('test/')
  ) return 'test_file';

  // Atlas pipeline scripts
  if (sr.startsWith('scripts/atlas/') || sr.includes('/scripts/atlas/')) return 'atlas_script';

  // Proto files
  if (sr.endsWith('.proto')) return 'proto_file';

  // Type declarations
  if (sr.endsWith('.d.ts')) return 'type_declaration';

  // Source modules (.ts, .js, .svelte, .mts, .mjs, .cjs, native code, GPU shaders)
  if (
    sr.endsWith('.ts') || sr.endsWith('.js') || sr.endsWith('.svelte') ||
    sr.endsWith('.mts') || sr.endsWith('.mjs') || sr.endsWith('.tsx') || sr.endsWith('.jsx') ||
    sr.endsWith('.cjs')
  ) return 'source_module';

  // Native/systems source code
  if (
    sr.endsWith('.cpp') || sr.endsWith('.cc') || sr.endsWith('.c') || sr.endsWith('.h') ||
    sr.endsWith('.hpp') || sr.endsWith('.cu') || sr.endsWith('.cuh')
  ) return 'native_source';

  // Go source
  if (sr.endsWith('.go')) return 'source_module';

  // Rust source
  if (sr.endsWith('.rs')) return 'source_module';

  // Python source
  if (sr.endsWith('.py') || sr.endsWith('.pyi')) return 'source_module';

  // GPU shader source
  if (sr.endsWith('.wgsl') || sr.endsWith('.glsl') || sr.endsWith('.hlsl') || sr.endsWith('.metal')) return 'shader_source';

  // AGENTS.md / LLMS.md
  if (sr.endsWith('/agents.md') || sr.endsWith('/llms.md') || sr.endsWith('agents.md')) return 'agent_card';

  // Documentation pages (.md, .mdx)
  if (sr.endsWith('.md') || sr.endsWith('.mdx')) return 'documentation_page';

  // Binary assets
  const binaryExts = ['.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico', '.webp',
    '.wasm', '.node', '.bin', '.pdf', '.mp4', '.mp3'];
  if (binaryExts.some(ext => sr.endsWith(ext))) return 'binary_asset';

  // Config files
  if (
    sr.endsWith('.json') || sr.endsWith('.jsonc') || sr.endsWith('.toml') ||
    sr.endsWith('.yaml') || sr.endsWith('.yml') || sr.endsWith('.env') ||
    sr.endsWith('.ini') || sr.endsWith('.cfg')
  ) return 'config_file';

  // HTML — test harness pages (routes/api/*/test.html) or docs
  if (sr.endsWith('.html') || sr.endsWith('.htm')) {
    if (bare.includes('/test') || bare.includes('/tests/') || bare.startsWith('tests/')) return 'test_file';
    return 'documentation_page';
  }

  return 'unknown';
}

// Map artifact_kind to a `kind` field value for backwards compat with existing
// Qdrant payload conventions (text, qdrant_chunk, etc.).
// We keep existing kinds intact and only classify NONE/missing ones.
function toKindField(artifactKind) {
  switch (artifactKind) {
    case 'source_module':      return 'source_module';
    case 'type_declaration':   return 'type_declaration';
    case 'schema_contract':    return 'schema_contract';
    case 'migration_script':   return 'migration_script';
    case 'atlas_script':       return 'atlas_script';
    case 'test_file':          return 'test_file';
    case 'config_file':        return 'config_file';
    case 'documentation_page': return 'documentation_page';
    case 'agent_card':         return 'agent_card';
    case 'proto_file':         return 'proto_file';
    case 'native_source':      return 'native_source';
    case 'shader_source':      return 'shader_source';
    case 'binary_asset':       return 'binary_asset';
    default:                   return 'unclassified';
  }
}

// ── Qdrant scroll ─────────────────────────────────────────────────────────────
async function scrollUuidPoints() {
  const points = [];
  let offset = null;

  while (true) {
    const body = {
      limit: SCROLL_BATCH,
      with_payload: ['source_ref', 'packet_key', 'kind', 'artifact_kind'],
      with_vector: false,
    };
    if (offset) body.offset = offset;

    // --reclassify-unknown: only scroll points already tagged artifact_kind=unknown
    if (RECLASSIFY_UNKNOWN) {
      body.filter = { must: [{ key: 'artifact_kind', match: { value: 'unknown' } }] };
    }

    const res = await fetch(`${QDRANT_URL}/collections/${QDRANT_COLLECTION}/points/scroll`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`Qdrant scroll failed: ${res.status} ${await res.text()}`);
    const data = await res.json();
    const batch = data.result?.points ?? [];
    if (!batch.length) break;

    for (const p of batch) {
      if (typeof p.id !== 'string') continue; // skip integer IDs (legacy)
      if (p.payload?.kind === 'directory-cluster') continue; // skip dir clusters

      // Filter: only process points with no kind or kind=NONE if --missing-only
      if (MISSING_ONLY && p.payload?.kind && p.payload.kind !== 'NONE') continue;

      points.push(p);
    }

    if (points.length % 10000 < SCROLL_BATCH) log(`  Scrolled ${points.length} candidate points...`);
    offset = data.result?.next_page_offset;
    if (!offset) break;
  }
  return points;
}

// ── Qdrant batch set_payload ──────────────────────────────────────────────────
async function batchSetPayload(pointIds, payload) {
  const res = await fetch(
    `${QDRANT_URL}/collections/${QDRANT_COLLECTION}/points/payload`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ payload, points: pointIds }),
    }
  );
  if (!res.ok) throw new Error(`set_payload failed: ${res.status} ${await res.text()}`);
  return await res.json();
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`=== Qdrant Artifact-Kind Backfill — ${DRY_RUN ? 'DRY RUN' : 'LIVE'} ===`);
  console.log(`Collection: ${QDRANT_COLLECTION}`);
  if (KIND_FILTER) console.log(`Kind filter: ${KIND_FILTER}`);
  if (MISSING_ONLY) console.log(`Mode: missing-only (skip already-classified)`);
  if (RECLASSIFY_UNKNOWN) console.log(`Mode: reclassify-unknown (only artifact_kind=unknown points)`);
  console.log('');

  // Scroll all candidate points
  console.log('Scrolling candidate points...');
  const points = await scrollUuidPoints();
  console.log(`  ${points.length} candidate points`);
  console.log('');

  // Classify each point
  const kindGroups = new Map(); // artifact_kind → [point_ids]
  const kindStats = {};
  let alreadyClassified = 0;
  let noSourceRef = 0;

  for (const p of points) {
    const sr = p.payload?.source_ref;
    if (!sr) { noSourceRef++; continue; }

    const artifactKind = classifySourceRef(sr);

    // If KIND_FILTER is set, only process that kind
    if (KIND_FILTER && artifactKind !== KIND_FILTER) continue;

    // Track if point already has a non-NONE kind
    if (p.payload?.kind && p.payload.kind !== 'NONE' && !MISSING_ONLY) {
      alreadyClassified++;
    }

    kindStats[artifactKind] = (kindStats[artifactKind] ?? 0) + 1;

    if (!kindGroups.has(artifactKind)) kindGroups.set(artifactKind, []);
    kindGroups.get(artifactKind).push(p.id);
  }

  // Print classification summary
  console.log('=== Classification Summary ===');
  const sortedKinds = Object.entries(kindStats).sort((a, b) => b[1] - a[1]);
  for (const [kind, count] of sortedKinds) {
    console.log(`  ${kind.padEnd(22)} ${count}`);
  }
  console.log(`  ${'no source_ref'.padEnd(22)} ${noSourceRef}`);
  if (alreadyClassified > 0) console.log(`  ${'already classified'.padEnd(22)} ${alreadyClassified}`);
  console.log('');

  const totalToUpdate = [...kindGroups.values()].reduce((sum, ids) => sum + ids.length, 0);
  console.log(`Points to update: ${totalToUpdate}`);
  console.log('');

  const stats = {
    total_scanned: points.length,
    no_source_ref: noSourceRef,
    already_classified: alreadyClassified,
    classification: kindStats,
    updated: 0,
    errors: 0,
  };

  if (DRY_RUN) {
    console.log('[dry-run] Would set_payload on:');
    for (const [kind, ids] of kindGroups) {
      console.log(`  ${kind.padEnd(22)} ${ids.length} points`);
      if (VERBOSE && ids.length <= 3) {
        for (const id of ids) console.log(`    ${id}`);
      }
    }
    stats.updated = totalToUpdate;
  } else {
    // Apply: for each kind group, batch set_payload { kind, artifact_kind }
    for (const [artifactKind, ids] of kindGroups) {
      const kindField = toKindField(artifactKind);
      const payload = { kind: kindField, artifact_kind: artifactKind };

      console.log(`Updating ${artifactKind} (${ids.length} points)...`);

      for (let i = 0; i < ids.length; i += UPDATE_BATCH) {
        const batch = ids.slice(i, i + UPDATE_BATCH);
        try {
          await batchSetPayload(batch, payload);
          stats.updated += batch.length;
          log(`  ${artifactKind}: ${Math.min(i + UPDATE_BATCH, ids.length)}/${ids.length}`);
        } catch (err) {
          stats.errors++;
          console.error(`  ${artifactKind} batch error: ${err.message}`);
        }
      }
    }
    console.log(`\nTotal updated: ${stats.updated}`);
  }

  console.log('');
  console.log('=== Summary ===');
  console.log(`  Scanned:  ${stats.total_scanned}`);
  console.log(`  Updated:  ${stats.updated}`);
  console.log(`  Errors:   ${stats.errors}`);

  const report = {
    run_at: new Date().toISOString(),
    dry_run: DRY_RUN,
    collection: QDRANT_COLLECTION,
    kind_filter: KIND_FILTER,
    missing_only: MISSING_ONLY,
    ...stats,
  };

  if (JSON_OUT) {
    const outPath = join(__dir, '../../docs/reports/qdrant-backfill-artifact-kind.json');
    writeFileSync(outPath, JSON.stringify(report, null, 2));
    console.log('\nJSON report: docs/reports/qdrant-backfill-artifact-kind.json');
  }

  const ok = stats.errors === 0;
  console.log(ok ? '\n✅ Backfill complete' : '\n⚠ Backfill done with errors');
  process.exit(ok ? 0 : 1);
}

main().catch(e => {
  console.error('Fatal:', e.message);
  process.exit(2);
});
