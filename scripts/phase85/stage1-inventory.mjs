#!/usr/bin/env node
/**
 * PHASE 85 — STAGE 1: INVENTORY
 *
 * Find all existing modules for:
 * - artifact registry
 * - summary generation
 * - feature label extraction
 * - GAN validation
 * - trace export
 * - reward scoring
 * - replay database
 * - semantic diff
 *
 * Output: .tmp/phase85-stage1-inventory.json
 */

import { execSync } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';

const INVENTORY_CATEGORIES = {
  artifact_registry: {
    patterns: [
      'atlas_artifacts',
      'page_artifacts',
      'knowledge_artifacts',
      'artifact_id',
      'artifact_type',
      'generator_version'
    ],
    files: [],
  },
  summary_generation: {
    patterns: [
      'summarize',
      'extract.*summary',
      'summary_hash',
      'summary_cache',
      'summary.*generation',
      'hca.*compressor'
    ],
    files: [],
  },
  feature_label_extraction: {
    patterns: [
      'feature_label',
      'feature_id',
      'LangExtract',
      'langextract',
      'domain_class',
      'ontology'
    ],
    files: [],
  },
  gan_validation: {
    patterns: [
      'gan.*validat',
      'gan.*score',
      'adversarial',
      'glyph.*diffusion',
      'gan_report'
    ],
    files: [],
  },
  trace_export: {
    patterns: [
      'trace_id',
      'agent_traces',
      'tool_traces',
      'trace.*export',
      'exportTrace',
      'traceToCard'
    ],
    files: [],
  },
  reward_scoring: {
    patterns: [
      'reward.*score',
      'reward_zset',
      'reward_events',
      'intent_synthesis_rewards',
      'atlas_reward',
      'grpo_exporter'
    ],
    files: [],
  },
  replay_database: {
    patterns: [
      'agent_runs',
      'replay.*data',
      'retrieved_packets',
      'retrieval_strategy',
      'cache_hits',
      'latency_ms'
    ],
    files: [],
  },
  semantic_diff: {
    patterns: [
      'semantic.*diff',
      'similarity.*threshold',
      'cosine.*similarity',
      'embedding.*comparison'
    ],
    files: [],
  },
  packet_identity: {
    patterns: [
      'packet_key',
      'source_ref',
      'feature_id',
      'content_hash',
      'summary_hash',
      'supersedes'
    ],
    files: [],
  },
  git_diff_tracking: {
    patterns: [
      'git.*diff',
      'affected.*packet',
      'source_ref.*mapping',
      'supersedes_artifact',
      'git_commit'
    ],
    files: [],
  },
};

async function main() {
  console.log('📦 PHASE 85 STAGE 1: INVENTORY');
  console.log('Scanning for production modules...\n');

  for (const [category, config] of Object.entries(INVENTORY_CATEGORIES)) {
    const patternStr = config.patterns.join('|');
    const rg = execSync(
      `rg "${patternStr}" --glob="*.ts" --glob="*.mjs" -l sveltekit-frontend/src/lib/server sveltekit-frontend/src/routes/api scripts/atlas packages/ 2>/dev/null`,
      { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] }
    );

    if (rg.trim()) {
      config.files = rg.trim().split('\n').filter(Boolean).sort();
      console.log(`✅ ${category}: ${config.files.length} files`);
    } else {
      console.log(`❌ ${category}: 0 files`);
    }
  }

  // Export to JSON
  const inventory = {
    timestamp: new Date().toISOString(),
    categories: INVENTORY_CATEGORIES,
    summary: {
      total_files: Object.values(INVENTORY_CATEGORIES).reduce((sum, cat) => sum + cat.files.length, 0),
      categories_found: Object.entries(INVENTORY_CATEGORIES).filter(([, cat]) => cat.files.length > 0).length,
      categories_missing: Object.entries(INVENTORY_CATEGORIES).filter(([, cat]) => cat.files.length === 0).map(([name]) => name),
    }
  };

  const outputPath = '.tmp/phase85-stage1-inventory.json';
  await fs.writeFile(outputPath, JSON.stringify(inventory, null, 2));
  console.log(`\n📄 Inventory saved to ${outputPath}`);

  // Print missing categories
  if (inventory.summary.categories_missing.length > 0) {
    console.log(`\n🚨 MISSING CATEGORIES (need implementation):`);
    inventory.summary.categories_missing.forEach(cat => console.log(`   - ${cat}`));
  }

  return inventory;
}

main().catch(console.error);
