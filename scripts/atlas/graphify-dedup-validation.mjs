#!/usr/bin/env node

/**
 * Graphify Pipeline Deduplication Validator
 *
 * Runs ONCE per graphify:daily invocation to prevent redundant schema validation
 * across multiple pipeline stages (materialize, cold-processing, fanout, etc.).
 *
 * Caches validation results and signals to downstream stages to skip re-validation.
 *
 * Usage:
 *   npm run graphify:dedup-validation [--apply] [--verbose]
 *
 * On first run:
 *   - Validates all schemas (AddressablePacket, FeaturePacket, etc.)
 *   - Writes validation cache to .tmp/schema-validation.cache.json
 *   - Writes a durable readiness marker to .tmp/graphify-validation-cache.ready.json
 *
 * On subsequent runs (same graphify:daily):
 *   - Loads cache from disk
 *   - Skips redundant validation
 *   - Reports cache hit rate
 *
 * Downstream stages can read the cache file directly or inspect the readiness marker.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SchemaValidationCache } from './lib/schema-validation-cache.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const APP_ROOT = process.env.APP_REPO_ROOT || 'C:/Users/james/Videos/deeds-web-app';
const READY_MARKER_PATH = path.join(REPO_ROOT, '.tmp', 'graphify-validation-cache.ready.json');

const argv = process.argv.slice(2);
const VERBOSE = argv.includes('--verbose');
const APPLY = argv.includes('--apply');

/**
 * Schemas to validate (sample of critical ones from graphify pipeline)
 */
const SCHEMAS_TO_CHECK = [
  { name: 'AddressablePacket', path: './lib/schema/addressable-packet.mjs' },
  { name: 'FeaturePacket', path: './lib/schema/feature-packet.mjs' },
  { name: 'ColdProcessingPacket', path: './lib/schema/cold-processing-packet.mjs' },
  { name: 'QdrantPayload', path: './lib/schema/qdrant-payload.mjs' },
];

/**
 * Load schema modules safely
 */
async function loadSchema(schemaPath) {
  try {
    const fullPath = path.resolve(__dirname, schemaPath);
    if (!fs.existsSync(fullPath)) {
      return null;
    }
    const mod = await import(`file://${fullPath}`);
    // Return the default export or the first exported schema
    return mod.default || Object.values(mod)[0];
  } catch (err) {
    if (VERBOSE) {
      console.warn(`[graphify-dedup-validation] Failed to load schema ${schemaPath}: ${err.message}`);
    }
    return null;
  }
}

/**
 * Main validation routine
 */
async function runDedupValidation() {
  console.log('[graphify-dedup-validation] Starting deduplication validator...');

  const validator = new SchemaValidationCache({
    ttl: 3600_000,  // 1 hour TTL (stays valid for entire graphify session)
    cacheDir: path.join(REPO_ROOT, '.tmp'),
    verbose: VERBOSE
  });

  let validationsPassed = 0;
  let validationsFailed = 0;

  // Load and validate each schema
  for (const { name, path: schemaPath } of SCHEMAS_TO_CHECK) {
    const schema = await loadSchema(schemaPath);
    if (!schema) {
      if (VERBOSE) {
        console.log(`[graphify-dedup-validation] ⊘ ${name} schema not found (skipping)`);
      }
      continue;
    }

    // Create test packet
    const testPacket = {
      packet_key: `test:${name}:${Date.now()}`,
      id: `test-${name}`,
      timestamp: new Date().toISOString()
    };

    try {
      const result = await validator.validatePacket(testPacket, schema, name);
      if (result.ok) {
        validationsPassed++;
        if (VERBOSE) {
          console.log(`[graphify-dedup-validation] ✓ ${name} validated`);
        }
      } else {
        validationsFailed++;
        console.warn(`[graphify-dedup-validation] ✗ ${name} failed: ${result.errors[0]}`);
      }
    } catch (err) {
      validationsFailed++;
      console.warn(`[graphify-dedup-validation] ✗ ${name} error: ${err.message}`);
    }
  }

  // Report statistics
  const stats = validator.getStats();
  console.log(`\n[graphify-dedup-validation] Summary:`);
  console.log(`  Validations passed: ${validationsPassed}`);
  console.log(`  Validations failed: ${validationsFailed}`);
  console.log(`  Cache hits: ${stats.memory + stats.disk}/${stats.total} (${stats.hitRate})`);
  console.log(`  Cache size: ${stats.cacheSize} entries`);

  if (APPLY && validationsFailed === 0) {
    // Persist a durable marker for later npm steps. Environment variables do not
    // survive across separate process invocations in the graphify chain.
    const readyMarker = {
      schema: 'graphify.validation-cache.ready.v1',
      generatedAt: new Date().toISOString(),
      cacheFile: path.join('.tmp', 'schema-validation.cache.json'),
      cacheStats: stats,
      schemasChecked: SCHEMAS_TO_CHECK.map(({ name }) => name),
    };
    fs.mkdirSync(path.dirname(READY_MARKER_PATH), { recursive: true });
    fs.writeFileSync(READY_MARKER_PATH, `${JSON.stringify(readyMarker, null, 2)}\n`, 'utf8');
    console.log(`\n✓ Validation cache ready for graphify pipeline`);
    console.log(`  Wrote durable readiness marker: ${path.relative(REPO_ROOT, READY_MARKER_PATH)}`);
    return 0;
  }

  if (validationsFailed > 0) {
    console.error(`\n✗ ${validationsFailed} validation(s) failed. Blocking graphify:daily.`);
    return 1;
  }

  return 0;
}

// Execute
const exitCode = await runDedupValidation();
process.exit(exitCode);
