#!/usr/bin/env node
/**
 * Phase 78 - CUDA Clustering of Errors
 *
 * Clusters similar errors using embeddings and K-means:
 * 1. Get unclustered errors from error_events table
 * 2. Generate embeddings using Ollama (Gemma/Mistral)
 * 3. Perform K-means clustering on embeddings
 * 4. Update error_events table with cluster_id
 *
 * Usage:
 *   npm run phase78:cluster              # Normal mode
 *   npm run phase78:cluster -- --dry-run # Preview only
 *   npm run phase78:cluster -- --verbose # Detailed logging
 */

import dotenv from 'dotenv';
import { isNull, sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as path from 'path';
import postgres from 'postgres';
// FIXED 2026-09-14 (PHASE78-LIVE-PROPOSAL-NO-PERSIST-01 investigation): 'generateCachedEmbedding'
// does not exist in ollama-config.ts -- only 'generateEmbedding(text)' does (no options object;
// it resolves its own endpoint/model internally, canonical embeddinggemma:latest). Aliased to
// avoid colliding with this file's own local generateEmbedding() wrapper below.
import { generateEmbedding as generateEmbeddingRaw } from '../src/lib/ai/ollama-config';

// Load environment variables
dotenv.config();

import { fileURLToPath } from 'url';
// FIXED 2026-09-14 (PHASE78-LIVE-PROPOSAL-NO-PERSIST-01 investigation): this script imported
// from the WRONG schema directory tree -- 'src/lib/server/db/schema/index.js' does not export
// errorClustersTable/errorEventsTable at all. The real definitions live in the separate
// 'src/lib/db/schema/cutlass.ts' file. This is why phase78-cluster-errors.mts has apparently
// never successfully run (error_clusters has 0 rows despite 148 real error_events existing).
import { errorClustersTable, errorEventsTable } from '../src/lib/db/schema/cutlass.js';
import { kmeansCluster, type KmeansEmbedding } from './phase78-kmeans.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Parse command-line arguments
const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const isVerbose = args.includes('--verbose');

// Configuration
const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434';
const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL || 'embeddinggemma:latest';
const BATCH_SIZE = parseInt(process.env.BATCH_SIZE || '32', 10);
const CLUSTER_COUNT = parseInt(process.env.CLUSTER_COUNT || '10', 10);

// Get database URL from environment
const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL environment variable not set');
  process.exit(1);
}

// Initialize database connection
const client = postgres(DATABASE_URL, {
  onnotice: () => {},
});
const db = drizzle(client);

/**
 * Infer cluster kind from error code and message
 */
function inferClusterKind(tsCode: string | null, message: string): string {
  if (!tsCode && !message) return 'typing';

  const code = tsCode || '';
  const msg = message.toLowerCase();

  // Type errors
  if (code.startsWith('TS23') || code.startsWith('TS24')) return 'typing';

  // Nullability errors
  if (code.startsWith('TS27') || msg.includes('null') || msg.includes('undefined')) return 'nullability';

  // Import errors
  if (code === 'TS2307' || msg.includes('cannot find module') || msg.includes('import')) return 'import';

  // Svelte runes (Svelte 5 migration)
  if (msg.includes('$props') || msg.includes('$state') || msg.includes('$derived') || msg.includes('$effect')) {
    return 'svelte-rune';
  }

  // Binding errors
  if (msg.includes('bind:') || msg.includes('binding')) return 'binding';

  // Syntax/formatting
  if (code.startsWith('TS1') || msg.includes('expected')) return 'formatting';

  // Schema/database
  if (msg.includes('schema') || msg.includes('drizzle')) return 'schema';

  // Default
  return 'typing';
}

/**
 * Normalize severity to match database enum: info|warn|error|fatal
 */
function normalizeSeverity(s: string | null | undefined): 'info' | 'warn' | 'error' | 'fatal' {
  const v = (s ?? 'warn').toLowerCase();

  // Direct matches
  if (v === 'info' || v === 'warn' || v === 'error' || v === 'fatal') {
    return v as 'info' | 'warn' | 'error' | 'fatal';
  }

  // Map common alternatives
  if (v === 'low') return 'info';
  if (v === 'medium') return 'warn';
  if (v === 'high') return 'error';
  if (v === 'critical') return 'fatal';

  // Default to error for safety
  return 'error';
}/**
 * Get unclustered errors from database
 */
async function getUnclusteredErrors() {
  if (isVerbose) {
    console.log('📚 Fetching unclustered errors from database...');
  }

  const errors = await db
    .select()
    .from(errorEventsTable)
    .where(isNull(errorEventsTable.clusterId));

  if (isVerbose) {
    console.log(`   Found ${errors.length} unclustered errors`);
  }

  return errors;
}

/**
 * Call Ollama embedding API with Redis caching
 */
async function generateEmbedding(text: string, retries = 3): Promise<number[] | null> {
  try {
    return await generateEmbeddingRaw(text);
  } catch (err) {
    if (isVerbose) {
      console.warn(`   ⚠️  Failed to generate cached embedding:`, err);
    }
    return null;
  }
}

/**
 * Simple K-means clustering
 */
/**
 * Main clustering function
 */
async function clusterErrors(): Promise<void> {
  console.log('🧠 Phase 78 - CUDA Clustering Errors\n');

  try {
    // Get unclustered errors
    const errors = await getUnclusteredErrors();

    if (errors.length === 0) {
      console.log('✅ No unclustered errors to process');
      return;
    }

    console.log(`📊 Clustering ${errors.length} errors into ~${CLUSTER_COUNT} clusters\n`);

    if (isDryRun) {
      console.log('🔍 DRY RUN: Would cluster errors in batches of', BATCH_SIZE);
      console.log(`   Target clusters: ${CLUSTER_COUNT}`);
      console.log(`   Sample errors: ${errors.slice(0, 3).map(e => e.message.substring(0, 40)).join(', ')}`);
      return;
    }

    // Process in batches
    const embeddings: Array<{ id: string; embedding: number[] }> = [];
    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < errors.length; i += BATCH_SIZE) {
      const batch = errors.slice(i, i + BATCH_SIZE);
      console.log(`⏳ Processing batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(errors.length / BATCH_SIZE)}...`);

      for (const error of batch) {
        const embedding = await generateEmbedding(error.message);
        if (embedding) {
          embeddings.push({
            id: error.id,
            embedding,
          });
          successCount++;
        } else {
          failCount++;
        }
      }

      // Small delay between batches
      if (i + BATCH_SIZE < errors.length) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    if (isVerbose) {
      console.log(`   ✅ Generated embeddings: ${successCount}`);
      if (failCount > 0) {
        console.log(`   ⚠️  Failed: ${failCount}`);
      }
    }

    if (embeddings.length === 0) {
      console.error('❌ Failed to generate embeddings for any errors');
      console.error('   Ensure Ollama is running and model is available');
      console.error(`   Model: ${EMBEDDING_MODEL} at ${OLLAMA_BASE_URL}`);
      process.exit(1);
    }

    // Cluster embeddings
    if (isVerbose) {
      console.log('\n🔗 Performing K-means clustering...');
    }

    const clusters = kmeansCluster(embeddings, Math.min(CLUSTER_COUNT, embeddings.length));

    if (isVerbose) {
      console.log(`   Created ${clusters.size} clusters`);
    }

    // Update database with cluster IDs
    console.log('\n💾 Updating database with cluster assignments...');

    let updateCount = 0;
    for (const [clusterId, errorIds] of clusters.entries()) {
      // Real error_events rows already carry a valid kind/severity from ingestion (real
      // Postgres enum values: error_kind = runtime|api|other, error_severity =
      // info|warn|error|critical). FIXED 2026-09-14 (PHASE78-LIVE-PROPOSAL-NO-PERSIST-01 bug
      // #6): the old code called inferClusterKind()/normalizeSeverity() to invent a DIFFERENT
      // taxonomy (typing/nullability/import/svelte-rune/... and info/warn/error/FATAL) that
      // does not match either real enum -- 'fatal' is not a valid error_severity value, and
      // none of inferClusterKind()'s outputs are valid error_kind values. Use the real,
      // already-correct enum values straight off the representative event instead of
      // re-deriving a fictional one. inferClusterKind()/normalizeSeverity() are no longer
      // called here but kept in the file (unused) rather than deleted, since removing them
      // is a separate decision from fixing this call site.
      const firstErrorId = errorIds[0];
      const firstError = errors.find(e => e.id === firstErrorId);
      if (!firstError) {
        console.warn(`   ⚠️  Cluster ${clusterId}: no representative error found, skipping`);
        continue;
      }
      const clusterKind = firstError.kind;
      const clusterSeverity = firstError.severity;
      const routePaths = [...new Set(errorIds.map(id => errors.find(e => e.id === id)?.routePath).filter((v): v is string => Boolean(v)))];

      console.log(`   🔍 Cluster ${clusterId}: kind="${clusterKind}", severity="${clusterSeverity}", members=${errorIds.length}`);
      if (isVerbose) {
        console.log(`      First error: tsCode="${firstError.tsCode}", message="${firstError.message.substring(0, 60)}..."`);
      }

      // Insert cluster record -- let Postgres generate the real uuid (defaultRandom()) rather
      // than fabricating a non-uuid string like `cluster-${clusterId}` (bug #6 also included
      // this -- errorClustersTable.id is uuid, a plain "cluster-0" string would fail at the DB
      // level with 'invalid input syntax for type uuid'). Capture the real id via .returning()
      // so the per-event update below references the actual FK target.
      const [insertedCluster] = await db
        .insert(errorClustersTable)
        .values({
          kind: clusterKind,
          severity: clusterSeverity,
          pattern: firstError.message.slice(0, 500),
          errorCount: errorIds.length,
          routePaths,
          lastUpdated: new Date(),
          createdAt: new Date(),
        })
        .returning({ id: errorClustersTable.id });
      const realClusterId = insertedCluster.id;

      for (const errorId of errorIds) {
        await db
          .update(errorEventsTable)
          .set({ clusterId: realClusterId })
          .where(sql`id = ${errorId}`);
        updateCount++;
      }
    }

    if (isVerbose) {
      console.log(`   ✅ Updated ${updateCount} error records`);
    }

    // Summary
    console.log('\n📈 Clustering Summary:');
    console.log(`   Total errors processed: ${embeddings.length}`);
    console.log(`   Clusters created: ${clusters.size}`);
    const avgSize = Math.round(embeddings.length / clusters.size);
    console.log(`   Average cluster size: ${avgSize}`);

    // Show cluster distribution
    const sizes = Array.from(clusters.values()).map(ids => ids.length).sort((a, b) => b - a);
    console.log(`   Largest cluster: ${sizes[0]} errors`);
    console.log(`   Smallest cluster: ${sizes[sizes.length - 1]} errors`);

    console.log('\n✅ Phase 78 clustering completed');
    console.log('   Next: npm run phase78:suggest');

  } catch (err) {
    console.error('❌ Clustering failed:', err);
    process.exit(1);
  } finally {
    await client.end();
  }
}

clusterErrors();
