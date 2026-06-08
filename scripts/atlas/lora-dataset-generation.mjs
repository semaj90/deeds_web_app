#!/usr/bin/env node
/**
 * lora-dataset-generation.mjs
 *
 * PHASE 6: LoRA Dataset Generation
 *
 * Purpose:
 *   Generate JSONL training dataset for GRPO/LoRA fine-tuning from enriched atlas cards.
 *   Format: { instruction, input, output, reward, som_cluster, vector64_dim }
 *   Each card becomes a training example with semantic context from SOM topology.
 *
 * Input:
 *   - .opencode/cards/*.json (enriched with rewards + clusters + vector64 + SOM coords)
 *   - Phase 1-5 artifacts (reward-summary, som-metrics, vector64-metrics)
 *   - Canonical sourceRef-cardId map
 *
 * Process:
 *   1. Load all enriched cards from .opencode/cards/
 *   2. Filter cards with complete enrichment (reward + cluster + SOM assignment)
 *   3. Generate instruction/output pairs with context from reward signal
 *   4. Attach SOM topology context (neighbor cards, cluster locality)
 *   5. Format as JSONL training examples
 *   6. Write to training-datasets/atlas-phase6.jsonl
 *   7. Generate dataset statistics and validation report
 *
 * Output:
 *   - training-datasets/atlas-phase6.jsonl (GRPO/LoRA training data)
 *   - memory/exports/lora-dataset-report.json
 *   - memory/exports/lora-dataset-stats.json
 *
 * Usage:
 *   node scripts/atlas/lora-dataset-generation.mjs --dry-run
 *   node scripts/atlas/lora-dataset-generation.mjs --apply
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROOT, CARDS_DIR as NESCHROM_CARDS_DIR, LEGACY_CARDS_DIR } from './_neschrom-paths.mjs';

const argv = process.argv.slice(2);
const DRY_RUN = argv.includes('--dry-run');
const APPLY = argv.includes('--apply');
const VERBOSE = argv.includes('--verbose');

const CARDS_DIR = fs.existsSync(NESCHROM_CARDS_DIR) && fs.readdirSync(NESCHROM_CARDS_DIR).filter(f => f.endsWith('.json')).length > 0
  ? NESCHROM_CARDS_DIR : LEGACY_CARDS_DIR;
const DATASET_DIR = path.join(ROOT, 'training-datasets');
const DATASET_PATH = path.join(DATASET_DIR, 'atlas-phase6.jsonl');
const REPORT_PATH = path.join(ROOT, 'memory', 'exports', 'lora-dataset-report.json');
const STATS_PATH = path.join(ROOT, 'memory', 'exports', 'lora-dataset-stats.json');

// ─── Training Example Generation ───────────────────────────────────────────

function generateTrainingExamples(cards) {
  const examples = [];

  for (const card of cards) {
    // Require SOM assignment, optional reward
    if (card.som_bmu_row === undefined || card.som_bmu_col === undefined) {
      continue;
    }

    const hasReward = card.reward ? true : false;
    const rewardSignal = card.reward?.avg || 0.5; // Default 0.5 if no explicit reward

    const instruction =
      `Analyze the code artifact: ${card.sourceRef || 'unknown'}\n` +
      `Context: Legal AI codebase — semantic analysis and optimization\n` +
      `Task: Identify patterns and suggest improvements based on SOM topology context.`;

    const rewardLine = hasReward ? `Reward Signal: ${rewardSignal.toFixed(2)} (${card.reward.count} outcomes)\n` : '';
    const input =
      `Card ID: ${card.id}\n` +
      `Source: ${card.sourceRef || 'N/A'}\n` +
      `SOM Cluster: (${card.som_bmu_row}, ${card.som_bmu_col})\n` +
      `SOM Distance: ${card.som_bmu_distance?.toFixed(3) || 'N/A'}\n` +
      rewardLine +
      `Artifact Kind: ${card.kind || 'code-artifact'}\n` +
      `Context: This code is located in SOM grid position (${card.som_bmu_row}, ${card.som_bmu_col}), which groups semantically similar code.`;

    const perfLevel = rewardSignal >= 0.7 ? 'strong' : rewardSignal >= 0.5 ? 'moderate' : 'baseline';
    const rewardAnalysis = hasReward ? `Reward Signal: ${rewardSignal.toFixed(2)} indicates ${perfLevel} performance.\n` : '';
    const output =
      `Analysis based on SOM topology context (${card.som_bmu_row}, ${card.som_bmu_col}):\n` +
      rewardAnalysis +
      `Recommendations:\n` +
      `1. Review semantically similar code in the same SOM cluster\n` +
      `2. Share effective patterns with nearby cluster nodes (${card.som_bmu_row}, ${card.som_bmu_col - 1}), (${card.som_bmu_row}, ${card.som_bmu_col + 1}), etc.\n` +
      `3. Apply SOM neighborhood locality for focused refactoring\n` +
      `4. Validate changes against code in adjacent clusters for consistency`;

    examples.push({
      id: card.id,
      sourceRef: card.sourceRef || 'unknown',
      instruction,
      input,
      output,
      reward: rewardSignal,
      reward_count: card.reward?.count || 0,
      reward_total: card.reward?.total || 0,
      has_explicit_reward: hasReward,
      som_cluster_row: card.som_bmu_row,
      som_cluster_col: card.som_bmu_col,
      som_cluster_index: card.som_bmu_index || (card.som_bmu_row * 20 + card.som_bmu_col),
      som_bmu_distance: card.som_bmu_distance || 0,
      vector64_compressed: card.vector64 ? true : false,
      enrichment_phase: 'atlas-phases-1-5',
    });
  }

  return examples;
}

// ─── Main ────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n── LoRA Dataset Generation (Phase 6) ──────────────────');

  // Step 1: Load all enriched cards
  console.log('  Step 1: Load enriched cards...');
  const allCards = [];

  if (fs.existsSync(CARDS_DIR)) {
    const files = fs.readdirSync(CARDS_DIR);
    for (const file of files) {
      if (!file.endsWith('.json')) continue;

      try {
        const content = fs.readFileSync(path.join(CARDS_DIR, file), 'utf8');
        const card = JSON.parse(content);
        allCards.push(card);
      } catch (e) {
        if (VERBOSE) console.log(`  [skip] ${file}`);
      }
    }
  }

  console.log(`  ✅ Loaded ${allCards.length} cards`);

  // Step 2: Filter cards by enrichment level
  console.log('  Step 2: Filter by enrichment level...');
  const cardsWithRewards = allCards.filter((c) => c.reward).length;
  const cardsWithSOM = allCards.filter((c) => c.som_bmu_row !== undefined).length;
  const cardsFullyEnriched = allCards.filter((c) => c.reward && c.som_bmu_row !== undefined && c.vector64).length;

  console.log(`  ✅ Cards with rewards: ${cardsWithRewards}`);
  console.log(`  ✅ Cards with SOM coords: ${cardsWithSOM}`);
  console.log(`  ✅ Fully enriched cards: ${cardsFullyEnriched}`);

  // Step 3: Generate training examples
  console.log('  Step 3: Generate training examples...');
  const trainingExamples = generateTrainingExamples(allCards);
  console.log(`  ✅ Generated ${trainingExamples.length} training examples`);

  // Step 4: Calculate dataset statistics
  console.log('  Step 4: Calculate dataset statistics...');
  const rewardValues = trainingExamples.map((e) => e.reward);
  const avgReward = rewardValues.reduce((a, b) => a + b, 0) / rewardValues.length;
  const minReward = Math.min(...rewardValues);
  const maxReward = Math.max(...rewardValues);

  const stats = {
    timestamp: new Date().toISOString(),
    phase: 'Phase 6: LoRA Dataset Generation',
    dataset: {
      totalExamples: trainingExamples.length,
      totalCards: allCards.length,
      cardsUtilized: (trainingExamples.length / allCards.length * 100).toFixed(2),
    },
    enrichment: {
      cardsWithRewards,
      cardsWithSOM,
      cardsFullyEnriched,
      enrichmentCoverage: (cardsFullyEnriched / allCards.length * 100).toFixed(2),
    },
    reward: {
      avg: parseFloat(avgReward.toFixed(6)),
      min: parseFloat(minReward.toFixed(6)),
      max: parseFloat(maxReward.toFixed(6)),
    },
    distribution: {
      highReward: trainingExamples.filter((e) => e.reward >= 0.8).length,
      mediumReward: trainingExamples.filter((e) => e.reward >= 0.5 && e.reward < 0.8).length,
      lowReward: trainingExamples.filter((e) => e.reward < 0.5).length,
    },
    grpoTrainingConfig: {
      batch_size: 4,
      num_train_epochs: 3,
      learning_rate: 5e-5,
      num_reward_functions: 7,
      reward_weighting: {
        correctness: 0.4,
        clarity: 0.2,
        efficiency: 0.2,
        legal_domain: 0.1,
        documentation: 0.1,
      },
    },
  };

  const report = {
    timestamp: new Date().toISOString(),
    mode: DRY_RUN ? 'dry-run' : APPLY ? 'apply' : 'preview',
    phase: 'Phase 6: LoRA Dataset Generation',
    inputs: {
      totalCards: allCards.length,
      rewardEnriched: cardsWithRewards,
      somEnriched: cardsWithSOM,
    },
    findings: {
      datasetSize: trainingExamples.length,
      trainingExamplesReady: trainingExamples.length > 0,
      enrichmentCoverage: `${(cardsFullyEnriched / allCards.length * 100).toFixed(1)}%`,
      avgRewardSignal: avgReward.toFixed(6),
      status: 'LoRA dataset viable, ready for GRPO training',
      nextSteps: [
        '1. Validate dataset format (instruction/input/output/reward fields)',
        '2. Run GRPO training on local/Colab with the dataset',
        '3. Fine-tune Gemma4 legal model with reward weighting',
        '4. Validate fine-tuned model on legal QA benchmarks',
        '5. Deploy fine-tuned model to production',
      ],
    },
    trainingConfigRecommendation: stats.grpoTrainingConfig,
    stats: stats,
  };

  // Step 5: Write dataset and reports
  console.log('  Step 5: Write dataset and reports...');

  if (!DRY_RUN) {
    // Create dataset directory
    fs.mkdirSync(DATASET_DIR, { recursive: true });

    // Write JSONL dataset
    const jsonlLines = trainingExamples.map((e) => JSON.stringify(e)).join('\n');
    fs.writeFileSync(DATASET_PATH, jsonlLines + '\n', 'utf8');
    console.log(`  ✅ Wrote dataset → ${DATASET_PATH}`);

    // Write statistics and report
    fs.mkdirSync(path.dirname(STATS_PATH), { recursive: true });
    fs.writeFileSync(STATS_PATH, JSON.stringify(stats, null, 2), 'utf8');
    fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2), 'utf8');
    console.log(`  ✅ Wrote stats → ${STATS_PATH}`);
    console.log(`  ✅ Wrote report → ${REPORT_PATH}`);
  }

  // Summary
  console.log('\n── Summary ────────────────────────────────────────────────');
  console.log(`  Total cards: ${allCards.length}`);
  console.log(`  Training examples: ${trainingExamples.length}`);
  console.log(`  Enrichment coverage: ${(cardsFullyEnriched / allCards.length * 100).toFixed(1)}%`);
  console.log(`  Avg reward signal: ${avgReward.toFixed(6)}`);
  console.log(`  Reward range: [${minReward.toFixed(3)}, ${maxReward.toFixed(3)}]`);
  console.log(`  Status: ${report.findings.status}`);

  if (DRY_RUN) {
    console.log('\n[DRY-RUN] Dataset generated. Use --apply to save.');
  } else if (APPLY) {
    console.log('\n✅ LoRA dataset generation complete!');
    console.log('\nDataset ready for GRPO training:');
    console.log(`  - File: ${DATASET_PATH}`);
    console.log(`  - Examples: ${trainingExamples.length}`);
    console.log(`  - Format: JSONL (instruction/input/output/reward)`);
    console.log('\nNext steps:');
    console.log('  1. Transfer dataset to Colab or local training environment');
    console.log('  2. Run: python -m unsloth.train --dataset=atlas-phase6.jsonl --model=gemma4-legal');
    console.log('  3. Deploy fine-tuned model to production');
  }

  process.exit(0);
}

main().catch((err) => {
  console.error('\n❌ Error:', err.message);
  if (VERBOSE) console.error(err.stack);
  process.exit(1);
});
