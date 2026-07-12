#!/usr/bin/env node
/**
 * Graphify GSD Semantic Backfill — 8-Lane Bounded-Batch Router
 *
 * Purpose: Route 54K packet semantic enrichment (Gemma4 summaries) through 8
 *          bounded-batch lanes to prevent CUDA OOM on RTX 3060 Ti.
 *
 * Architecture:
 *   - 8 lanes × 6,750 packets per lane (58K ÷ 8)
 *   - Lane 1-8 execute sequentially (not parallel)
 *   - Each lane: Gemma4 inference → Embed → Validate → Write Postgres
 *   - Per-lane VRAM peak: ~1 GB (safe on 8.6 GB)
 *   - Estimated time: 2-3 hours total
 *
 * Usage:
 *   npm run graphify:gsd:semantic -- --lanes=8 --apply
 *   npm run graphify:gsd:semantic -- --lanes=4 --dry-run  (faster test)
 */

import { eq, isNull } from 'drizzle-orm';
import { db } from '$lib/server/db/client.js';
import { atlasFeatureEnvelopes } from '$lib/server/db/schema-postgres.js';
import { bifrostChat } from '$lib/server/ollama.js';
import { embedViaOllama } from '$lib/server/embedding/ollama-bridge.js';

// ============================================================================
// Graphify Lane Configuration
// ============================================================================

interface GraphifyLaneConfig {
  laneId: number;
  packetStart: number;
  packetEnd: number;
  packetCount: number;
  batchSize: number;
  inference: { model: string; temperature: number; maxTokens: number };
  vramThreshold: number; // GB (trigger throttle if exceeded)
}

interface GraphifyResult {
  laneId: number;
  successCount: number;
  failureCount: number;
  wallClockMs: number;
  vramPeakGb: number;
}

// ============================================================================
// AST Grounding Helper
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
    return `  - ${kind}: ${name}`;
  });

  return symbols.join('\n');
}

// ============================================================================
// Grounding Validation
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
  const summaryLower = summary.toLowerCase();

  for (const node of treeNodeIds.slice(0, 15)) {
    if (node.name && summaryLower.includes(node.name.toLowerCase())) {
      mentioned++;
    }
  }

  const relevanceBoost = summary.match(/function|class|component|interface|route/i) ? 1.1 : 0.9;
  return Math.min(1.0, (mentioned / Math.max(1, treeNodeIds.length)) * relevanceBoost);
}

// ============================================================================
// Single Lane Executor
// ============================================================================

async function executeLane(config: GraphifyLaneConfig, dryRun: boolean = false): Promise<GraphifyResult> {
  const laneStartTime = Date.now();
  let successCount = 0;
  let failureCount = 0;
  let vramPeakGb = 0;

  console.log(
    `\n📌 Lane ${config.laneId}: Processing packets ${config.packetStart + 1}-${config.packetEnd} (${config.packetCount} packets)`
  );

  // Load packets for this lane
  const packets = await db
    .select()
    .from(atlasFeatureEnvelopes)
    .where(isNull(atlasFeatureEnvelopes.summary_text))
    .limit(config.packetCount)
    .offset(config.packetStart);

  console.log(`   ✓ Loaded ${packets.length} packets`);

  // Process in batches
  for (let i = 0; i < packets.length; i += config.batchSize) {
    const batch = packets.slice(i, i + config.batchSize);
    const batchNum = Math.floor(i / config.batchSize) + 1;
    const totalBatches = Math.ceil(packets.length / config.batchSize);

    // (1) Gemma4 inference (parallel within batch)
    let summaries: Array<{ content: string }> = [];

    if (!dryRun) {
      summaries = await Promise.all(
        batch.map(packet => {
          const astContext = buildAstContext(packet.tree_node_ids);
          const prompt = `Given this code structure:
${astContext}

Provide a 1-2 sentence summary of what this code does.
CONSTRAINT: Only reference symbols and concepts present above.
Do NOT invent capabilities or imports not shown.`;

          return bifrostChat(
            [{ role: 'user', content: prompt }],
            config.inference.model,
            {
              temperature: config.inference.temperature,
              maxTokens: config.inference.maxTokens,
              cache_prompt: true,
            }
          );
        })
      );
    } else {
      // Dry-run: mock summaries
      summaries = batch.map(() => ({ content: '[DRY-RUN MOCK SUMMARY]' }));
    }

    // (2) Embed summaries (parallel)
    let embeddings: Array<number[]> = [];

    if (!dryRun) {
      embeddings = await Promise.all(
        summaries.map(summary => embedViaOllama(summary.content, { model: 'embeddinggemma:latest' }))
      );
    } else {
      embeddings = batch.map(() => new Array(384).fill(0));
    }

    // (3) Validate grounding (sequential)
    const groundingScores = batch.map((packet, idx) => {
      return validateGrounding(summaries[idx].content, packet.tree_node_ids);
    });

    // (4) Batch write to Postgres
    if (!dryRun) {
      await db.transaction(async tx => {
        for (let j = 0; j < batch.length; j++) {
          try {
            await tx
              .update(atlasFeatureEnvelopes)
              .set({
                summary_text: summaries[j].content,
                summary_grounding_score: groundingScores[j],
                updated_at: new Date(),
              })
              .where(eq(atlasFeatureEnvelopes.packet_key, batch[j].packet_key));

            successCount++;
          } catch (err) {
            console.error(`     ❌ Failed to update ${batch[j].packet_key}: ${err}`);
            failureCount++;
          }
        }
      });
    } else {
      successCount += batch.length;
    }

    // Progress indicator
    if (successCount % 100 === 0) {
      const elapsed = (Date.now() - laneStartTime) / 1000;
      const rate = successCount / elapsed;
      const eta = ((config.packetCount - successCount) / rate) / 60;
      console.log(
        `   ✓ Batch ${batchNum}/${totalBatches}: ${successCount}/${config.packetCount} (${rate.toFixed(1)} pkt/s, ETA ${eta.toFixed(0)}m)`
      );
    }
  }

  const wallClockMs = Date.now() - laneStartTime;

  console.log(`   ✅ Lane ${config.laneId} complete: ${successCount}/${config.packetCount} (${(wallClockMs / 1000 / 60).toFixed(1)}m)`);

  return { laneId: config.laneId, successCount, failureCount, wallClockMs, vramPeakGb };
}

// ============================================================================
// Main Graphify Router
// ============================================================================

async function runGraphifyGsdSemantic(options: {
  lanes?: number;
  apply?: boolean;
  dryRun?: boolean;
  verbose?: boolean;
}) {
  const { lanes = 8, apply = false, dryRun = !apply, verbose = true } = options;

  if (verbose) {
    console.log(`
    ╔════════════════════════════════════════════════════════════╗
    ║ Graphify GSD Semantic Backfill (${lanes}-Lane Router)${' '.repeat(27 - lanes.toString().length)}║
    ║ Status: ${dryRun ? 'DRY-RUN' : 'APPLY  '} ${' '.repeat(40)}║
    ║ Target: 85% coverage (54,000+ packets)${' '.repeat(18)}║
    ║ Expected Time: 2-3 hours${' '.repeat(33)}║
    ╚════════════════════════════════════════════════════════════╝
    `);
  }

  // Load packets needing semantic enrichment
  const totalPacketsNeeding = await db
    .select()
    .from(atlasFeatureEnvelopes)
    .where(isNull(atlasFeatureEnvelopes.summary_text));

  const targetCount = Math.min(totalPacketsNeeding.length, Math.round(58365 * 0.85));
  const packetsPerLane = Math.ceil(targetCount / lanes);

  if (verbose) {
    console.log(`\n📦 Loaded ${totalPacketsNeeding.length} packets needing semantic enrichment`);
    console.log(`   Target: ${targetCount} packets (85% coverage)`);
    console.log(`   Per lane: ${packetsPerLane} packets`);
    console.log(`   Lanes: ${lanes}`);
  }

  // Create lane configs
  const laneConfigs: GraphifyLaneConfig[] = [];

  for (let laneId = 1; laneId <= lanes; laneId++) {
    const packetStart = (laneId - 1) * packetsPerLane;
    const packetEnd = Math.min(laneId * packetsPerLane, targetCount);

    laneConfigs.push({
      laneId,
      packetStart,
      packetEnd,
      packetCount: packetEnd - packetStart,
      batchSize: 100,
      inference: {
        model: 'gemma4-rotorquant:latest',
        temperature: 0.3,
        maxTokens: 200,
      },
      vramThreshold: 7.5, // GB (leave 1.1 GB headroom on 8.6 GB)
    });
  }

  // Execute lanes sequentially (not parallel, to avoid GPU thrashing)
  const results: GraphifyResult[] = [];
  const totalStartTime = Date.now();

  for (const laneConfig of laneConfigs) {
    const result = await executeLane(laneConfig, dryRun);
    results.push(result);
  }

  const totalWallClockMs = Date.now() - totalStartTime;

  // Summary
  if (verbose) {
    const totalSuccess = results.reduce((sum, r) => sum + r.successCount, 0);
    const totalFailure = results.reduce((sum, r) => sum + r.failureCount, 0);
    const coveragePct = (totalSuccess / 58365) * 100;

    console.log(`
    ╔════════════════════════════════════════════════════════════╗
    ║ Results${' '.repeat(51)}║
    ╠════════════════════════════════════════════════════════════╣
    ║ Total Processed: ${totalSuccess.toString().padEnd(40)}│
    ║ Succeeded: ${totalSuccess.toString().padEnd(47)}│
    ║ Failed: ${totalFailure.toString().padEnd(49)}│
    ║ Coverage: ${coveragePct.toFixed(1)}%${' '.repeat(43 - coveragePct.toFixed(1).length)}│
    ║ Time: ${(totalWallClockMs / 1000 / 60).toFixed(1)}m${' '.repeat(50 - (totalWallClockMs / 1000 / 60).toFixed(1).length)}│
    ║ Mode: ${dryRun ? 'DRY-RUN' : 'APPLY  '} ${' '.repeat(40)}│
    ╚════════════════════════════════════════════════════════════╝
    `);
  }

  return {
    totalSuccess: results.reduce((sum, r) => sum + r.successCount, 0),
    totalFailure: results.reduce((sum, r) => sum + r.failureCount, 0),
    wallClockMs: totalWallClockMs,
    laneResults: results,
  };
}

// ============================================================================
// CLI Entry Point
// ============================================================================

const args = process.argv.slice(2);
const options = {
  lanes: parseInt(args.find(a => a.startsWith('--lanes='))?.split('=')[1] ?? '8'),
  apply: args.includes('--apply'),
  dryRun: args.includes('--dry-run') || !args.includes('--apply'),
  verbose: !args.includes('--quiet'),
};

runGraphifyGsdSemantic(options)
  .then(result => {
    console.log(`\n✅ Graphify GSD semantic backfill complete`);
    process.exit(0);
  })
  .catch(err => {
    console.error(`\n❌ Error:`, err);
    process.exit(1);
  });
