#!/usr/bin/env node
/**
 * phase-19c-qdrant-index.mjs
 *
 * Indexes Phase 19C feature embeddings into Qdrant for vector search.
 *
 * Input:
 *   - Feature registry with confidence scores
 *   - Generates random 768-dim embeddings (in production, use actual embeddings)
 *
 * Output:
 *   - Qdrant: codebase_chunks_768 collection with feature payloads
 *   - .tmp/qdrant-index-report.json (indexed count, stats)
 *
 * Usage:
 *   node scripts/atlas/phase-19c-qdrant-index.mjs
 *   node scripts/atlas/phase-19c-qdrant-index.mjs --dry-run
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { QdrantClient } from '@qdrant/js-client-rest';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dir, '../..');

const argv = process.argv.slice(2);
const DRY_RUN = argv.includes('--dry-run');
const APPLY = argv.includes('--apply') || !DRY_RUN;
const VERBOSE = argv.includes('--verbose');

const REGISTRY_PATH = path.join(ROOT, '.tmp', 'atlas-feature-registry.json');
const REPORT_PATH = path.join(ROOT, '.tmp', 'qdrant-index-report.json');
const QDRANT_URL = process.env.QDRANT_URL || 'http://127.0.0.1:6333';
const QDRANT_COLLECTION =
  process.env.PHASE19C_QDRANT_COLLECTION || 'codebase_chunks_768';

// ─── Qdrant Operations (Stub) ───────────────────────────────────────────────
// In production, use qdrant-client and connect to QDRANT_URL
// For now, we prepare the payload without executing

function buildQdrantPayloads(registry) {
  const payloads = [];

  if (!registry) {
    console.log('  ⚠ Registry not available, skipping Qdrant payloads');
    return payloads;
  }

  for (const feature of registry.features || []) {
    // In production, fetch actual embedding from embeddinggemma
    // For now, use deterministic random embedding (seeded by feature ID)
    const rng = crypto.createHash('sha256').update(feature.id).digest();
    const embedding = new Array(768).fill(0).map((_, i) => {
      const byte = rng[i % rng.length];
      return (byte - 128) / 128; // Normalize to [-1, 1]
    });

    const payload = {
      id: crypto.randomUUID(),
      vector: embedding,
      payload: {
        featureId: feature.id,
        label: feature.label,
        kind: feature.kind,
        confidence: feature.confidence,
        fileCount: feature.files?.length || 0,
        tags: [
          `feature:${feature.id}`,
          `kind:${feature.kind}`,
          `confidence:${Math.round(feature.confidence * 10) / 10}`,
        ],
        sourceRefs: feature.sourceRefs || [],
        envVars: feature.envVars || [],
        redisKeys: feature.redisKeys || [],
        postgresTables: feature.postgresTables || [],
      },
    };

    payloads.push(payload);
  }

  return payloads;
}

function sha256ToUuid(key) {
  const hash = crypto.createHash('sha256').update(key).digest('hex');
  return [
    hash.slice(0, 8),
    hash.slice(8, 12),
    hash.slice(12, 16),
    hash.slice(16, 20),
    hash.slice(20, 32),
  ].join('-');
}

async function ensureQdrantCollection(client) {
  try {
    await client.getCollection(QDRANT_COLLECTION);
    return true;
  } catch {
    await client.createCollection(QDRANT_COLLECTION, {
      vectors: {
        content: { size: 768, distance: 'Cosine' },
        signature: { size: 768, distance: 'Cosine' },
        error: { size: 768, distance: 'Cosine' },
        encoded_64: { size: 768, distance: 'Cosine' },
      },
      hnsw_config: {
        m: 16,
        ef_construct: 128,
        full_scan_threshold: 10_000,
        max_indexing_threads: 2,
        on_disk: false,
      },
    });
    return true;
  }
}

async function applyQdrantPayloads(payloads) {
  const client = new QdrantClient({ url: QDRANT_URL });
  await ensureQdrantCollection(client);
  const points = payloads.map((payload) => ({
    id: sha256ToUuid(String(payload.payload.featureId)),
    vector: {
      content: payload.vector,
    },
    payload: {
      ...payload.payload,
      source: 'phase-19c-qdrant-index',
      indexed_at: new Date().toISOString(),
    },
  }));
  await client.upsert(QDRANT_COLLECTION, { wait: true, points });
  return { upserted: points.length, collection: QDRANT_COLLECTION, url: QDRANT_URL };
}

// ─── Main ──────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n── Phase 19C Qdrant Index ──────────────────────────────');

  // Load registry
  console.log('  Step 1: Load feature registry...');

  let registry = null;
  if (fs.existsSync(REGISTRY_PATH)) {
    const content = fs.readFileSync(REGISTRY_PATH, 'utf8');
    registry = JSON.parse(content);
  }

  if (!registry) {
    console.error(`  ❌ Registry not found: ${REGISTRY_PATH}`);
    process.exit(1);
  }

  console.log(`  ✅ Loaded ${registry.features?.length || 0} features`);

  // Build Qdrant payloads
  console.log('  Step 2: Build Qdrant embedding payloads...');
  const payloads = buildQdrantPayloads(registry);
  console.log(`  ✅ Built ${payloads.length} Qdrant payload points`);

  const execution = {
    attempted: APPLY && !DRY_RUN,
    applied: false,
    collection: QDRANT_COLLECTION,
    url: QDRANT_URL,
    upserted: 0,
    error: null,
  };

  if (execution.attempted) {
    try {
      const result = await applyQdrantPayloads(payloads);
      execution.applied = true;
      execution.upserted = result.upserted;
      execution.collection = result.collection;
      execution.url = result.url;
      console.log(`  ✅ Qdrant upserted ${result.upserted} points into ${result.collection}`);
    } catch (error) {
      execution.error = error?.message || String(error);
      console.error(`  ❌ Qdrant upsert failed: ${execution.error}`);
    }
  }

  // Write report
  if (!DRY_RUN) {
    fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
  }

  const report = {
    timestamp: new Date().toISOString(),
    phase: '19C',
    stage: 'qdrant-index',
    status: DRY_RUN ? 'dry-run' : 'indexed',
    inputs: {
      registry: !!registry,
      featuresCount: registry?.features?.length || 0,
    },
    outputs: {
      payloadsBuilt: payloads.length,
      embeddingDim: 768,
      collectionName: QDRANT_COLLECTION,
    },
    execution,
    payloads: DRY_RUN ? payloads.slice(0, 3) : undefined, // Show first 3 in dry-run
    validation: {
      allFeaturesIncluded: payloads.length === registry?.features?.length,
      embeddingsValid: payloads.every((p) => p.vector.length === 768),
      payloadsReady: payloads.length > 0,
      applied: execution.applied,
    },
    notes: [
      'Qdrant embedding payloads built (using deterministic random embeddings)',
      'In production: replace with actual embeddings from embeddinggemma',
      'Each payload includes feature metadata + tags + source references',
      `Ready for upsert into Qdrant ${QDRANT_COLLECTION} collection`,
      'Next: Connect to Qdrant and upsert payloads',
    ],
  };

  if (!DRY_RUN) {
    fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2), 'utf8');
    console.log(`  ✅ Wrote Qdrant index report → ${REPORT_PATH}`);
  }

  // Summary
  console.log('\n── Summary ────────────────────────────────────────────────');
  console.log(`  Features: ${registry.features?.length || 0}`);
  console.log(`  Payloads built: ${payloads.length}`);
  console.log(`  Embedding dimension: 768`);
  console.log(`  Collection: ${QDRANT_COLLECTION}`);
  console.log(`  Validation: ${execution.applied ? '✅ APPLIED' : report.validation.payloadsReady ? '⚠️ PREPARED' : '❌ BLOCKED'}`);

  if (DRY_RUN) {
    console.log('\n[DRY-RUN] Qdrant payloads prepared. Run without --dry-run to persist.');
  } else if (!execution.applied) {
    console.log('\n⚠️ Qdrant payloads were prepared but not applied. Check QDRANT_URL / collection health.');
  }

  console.log('\nNext: Connect to Qdrant and upsert payloads');
}

main().catch((err) => {
  console.error('\n❌ Qdrant index error:', err.message);
  process.exit(1);
});
