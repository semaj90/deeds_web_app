#!/usr/bin/env npx tsx
/**
 * Phase 110 Representation Registry Initialization and Phase 1 Probing
 *
 * Executes all preparatory steps:
 * - Phase 0: Verify migration 0152 has been applied
 * - Phase 1: Probe all representations at runtime and update STATIC_VERIFIED status
 *
 * Usage:
 *   npx tsx scripts/atlas/phase110-init-and-probe.mts [--dry-run]
 */

import { db } from '../../src/lib/server/db/client.js';
import {
  atlasRepresentations,
  atlasRepresentationProviders,
} from '../../src/lib/server/db/schema-postgres.js';
import { eq } from 'drizzle-orm';
import * as readline from 'readline';

const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function log(msg: string) {
  console.log(`[Phase110] ${msg}`);
}

function logError(msg: string) {
  console.error(`[Phase110 ERROR] ${msg}`);
}

function logWarn(msg: string) {
  console.warn(`[Phase110 WARN] ${msg}`);
}

async function question(prompt: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(prompt, resolve);
  });
}

async function phase0VerifyMigration(): Promise<boolean> {
  log('Phase 0: Verifying migration 0152 has been applied...');

  try {
    const result = await db
      .select()
      .from(atlasRepresentations)
      .limit(1);

    if (!result.length) {
      logWarn('No representations found. Migration may not have been applied.');
      return false;
    }

    log('✓ Migration 0152 detected. Representation table exists with seed data.');
    return true;
  } catch (err) {
    logError(`Migration check failed: ${err instanceof Error ? err.message : String(err)}`);
    return false;
  }
}

async function phase1ProbeRepresentations(): Promise<{
  probed: number;
  failed: number;
  errors: Array<{ id: string; error: string }>;
}> {
  log('Phase 1: Probing representations at runtime...');

  const representations = await db.select().from(atlasRepresentations);
  log(`Found ${representations.length} representations to probe.`);

  let probed = 0;
  let failed = 0;
  const errors: Array<{ id: string; error: string }> = [];

  for (const rep of representations) {
    log(`\n  Probing ${rep.representation_id}...`);
    log(`    Upstream: ${rep.upstream_model_id} (rev: ${rep.upstream_revision})`);
    log(`    Dimensions: ${rep.native_dimensions} → ${rep.output_dimensions} (${rep.dimension_method})`);
    log(`    Runtime: ${rep.runtime}`);

    try {
      // Get preferred provider for this representation
      const provider = await db
        .select()
        .from(atlasRepresentationProviders)
        .where(
          eq(atlasRepresentationProviders.representation_id, rep.representation_id)
        )
        .limit(1);

      if (!provider.length) {
        logWarn(`  No provider configured for ${rep.representation_id}. Skipping.`);
        errors.push({
          id: rep.representation_id,
          error: 'No provider configured',
        });
        failed++;
        continue;
      }

      const prov = provider[0];
      log(`    Provider: ${prov.endpoint_url} (${prov.runtime_engine})`);

      // Probe endpoint
      let actualDimensions: number | null = null;
      let normStatus = 'NONE';

      if (prov.runtime_engine === 'ollama') {
        try {
          const response = await fetch(`${prov.endpoint_url}/api/embeddings`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model: prov.model_alias || rep.upstream_model_id,
              prompt: 'test embedding probe',
            }),
            signal: AbortSignal.timeout(10_000),
          });

          if (response.ok) {
            const data = (await response.json()) as { embedding?: number[] };
            actualDimensions = data.embedding?.length || null;

            if (data.embedding) {
              const norm = Math.sqrt(data.embedding.reduce((s, x) => s + x * x, 0));
              normStatus = Math.abs(norm - 1.0) < 0.1 ? 'L2' : 'NONE';
              log(`    Probed OK: ${actualDimensions}-dim, norm=${normStatus}`);
            }
          } else {
            logWarn(`    Probe failed: HTTP ${response.status}`);
            errors.push({
              id: rep.representation_id,
              error: `HTTP ${response.status} from ${prov.endpoint_url}`,
            });
            failed++;
            continue;
          }
        } catch (err) {
          logWarn(`    Probe failed: ${err instanceof Error ? err.message : String(err)}`);
          errors.push({
            id: rep.representation_id,
            error: err instanceof Error ? err.message : String(err),
          });
          failed++;
          continue;
        }
      } else {
        logWarn(`    Engine ${prov.runtime_engine} not yet supported. Skipping.`);
        errors.push({
          id: rep.representation_id,
          error: `Probing not implemented for ${prov.runtime_engine}`,
        });
        failed++;
        continue;
      }

      // Verify dimensions match
      if (actualDimensions !== rep.output_dimensions) {
        logError(
          `    Dimension mismatch: expected ${rep.output_dimensions}, got ${actualDimensions}`,
        );
        errors.push({
          id: rep.representation_id,
          error: `Dimension mismatch: expected ${rep.output_dimensions}, got ${actualDimensions}`,
        });
        failed++;
        continue;
      }

      // Update representation status
      if (!isDryRun) {
        await db
          .update(atlasRepresentations)
          .set({
            verification_status: 'STATIC_VERIFIED',
            verified_at: new Date(),
            verified_by: 'phase110:probe:automated',
            verified_method: `${prov.runtime_engine}:endpoint_health_check`,
            last_verified_output_norm: normStatus === 'L2' ? 1.0 : 0.0,
            updated_at: new Date(),
          })
          .where(eq(atlasRepresentations.representation_id, rep.representation_id));

        log(`    ✓ Updated to STATIC_VERIFIED`);
      } else {
        log(`    [DRY-RUN] Would update to STATIC_VERIFIED`);
      }

      probed++;
    } catch (err) {
      logError(`Exception during probe: ${err instanceof Error ? err.message : String(err)}`);
      errors.push({
        id: rep.representation_id,
        error: err instanceof Error ? err.message : String(err),
      });
      failed++;
    }
  }

  return { probed, failed, errors };
}

async function main(): Promise<void> {
  log('═'.repeat(80));
  log('PHASE 110: REPRESENTATION REGISTRY INITIALIZATION AND RUNTIME PROBING');
  log('═'.repeat(80));

  if (isDryRun) {
    log('Running in DRY-RUN mode. No database changes will be made.');
  }

  // Phase 0: Verify migration
  const phase0Ok = await phase0VerifyMigration();
  if (!phase0Ok) {
    logError('Phase 0 failed. Please run: npm run drizzle:migrate');
    process.exit(1);
  }

  log('\n✓ Phase 0 COMPLETE');

  // Phase 1: Probe representations
  log('\n' + '─'.repeat(80));
  const phase1Result = await phase1ProbeRepresentations();

  log('\n' + '─'.repeat(80));
  log('Phase 1 Summary:');
  log(`  Probed: ${phase1Result.probed}`);
  log(`  Failed: ${phase1Result.failed}`);

  if (phase1Result.errors.length > 0) {
    log('\nErrors:');
    for (const err of phase1Result.errors) {
      log(`  - ${err.id}: ${err.error}`);
    }
  }

  if (phase1Result.probed > 0 && phase1Result.failed === 0) {
    log('\n✓ Phase 1 COMPLETE (all representations verified)');
  } else if (phase1Result.probed > 0) {
    logWarn(`\n⚠ Phase 1 PARTIAL (${phase1Result.probed}/${phase1Result.probed + phase1Result.failed} verified)`);
  } else {
    logError('\n✗ Phase 1 FAILED (no representations probed)');
    process.exit(1);
  }

  // Summary
  log('\n' + '═'.repeat(80));
  log('NEXT STEPS:');
  log('1. Phase 2 (Paired Output Testing): npm run phase110:paired-output:test');
  log('2. Phase 4 (Qdrant Audit): npm run atlas:audit:qdrant-representations');
  log('3. Phase 5 (Retrieval Ablation): npm run phase110:retrieval:ablation');
  log('═'.repeat(80));

  rl.close();
  process.exit(phase1Result.failed > 0 ? 1 : 0);
}

main().catch((err) => {
  logError(`Unhandled error: ${err instanceof Error ? err.message : String(err)}`);
  rl.close();
  process.exit(1);
});
