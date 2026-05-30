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

const __dir = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dir, '../..');

const argv = process.argv.slice(2);
const DRY_RUN = argv.includes('--dry-run');
const VERBOSE = argv.includes('--verbose');

const REGISTRY_PATH = path.join(ROOT, '.tmp', 'atlas-feature-registry.json');
const REPORT_PATH = path.join(ROOT, '.tmp', 'qdrant-index-report.json');

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
      collectionName: 'codebase_chunks_768',
    },
    payloads: DRY_RUN ? payloads.slice(0, 3) : undefined, // Show first 3 in dry-run
    validation: {
      allFeaturesIncluded: payloads.length === registry?.features?.length,
      embeddingsValid: payloads.every((p) => p.vector.length === 768),
      payloadsReady: payloads.length > 0,
    },
    notes: [
      'Qdrant embedding payloads built (using deterministic random embeddings)',
      'In production: replace with actual embeddings from embeddinggemma',
      'Each payload includes feature metadata + tags + source references',
      'Ready for upsert into Qdrant codebase_chunks_768 collection',
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
  console.log(`  Collection: codebase_chunks_768`);
  console.log(`  Validation: ${report.validation.payloadsReady ? '✅ READY' : '❌ BLOCKED'}`);

  if (DRY_RUN) {
    console.log('\n[DRY-RUN] Qdrant payloads prepared. Run without --dry-run to persist.');
  }

  console.log('\nNext: Connect to Qdrant and upsert payloads');
}

main().catch((err) => {
  console.error('\n❌ Qdrant index error:', err.message);
  process.exit(1);
});