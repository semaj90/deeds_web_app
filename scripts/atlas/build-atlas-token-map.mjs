#!/usr/bin/env node
/**
 * scripts/atlas/build-atlas-token-map.mjs
 *
 * Phase 19C: Build Atlas NES retokenization map (dry-run).
 *
 * Inputs:
 * - .tmp/vector64-preview.jsonl (auto-generated if missing)
 * - memory/rewards/tool-performance.json (computed from ledger if missing)
 * - memory/rewards/sourceRef-performance.json (computed from ledger if missing)
 * - .opencode/outcome-ledger.ndjson or memory/retrieval/outcomes.jsonl
 * - .tmp/ast-neo4j-dryrun.json
 * - memory/exports/cluster-cards.jsonl
 *
 * Outputs:
 * - .tmp/atlas-token-map.jsonl
 * - memory/atlas-token-map.preview.json
 */

import fs from 'fs';
import path from 'path';

const root = process.cwd();

// Define input/output paths
const OUTCOMES_NDJSON = path.join(root, '.opencode/outcome-ledger.ndjson');
const OUTCOMES_JSONL = path.join(root, 'memory/retrieval/outcomes.jsonl');
const AST_NEO4J_JSON = path.join(root, '.tmp/ast-neo4j-dryrun.json');
const CLUSTER_CARDS_JSONL = path.join(root, 'memory/exports/cluster-cards.jsonl');
const VECTOR64_JSONL = path.join(root, '.tmp/vector64-preview.jsonl');

const TOOL_PERF_JSON = path.join(root, 'memory/rewards/tool-performance.json');
const SOURCEREF_PERF_JSON = path.join(root, 'memory/rewards/sourceRef-performance.json');

const OUTPUT_JSONL = path.join(root, '.tmp/atlas-token-map.jsonl');
const OUTPUT_PREVIEW_JSON = path.join(root, 'memory/atlas-token-map.preview.json');

function ensureDir(filePath) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

// 1. Load outcomes and compute reward attribution if missing
function loadOutcomes() {
  let lines = [];
  if (fs.existsSync(OUTCOMES_NDJSON)) {
    lines = fs.readFileSync(OUTCOMES_NDJSON, 'utf-8').split('\n');
  } else if (fs.existsSync(OUTCOMES_JSONL)) {
    lines = fs.readFileSync(OUTCOMES_JSONL, 'utf-8').split('\n');
  }

  const outcomes = [];
  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      outcomes.push(JSON.parse(line));
    } catch (e) {
      // Ignore invalid JSON lines
    }
  }
  return outcomes;
}

function computeRewardAttributions(outcomes) {
  const toolRewards = {};
  const sourceRefRewards = {};

  outcomes.forEach((record) => {
    const reward = typeof record.reward === 'number' ? record.reward : (record.outcome === 'success' ? 1.0 : 0.0);
    const tools = record.toolsUsed || [];
    const sourceRefs = record.sourceRefs || [];

    tools.forEach((t) => {
      if (!toolRewards[t]) toolRewards[t] = { total: 0, count: 0 };
      toolRewards[t].total += reward;
      toolRewards[t].count += 1;
    });

    sourceRefs.forEach((s) => {
      if (!sourceRefRewards[s]) sourceRefRewards[s] = { total: 0, count: 0 };
      sourceRefRewards[s].total += reward;
      sourceRefRewards[s].count += 1;
    });
  });

  const toolPerformance = {};
  const sourceRefPerformance = {};

  Object.entries(toolRewards).forEach(([tool, data]) => {
    toolPerformance[tool] = Number((data.total / data.count).toFixed(2));
  });

  Object.entries(sourceRefRewards).forEach(([ref, data]) => {
    sourceRefPerformance[ref] = Number((data.total / data.count).toFixed(2));
  });

  // Ensure output directory exists and write performance JSON files
  ensureDir(TOOL_PERF_JSON);
  fs.writeFileSync(TOOL_PERF_JSON, JSON.stringify(toolPerformance, null, 2));
  fs.writeFileSync(SOURCEREF_PERF_JSON, JSON.stringify(sourceRefPerformance, null, 2));

  console.log(`[REWARDS] Wrote tool-performance: ${Object.keys(toolPerformance).length} entries`);
  console.log(`[REWARDS] Wrote sourceRef-performance: ${Object.keys(sourceRefPerformance).length} entries`);

  return { toolPerformance, sourceRefPerformance };
}

// 2. Load or generate vector64 preview
function loadOrGenerateVector64(clusterCards) {
  if (fs.existsSync(VECTOR64_JSONL)) {
    const lines = fs.readFileSync(VECTOR64_JSONL, 'utf-8').split('\n');
    const map = {};
    lines.forEach((line) => {
      if (!line.trim()) return;
      try {
        const item = JSON.parse(line);
        if (item.sourceRef) {
          map[item.sourceRef] = item.vector64;
        }
      } catch (e) {}
    });
    return map;
  }

  // Generate vector64 mock for all unique source refs
  const map = {};
  const generatedLines = [];
  
  clusterCards.forEach((card) => {
    const refs = card.sourceRefs || [];
    refs.forEach((ref) => {
      if (!map[ref]) {
        // Generate mock 64-dim vector
        const vector64 = Array.from({ length: 64 }, () => Number((Math.random() * 2 - 1).toFixed(4)));
        map[ref] = vector64;
        generatedLines.push(JSON.stringify({ sourceRef: ref, vector64 }));
      }
    });
  });

  ensureDir(VECTOR64_JSONL);
  fs.writeFileSync(VECTOR64_JSONL, generatedLines.join('\n') + '\n');
  console.log(`[VECTOR64] Generated mock vector64 previews for ${Object.keys(map).length} unique source refs`);
  return map;
}

// 3. Load cluster cards
function loadClusterCards() {
  if (!fs.existsSync(CLUSTER_CARDS_JSONL)) {
    console.warn(`[WARNING] cluster-cards.jsonl not found, using empty cards array.`);
    return [];
  }
  const lines = fs.readFileSync(CLUSTER_CARDS_JSONL, 'utf-8').split('\n');
  const cards = [];
  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      cards.push(JSON.parse(line));
    } catch (e) {}
  }
  return cards;
}

// 4. Main Builder
async function main() {
  console.log('🚀 Phase 19C Atlas: NES Retokenization Map Builder');
  console.log();

  const outcomes = loadOutcomes();
  const { toolPerformance, sourceRefPerformance } = computeRewardAttributions(outcomes);
  const clusterCards = loadClusterCards();
  const vector64Map = loadOrGenerateVector64(clusterCards);

  // AST Neo4j metadata
  let astMetadata = {};
  if (fs.existsSync(AST_NEO4J_JSON)) {
    try {
      astMetadata = JSON.parse(fs.readFileSync(AST_NEO4J_JSON, 'utf-8'));
      console.log(`[AST] Loaded dry-run AST Neo4j metadata: ${Object.keys(astMetadata).length} elements`);
    } catch (e) {
      console.warn(`[WARNING] Failed to parse AST Neo4j dryrun.`);
    }
  }

  const graphVersion = `atlas-v2-graph-${new Date().toISOString().split('T')[0]}`;
  const validFrom = new Date().toISOString();
  const validUntil = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(); // 30 days valid

  const tokenMappings = [];

  // Generate tokens based on cluster cards
  clusterCards.forEach((card, index) => {
    const som_x = card.somBmuRow ?? index % 12;
    const som_y = card.somBmuCol ?? Math.floor(index / 12) % 12;
    const collection = card.collection || 'codebase';
    
    // Clean and split collection to get domain and feature
    let domain = 'codebase';
    let feature = card.centroidKey || `centroid_${index}`;
    if (collection.includes('_')) {
      const parts = collection.split('_');
      domain = parts[0];
      feature = parts.slice(1).join('_');
    }

    const refs = card.sourceRefs || [];
    refs.forEach((ref) => {
      const reward = sourceRefPerformance[ref] ?? Number((card.authorityScore || 0.5).toFixed(2));
      const vector64 = vector64Map[ref] || Array.from({ length: 64 }, () => 0.0);

      // Token format: CHR97:{domain}:{feature}:{som_x}_{som_y}
      const token = `CHR97:${domain}:${feature}:${som_x}_${som_y}`;

      tokenMappings.push({
        atlasToken: token,
        sourceRef: ref,
        kind: 'cluster_card',
        domain,
        feature,
        vector64,
        som_x,
        som_y,
        reward_score: reward,
        graphVersion,
        validFrom,
        validUntil,
        schemaMask: ['atlasToken', 'sourceRef', 'som_x', 'som_y', 'reward_score'],
      });
    });
  });

  // Write NDJSON output
  ensureDir(OUTPUT_JSONL);
  const outputLines = tokenMappings.map((m) => JSON.stringify(m));
  fs.writeFileSync(OUTPUT_JSONL, outputLines.join('\n') + '\n');
  console.log(`[WRITE] Written ${tokenMappings.length} mappings to ${OUTPUT_JSONL}`);

  // Write preview JSON
  ensureDir(OUTPUT_PREVIEW_JSON);
  fs.writeFileSync(OUTPUT_PREVIEW_JSON, JSON.stringify(tokenMappings.slice(0, 10), null, 2));
  console.log(`[WRITE] Written preview snapshot of first 10 mappings to ${OUTPUT_PREVIEW_JSON}`);

  console.log();
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`Total Atlas NES Tokens Mapped: ${tokenMappings.length}`);
  console.log('═══════════════════════════════════════════════════════════════');
}

main().catch(console.error);
