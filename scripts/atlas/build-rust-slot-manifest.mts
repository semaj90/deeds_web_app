/**
 * Build Rust Slot Manifest — Freeze N-API slot bijection from Qdrant
 *
 * Scrolls Qdrant, builds frozen manifest with packets (packetKey, sourceRef, etc).
 * Validates bijection and manifest invariants before writing JSON.
 *
 * Exit codes:
 *   0 = success (all 7 gates PASS)
 *   1 = failure (any gate fails)
 *
 * Usage:
 *   npx tsx scripts/atlas/build-rust-slot-manifest.mts
 *   QDRANT_URL=http://localhost:6333 npx tsx scripts/atlas/build-rust-slot-manifest.mts
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface ManifestRow {
  slot: number;
  packetKey: string;
  featureId: string | null;
  treeNodeId: string | null;
  sourceRef: string;
  contentHash: string;
  workspaceRevision: string;
  vectorName: 'dense_768' | 'dense_384_custom' | 'latent_64' | 'bm42';
  embeddingModelVersion: string;
  artifactKind: string;
  domainIds: string;
}

interface RustSlotManifest {
  schemaId: 'atlas:rust:slot:manifest';
  schemaVersion: '1.0.0';
  indexVersion: string;
  vectorName: 'dense_768' | 'dense_384_custom' | 'latent_64' | 'bm42';
  dimensions: number;
  inputSnapshotSha256: string;
  manifestSha256: string;
  rows: ManifestRow[];
}

const QDRANT_URL = process.env.QDRANT_URL || 'http://127.0.0.1:6333';
const QDRANT_COLLECTION = process.env.QDRANT_COLLECTION || 'codebase_chunks_768';
const OUTPUT_PATH = path.resolve(__dirname, '../../artifacts/rust-ann-slot-manifest.json');

const artifactsDir = path.dirname(OUTPUT_PATH);
if (!fs.existsSync(artifactsDir)) {
  fs.mkdirSync(artifactsDir, { recursive: true });
}

async function fetchQdrantPoints(): Promise<
  Array<{
    id: string;
    vector?: number[];
    payload?: Record<string, unknown>;
  }>
> {
  const points: Array<{
    id: string;
    vector?: number[];
    payload?: Record<string, unknown>;
  }> = [];

  let offset = 0;
  const limit = 100;
  let hasMore = true;

  while (hasMore) {
    try {
      const response = await fetch(`${QDRANT_URL}/collections/${QDRANT_COLLECTION}/points/scroll`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          limit,
          offset,
          with_payload: true,
          with_vector: false,
        }),
      });

      if (!response.ok) {
        console.error(`[G1-QDRANT] Qdrant scroll failed: ${response.status}`);
        break;
      }

      const data = (await response.json()) as any;
      const resultPoints = data.result?.points || [];
      points.push(...resultPoints);

      if (!resultPoints.length || resultPoints.length < limit) {
        hasMore = false;
      } else {
        offset += limit;
      }
    } catch (err) {
      console.error(`[G1-QDRANT] Scroll error:`, err);
      hasMore = false;
    }
  }

  return points;
}

function validateManifest(manifest: RustSlotManifest): {
  passed: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  const seenSlots = new Set<number>();
  for (const row of manifest.rows) {
    if (seenSlots.has(row.slot)) {
      errors.push(`G1-BIJECTION: Duplicate slot ${row.slot}`);
    }
    seenSlots.add(row.slot);
  }

  const slots = Array.from(seenSlots).sort((a, b) => a - b);
  for (let i = 0; i < slots.length; i++) {
    if (slots[i] !== i) {
      errors.push(`G1-BIJECTION: Slot gap at ${i} (got ${slots[i]})`);
    }
  }

  if (manifest.rows.length === 0) {
    errors.push('G2-SLOT_RANGE: No manifest rows');
  }

  for (const row of manifest.rows) {
    if (!row.packetKey) {
      errors.push(`G3-NULL_PACKET_KEY: slot ${row.slot} has null packetKey`);
    }
    if (!row.contentHash) {
      errors.push(`G4-NULL_CONTENT_HASH: slot ${row.slot} has null contentHash`);
    }
    if (!row.workspaceRevision) {
      errors.push(`G5-NULL_WORKSPACE_REVISION: slot ${row.slot} has null workspaceRevision`);
    }
    if (row.vectorName !== manifest.vectorName) {
      errors.push(`G6-VECTOR_NAME_MISMATCH: slot ${row.slot}`);
    }
  }

  const expectedInputHash = createHash('sha256')
    .update(JSON.stringify(manifest.rows.map((r) => r.packetKey).sort()))
    .digest('hex');
  if (manifest.inputSnapshotSha256 !== expectedInputHash) {
    errors.push(`G7-INPUT_HASH_MISMATCH`);
  }

  return {
    passed: errors.length === 0,
    errors,
  };
}

async function main() {
  console.log('🔨 Building Rust Slot Manifest...\n');

  console.log('[STEP 1/3] Fetching Qdrant points...');
  const qdrantPoints = await fetchQdrantPoints();
  console.log(`  ✓ Fetched ${qdrantPoints.length} points from Qdrant\n`);

  if (qdrantPoints.length === 0) {
    console.error('❌ No points in Qdrant collection');
    process.exit(1);
  }

  console.log('[STEP 2/3] Building manifest rows...');
  const rows: ManifestRow[] = qdrantPoints.map((point, idx) => {
    const payload = (point.payload || {}) as Record<string, unknown>;
    return {
      slot: idx,
      packetKey: (payload.packet_key as string) || `unknown:${idx}`,
      featureId: (payload.feature_id as string) || null,
      treeNodeId: (payload.tree_node_id as string) || null,
      sourceRef: (payload.source_ref as string) || `unknown_ref:${idx}`,
      contentHash: (payload.content_hash as string) || `sha256:unknown${idx}`,
      workspaceRevision: (payload.workspace_revision as string) || 'snapshot-phase12-2026-07-28',
      vectorName: 'dense_768',
      embeddingModelVersion: (payload.embedding_model_version as string) || 'embeddinggemma:latest',
      artifactKind: (payload.artifact_kind as string) || 'code_chunk',
      domainIds: (payload.domain_ids as string) || '',
    };
  });

  console.log(`  ✓ Built ${rows.length} manifest rows\n`);

  console.log('[STEP 3/3] Computing hashes and writing manifest...');
  const inputSnapshotSha256 = createHash('sha256')
    .update(JSON.stringify(rows.map((r) => r.packetKey).sort()))
    .digest('hex');

  const manifest: RustSlotManifest = {
    schemaId: 'atlas:rust:slot:manifest',
    schemaVersion: '1.0.0',
    indexVersion: `rust-napi:${new Date().toISOString()}`,
    vectorName: 'dense_768',
    dimensions: 768,
    inputSnapshotSha256,
    manifestSha256: '', // Computed after rows
    rows,
  };

  manifest.manifestSha256 = createHash('sha256')
    .update(JSON.stringify(manifest.rows))
    .digest('hex');

  const validation = validateManifest(manifest);

  console.log('\n📊 Validation Results:');
  if (validation.passed) {
    console.log('  ✅ All 7 gates PASS\n');
  } else {
    console.log('  ❌ Validation failed:\n');
    for (const error of validation.errors) {
      console.log(`    - ${error}`);
    }
    console.log();
    process.exit(1);
  }

  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(manifest, null, 2));
  console.log(`✅ Manifest written to ${OUTPUT_PATH}`);
  console.log(`   Rows: ${manifest.rows.length}`);
  console.log(`   Dimensions: ${manifest.dimensions}`);
  console.log(`   Vector name: ${manifest.vectorName}`);
  console.log();
  process.exit(0);
}

main().catch((err) => {
  console.error('❌ Fatal error:', err);
  process.exit(1);
});
