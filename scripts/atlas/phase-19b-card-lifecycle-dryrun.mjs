#!/usr/bin/env node

/**
 * Phase 19B: Atlas Card Lifecycle Dry-Run
 *
 * Reads outcome-ledger.ndjson and generates reward aggregates by:
 * 1. Tool performance (which tools consistently produce rewards)
 * 2. SourceRef performance (which memory cards are most valuable)
 * 3. Cluster performance (which clusters drive decisions)
 *
 * Dry-run only: no Redis/DB/Qdrant writes
 *
 * Outputs:
 * - memory/rewards/tool-performance.json
 * - memory/rewards/sourceRef-performance.json
 * - memory/rewards/cluster-performance.json
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const OUTCOME_LEDGER_PATH = path.join(REPO_ROOT, '.opencode/outcome-ledger.ndjson');
const REWARDS_DIR = path.join(REPO_ROOT, 'memory/rewards');

// Ensure output directory exists
if (!fs.existsSync(REWARDS_DIR)) {
  fs.mkdirSync(REWARDS_DIR, { recursive: true });
  console.log(`✅ Created ${REWARDS_DIR}`);
}

/**
 * AtlasCard Schema (for reference)
 */
const AtlasCardSchema = {
  id: 'uuid',
  sourceRef: 'string (qdrant:chunk:123 | neo4j:node:456)',
  graphVersion: 'string (2026-05-29-12h)',
  authority: 'number 0-1',
  reward: 'number 0-1 cumulative',
  cluster: 'number SOM cluster',
  som: '[number, number] grid position',
  promotionState: 'fresh | engaged | warm | hot | archived',
  retentionClass: 'transient | warm | cold | permanent',
  usageCount: 'number lifetime uses',
  rewardCount: 'number times rewarded',
  lastUsedAt: 'ISO timestamp',
  createdAt: 'ISO timestamp'
};

/**
 * Promotion Decision Rules
 */
const PromotionRules = {
  fresh: {
    trigger: 'created',
    usageThreshold: 0,
    rewardThreshold: 0,
    ttl: 'infinite',
    lruPriority: 'low',
    nextState: 'engaged'
  },
  engaged: {
    trigger: 'uses > 3',
    usageThreshold: 3,
    rewardThreshold: 0,
    ttl: 'infinite',
    lruPriority: 'medium',
    nextState: 'warm'
  },
  warm: {
    trigger: 'reward > 0.6',
    usageThreshold: 0,
    rewardThreshold: 0.6,
    ttl: '7 days',
    lruPriority: 'high',
    nextState: 'hot'
  },
  hot: {
    trigger: 'reuse > 80%',
    usageThreshold: 0,
    rewardThreshold: 0,
    ttl: '30 days',
    lruPriority: 'critical',
    nextState: 'archived'
  },
  archived: {
    trigger: '30 days unused',
    usageThreshold: 0,
    rewardThreshold: 0,
    ttl: 'cold-storage',
    lruPriority: 'evict',
    nextState: null
  }
};

/**
 * Outcome Event Types
 */
const OutcomeEventTypes = {
  TOOL_CALL: 'tool_call',        // { tool, result: ok|fail, durationMs }
  TOOL_SUCCESS: 'tool_success',  // { tool, artifact }
  DWELL: 'dwell',                // { duration, section }
  REWARD: 'reward',              // { delta, reason }
  PROMOTION: 'promotion',        // { cardId, state }
  INVALIDATION: 'invalidation'   // { cardId }
};

/**
 * Parse outcome-ledger.ndjson
 */
function readOutcomeLedger() {
  if (!fs.existsSync(OUTCOME_LEDGER_PATH)) {
    console.log(`⚠️  No outcome ledger at ${OUTCOME_LEDGER_PATH}`);
    return [];
  }

  try {
    const content = fs.readFileSync(OUTCOME_LEDGER_PATH, 'utf-8');
    const events = content
      .split('\n')
      .filter(line => line.trim())
      .map(line => JSON.parse(line));
    return events;
  } catch (err) {
    console.error(`❌ Failed to parse outcome ledger: ${err.message}`);
    return [];
  }
}

/**
 * Aggregate rewards by tool
 * @param {Array} events
 * @returns {Object} tool -> { callCount, successCount, avgReward, sources }
 */
function aggregateByTool(events) {
  const toolStats = {};

  for (const event of events) {
    if (!event.tool) continue;

    const tool = event.tool;

    if (!toolStats[tool]) {
      toolStats[tool] = {
        tool,
        callCount: 0,
        recommendationAcceptedCount: 0,
        totalReward: 0,
        sourceRefs: new Set(),
        graphVersion: event.graphVersion || 'unknown'
      };
    }

    toolStats[tool].callCount += 1;

    if (event.recommendationAccepted) {
      toolStats[tool].recommendationAcceptedCount += 1;
    }

    if (event.reward) {
      toolStats[tool].totalReward += event.reward;
    }

    if (Array.isArray(event.sourceRefs)) {
      event.sourceRefs.forEach(ref => toolStats[tool].sourceRefs.add(ref));
    } else if (event.sourceRef) {
      toolStats[tool].sourceRefs.add(event.sourceRef);
    }
  }

  // Convert Sets to arrays and compute averages
  const result = {};
  for (const [tool, stats] of Object.entries(toolStats)) {
    result[tool] = {
      tool: stats.tool,
      callCount: stats.callCount,
      recommendationAcceptedCount: stats.recommendationAcceptedCount,
      acceptanceRate: stats.callCount > 0 ? stats.recommendationAcceptedCount / stats.callCount : 0,
      avgReward: stats.callCount > 0 ? stats.totalReward / stats.callCount : 0,
      totalReward: stats.totalReward,
      sourceRefCount: stats.sourceRefs.size,
      graphVersion: stats.graphVersion,
      lastUpdated: new Date().toISOString()
    };
  }

  return result;
}

/**
 * Aggregate rewards by sourceRef
 * @param {Array} events
 * @returns {Object} sourceRef -> { usageCount, rewardCount, avgReward, tools }
 */
function aggregateBySourceRef(events) {
  const sourceStats = {};

  for (const event of events) {
    // Handle both sourceRef (single) and sourceRefs (array)
    const refs = Array.isArray(event.sourceRefs) ? event.sourceRefs : (event.sourceRef ? [event.sourceRef] : []);

    for (const sourceRef of refs) {
      if (!sourceStats[sourceRef]) {
        sourceStats[sourceRef] = {
          sourceRef,
          usageCount: 0,
          rewardCount: 0,
          totalReward: 0,
          tools: new Set(),
          graphVersion: event.graphVersion || 'unknown',
          authority: event.authority || 0
        };
      }

      sourceStats[sourceRef].usageCount += 1;

      if (event.reward && event.reward > 0) {
        sourceStats[sourceRef].rewardCount += 1;
        sourceStats[sourceRef].totalReward += event.reward;
      }

      if (event.tool) {
        sourceStats[sourceRef].tools.add(event.tool);
      }
    }
  }

  // Compute promotion state
  const result = {};
  for (const [sourceRef, stats] of Object.entries(sourceStats)) {
    let promotionState = 'fresh';
    if (stats.usageCount > 3) promotionState = 'engaged';
    if (stats.totalReward > 0.6) promotionState = 'warm';
    if (stats.usageCount > 0 && stats.rewardCount / stats.usageCount > 0.8) promotionState = 'hot';

    result[sourceRef] = {
      sourceRef: stats.sourceRef,
      usageCount: stats.usageCount,
      rewardCount: stats.rewardCount,
      rewardRate: stats.usageCount > 0 ? stats.rewardCount / stats.usageCount : 0,
      avgReward: stats.usageCount > 0 ? stats.totalReward / stats.usageCount : 0,
      totalReward: stats.totalReward,
      promotionState,
      authority: stats.authority,
      toolCount: stats.tools.size,
      graphVersion: stats.graphVersion,
      lastUpdated: new Date().toISOString()
    };
  }

  return result;
}

/**
 * Aggregate rewards by cluster
 * @param {Array} events
 * @returns {Object} cluster -> { cardCount, avgReward, promotionStates }
 */
function aggregateByCluster(events) {
  // For now, clusters are not in the outcome ledger structure
  // Return empty stats (can be populated when cluster data is added to events)
  return {};
}

/**
 * Main
 */
async function main() {
  console.log('🚀 Phase 19B: Atlas Card Lifecycle Dry-Run\n');
  console.log(`📖 Reading outcome ledger from ${OUTCOME_LEDGER_PATH}`);

  const events = readOutcomeLedger();
  console.log(`✅ Loaded ${events.length} outcome events\n`);

  if (events.length === 0) {
    console.log('⚠️  No events in outcome ledger. Generating empty aggregates.\n');
  }

  // Aggregate by tool
  console.log('📊 Aggregating by tool...');
  const toolPerf = aggregateByTool(events);
  const toolCount = Object.keys(toolPerf).length;
  console.log(`   ✅ ${toolCount} tools tracked`);

  // Aggregate by sourceRef
  console.log('📊 Aggregating by sourceRef...');
  const sourceRefPerf = aggregateBySourceRef(events);
  const sourceRefCount = Object.keys(sourceRefPerf).length;
  console.log(`   ✅ ${sourceRefCount} source references tracked`);

  // Aggregate by cluster
  console.log('📊 Aggregating by cluster...');
  const clusterPerf = aggregateByCluster(events);
  const clusterCount = Object.keys(clusterPerf).length;
  console.log(`   ✅ ${clusterCount} clusters tracked\n`);

  // Write outputs (dry-run safe)
  const toolPath = path.join(REWARDS_DIR, 'tool-performance.json');
  const sourceRefPath = path.join(REWARDS_DIR, 'sourceRef-performance.json');
  const clusterPath = path.join(REWARDS_DIR, 'cluster-performance.json');

  console.log('📝 Writing reward summaries...');
  fs.writeFileSync(toolPath, JSON.stringify(toolPerf, null, 2));
  console.log(`   ✅ ${toolPath}`);

  fs.writeFileSync(sourceRefPath, JSON.stringify(sourceRefPerf, null, 2));
  console.log(`   ✅ ${sourceRefPath}`);

  fs.writeFileSync(clusterPath, JSON.stringify(clusterPerf, null, 2));
  console.log(`   ✅ ${clusterPath}\n`);

  // Summary
  console.log('📈 Summary');
  console.log(`   Total events: ${events.length}`);
  console.log(`   Tools: ${toolCount}`);
  console.log(`   Source references: ${sourceRefCount}`);
  console.log(`   Clusters: ${clusterCount}\n`);

  if (events.length > 0) {
    const totalRewards = events.reduce((sum, e) => sum + (e.reward || 0), 0);
    const avgReward = totalRewards / events.length;
    console.log(`   Total reward signal: ${totalRewards.toFixed(2)}`);
    console.log(`   Avg reward/event: ${avgReward.toFixed(2)}\n`);
  }

  console.log('✅ Phase 19B dry-run complete');
  console.log('   No Redis/DB/Qdrant writes');
  console.log('   All outputs include graphVersion + sourceRef\n');

  console.log('📚 Reference Schemas:');
  console.log(`   AtlasCard: ${JSON.stringify(AtlasCardSchema, null, 2)}`);
  console.log(`   Promotion Rules: ${JSON.stringify(PromotionRules, null, 2)}\n`);
}

main().catch(err => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
