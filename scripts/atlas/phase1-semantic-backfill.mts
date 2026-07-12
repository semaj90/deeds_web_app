#!/usr/bin/env node
/**
 * Phase 1: Semantic Layer Backfill — Gemma4 Summaries
 *
 * Purpose: Backfill atlas_feature_envelopes.summary_text (Gemma4 grounded summaries)
 * Current: 4,182 / 58,365 (7.2%)
 * Target: 85%+ (50K packets)
 *
 * Time: ~2-3 hours (Gemma4 inference @ 1-2 sec per summary)
 * Strategy: Batch inference, cache-enabled, deterministic prompts
 */

import { bifrostChat } from '$lib/server/ollama.js';
import { eq, isNull } from 'drizzle-orm';
import { db } from '$lib/server/db/client.js';
import { atlasFeatureEnvelopes } from '$lib/server/db/schema-postgres.js';

// ============================================================================
// Build AST Context (grounding constraint)
// ============================================================================

function buildAstContext(treeNodeIds: any): string {
  if (!treeNodeIds) return '(no AST symbols)';

  if (typeof treeNodeIds === 'string') {
    try {
      treeNodeIds = JSON.parse(treeNodeIds);
    } catch {
      return '(malformed AST)';
    }
  }

  if (!Array.isArray(treeNodeIds)) return '(invalid AST)';

  const symbols = treeNodeIds.slice(0, 10).map((node: any) => {
    const kind = node.kind || 'unknown';
    const name = node.name || '?';
    const line = node.line ? `:${node.line}` : '';
    return `  - ${kind}: ${name}${line}`;
  });

  return symbols.join('\n');
}

// ============================================================================
// Validate Grounding (does summary reference ≥1 AST symbol?)
// ============================================================================

function validateGrounding(summary: string, treeNodeIds: any): number {
  if (!summary || !treeNodeIds) return 0.0;

  if (typeof treeNodeIds === 'string') {
    try {
      treeNodeIds = JSON.parse(treeNodeIds);
    } catch {
      return 0.0;
    }
  }

  if (!Array.isArray(treeNodeIds)) return 0.0;

  let mentioned = 0;

  for (const node of treeNodeIds.slice(0, 15)) {
    if (node.name && summary.toLowerCase().includes(node.name.toLowerCase())) {
      mentioned++;
    }
  }

  // Confidence: (mentioned / total_symbols) * relevance_factor
  // If ≥1 symbol mentioned and summary mentions "function", "class", "component", etc.
  const relevanceBoost =
    summary.match(/function|class|component|interface|route|endpoint/i) ? 1.1 : 0.9;

  return Math.min(1.0, (mentioned / Math.max(1, treeNodeIds.length)) * relevanceBoost);
}

// ============================================================================
// Backfill Loop
// ============================================================================

async function backfillSemanticLayer(options: {
  batchSize?: number;
  maxPackets?: number;
  dryRun?: boolean;
  verbose?: boolean;
}) {
  const { batchSize = 100, maxPackets = 50000, dryRun = false, verbose = true } = options;

  if (verbose) {
    console.log(`
    ╔════════════════════════════════════════╗
    ║ Semantic Layer Backfill (Gemma4)       ║
    ║ Target: ${maxPackets.toString().padEnd(27)}│
    ║ Batch Size: ${batchSize.toString().padEnd(24)}│
    ║ Mode: ${dryRun ? 'DRY-RUN' : 'APPLY  '} │
    ╚════════════════════════════════════════╝
    `);
  }

  // Load packets missing summaries (7.2% → 85% target)
  const packetsToBackfill = await db
    .select()
    .from(atlasFeatureEnvelopes)
    .where(isNull(atlasFeatureEnvelopes.summary_text))
    .limit(maxPackets);

  if (verbose) {
    console.log(`\n📦 Loading ${packetsToBackfill.length} packets for backfill...`);
  }

  let processedCount = 0;
  let successCount = 0;
  let failureCount = 0;
  const startTime = Date.now();

  // Process in batches
  for (let i = 0; i < packetsToBackfill.length; i += batchSize) {
    const batch = packetsToBackfill.slice(i, i + batchSize);
    const batchNum = Math.floor(i / batchSize) + 1;
    const totalBatches = Math.ceil(packetsToBackfill.length / batchSize);

    if (verbose) {
      console.log(`\n[${batchNum}/${totalBatches}] Processing batch of ${batch.length} packets...`);
    }

    for (const packet of batch) {
      try {
        // (1) Build grounding context from AST
        const astContext = buildAstContext(packet.tree_node_ids);

        // (2) Prompt Gemma4 with hard constraint: only reference AST
        const prompt = `Given this code structure:
${astContext}

Provide a 1-2 sentence summary of what this code does.
CONSTRAINT: Only reference symbols and concepts present in the structure above.
Do NOT invent capabilities, imports, or features not shown.
`;

        if (!dryRun) {
          // (3) Call Gemma4 via bifrostChat (cache-enabled)
          const response = await bifrostChat(
            [{ role: 'user', content: prompt }],
            'gemma4-rotorquant:latest',
            {
              temperature: 0.3,
              maxTokens: 200,
              cache_prompt: true,
            }
          );

          const summary = response.content?.trim() || '';

          // (4) Validate grounding
          const groundingScore = validateGrounding(summary, packet.tree_node_ids);

          // (5) Write to Postgres
          if (summary.length > 10) {
            await db
              .update(atlasFeatureEnvelopes)
              .set({
                summary_text: summary,
                summary_grounding_score: groundingScore,
                updated_at: new Date(),
              })
              .where(eq(atlasFeatureEnvelopes.packet_key, packet.packet_key));

            successCount++;

            if (verbose && successCount % 50 === 0) {
              const elapsed = Date.now() - startTime;
              const rate = (successCount / elapsed) * 1000;
              const eta = ((packetsToBackfill.length - successCount) / rate) / 60;
              console.log(
                `   ✅ ${successCount}/${packetsToBackfill.length} (${rate.toFixed(1)} pkt/s, ETA ${eta.toFixed(0)}m)`
              );
            }
          }
        } else {
          // Dry-run: just show what we'd do
          if (verbose && successCount % 50 === 0) {
            console.log(`   [DRY-RUN] Would summarize packet ${packet.packet_key}`);
          }
          successCount++;
        }

        processedCount++;
      } catch (err) {
        failureCount++;
        if (verbose) {
          console.error(`   ❌ Failed to process ${packet.packet_key}: ${err}`);
        }
      }
    }
  }

  const elapsed = ((Date.now() - startTime) / 1000 / 60).toFixed(1);

  if (verbose) {
    console.log(`
    ╔════════════════════════════════════════╗
    ║ Summary                                ║
    ║ Processed: ${successCount.toString().padEnd(27)}│
    ║ Succeeded: ${successCount.toString().padEnd(27)}│
    ║ Failed: ${failureCount.toString().padEnd(30)}│
    ║ Time: ${elapsed}m${' '.repeat(28 - elapsed.length)}│
    ║ Mode: ${dryRun ? 'DRY-RUN' : 'APPLY  '} │
    ╚════════════════════════════════════════╝
    `);
  }

  return { processedCount, successCount, failureCount };
}

// ============================================================================
// CLI Entry Point
// ============================================================================

const args = process.argv.slice(2);
const options = {
  batchSize: parseInt(args.find(a => a.startsWith('--batch='))?.split('=')[1] ?? '100'),
  maxPackets: parseInt(args.find(a => a.startsWith('--max='))?.split('=')[1] ?? '50000'),
  dryRun: args.includes('--dry-run') || !args.includes('--apply'),
  verbose: !args.includes('--quiet'),
};

backfillSemanticLayer(options)
  .then(result => {
    console.log(`\n✅ Semantic backfill complete: ${result.successCount}/${result.processedCount}`);
    process.exit(0);
  })
  .catch(err => {
    console.error(`❌ Error:`, err);
    process.exit(1);
  });
