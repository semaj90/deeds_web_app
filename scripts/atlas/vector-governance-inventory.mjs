#!/usr/bin/env node
/**
 * Vector Governance Inventory
 *
 * Catalog all vectors in the system by dimension, model, storage tier, and authority status.
 * Inventory canonical semantic_768 separately from legacy and derived projections.
 */

import fs from 'fs';
import path from 'path';
import readline from 'readline';
import crypto from 'crypto';

const WORKSPACE_ID = 'legal-ai:deeds-web-app';
const REPO_ROOT = process.cwd();
const OUTPUT_DIR = path.join(REPO_ROOT, 'docs', 'vector-governance');

// Ensure output directory exists
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

async function inventorySemanticFacts() {
  /**
   * Inventory vectors from Stage 3 semantic_facts.ndjson
   */
  const inputFile = path.join(REPO_ROOT, 'docs', 'stage3', 'semantic_facts.ndjson');
  const inventory = {
    vectors_by_dimension: {},
    vectors_by_model: {},
    vectors_by_source: {},
    total_count: 0,
    memory_usage: {}
  };

  if (!fs.existsSync(inputFile)) {
    console.log('[Vector Inventory] semantic_facts.ndjson not found, skipping');
    return inventory;
  }

  const readline_instance = readline.createInterface({
    input: fs.createReadStream(inputFile),
    crlfDelay: Infinity
  });

  let processed = 0;
  for await (const line of readline_instance) {
    if (line.trim().length === 0) continue;

    try {
      const record = JSON.parse(line);
      processed++;

      if (processed % 10000 === 0) {
        console.log(`  → Processed ${processed}... vectors`);
      }

      // Track by dimension (mock 768-dim in this case)
      const dim = record.embedding_dim || 768;
      if (!inventory.vectors_by_dimension[dim]) {
        inventory.vectors_by_dimension[dim] = {
          count: 0,
          model: record.embedding_model,
          authority_status: 'FIXTURE_ONLY', // All Stage 3 are fixtures
          source_type: record.embedding_model === 'embeddinggemma:latest' ? 'native' : 'mock'
        };
      }
      inventory.vectors_by_dimension[dim].count++;

      // Track by model
      const model = record.embedding_model || 'unknown';
      if (!inventory.vectors_by_model[model]) {
        inventory.vectors_by_model[model] = { count: 0, dimensions: [] };
      }
      inventory.vectors_by_model[model].count++;
      if (!inventory.vectors_by_model[model].dimensions.includes(dim)) {
        inventory.vectors_by_model[model].dimensions.push(dim);
      }

      // Track by source
      const source = record.extraction_version || 'unknown';
      if (!inventory.vectors_by_source[source]) {
        inventory.vectors_by_source[source] = { count: 0 };
      }
      inventory.vectors_by_source[source].count++;

      inventory.total_count++;
    } catch (err) {
      console.error(`[WARN] Failed to parse vector record: ${err.message}`);
    }
  }

  return inventory;
}

function estimateMemoryUsage(vectorCount, dimension, encoding = 'fp32') {
  /**
   * Estimate memory for vector storage.
   * Does not include Qdrant index overhead or graph structures.
   */
  const bytesPerDim = {
    fp32: 4,
    fp16: 2,
    int8: 1
  };

  const bytesPerVector = (bytesPerDim[encoding] || 4) * dimension;
  const totalBytes = vectorCount * bytesPerVector;
  const totalMiB = totalBytes / (1024 * 1024);

  return {
    count: vectorCount,
    dimension,
    encoding,
    bytes_per_vector: bytesPerVector,
    total_bytes: totalBytes,
    total_mib: totalMiB.toFixed(1),
    total_gib: (totalMiB / 1024).toFixed(2)
  };
}

async function generateVectorGovernanceReport(inventory) {
  /**
   * Generate detailed vector governance report.
   */
  const report = {
    workspace_id: WORKSPACE_ID,
    generated_at: new Date().toISOString(),
    inventory,
    memory_analysis: {},
    governance_recommendations: [],
    current_policy: {
      canonical_dimension: 768,
      native_model: 'embeddinggemma:latest',
      canonical_representation: 'semantic_768',
      mrl_projection_dimensions: [512, 256, 128],
      legacy_dimensions: [384],
      derived_latent_dimensions: [256, 128, 64]
    },
    proof_status: {
      stage_3_semantic_extraction: 'MOCK_FIXTURE_ONLY',
      embeddinggemma_native_768: 'REQUIRES_CURRENT_PROVENANCE_RECEIPT',
      mrl_projection_quality: 'SEPARATE_EVALUATION_REQUIRED',
      legacy_384_classification: 'LEGACY_ONLY',
      latent_projection_quality: 'SEPARATE_EVALUATION_REQUIRED'
    }
  };

  // Memory analysis
  console.log('[Vector Governance] Memory Analysis:');
  if (inventory.vectors_by_dimension[768]) {
    const count_768 = inventory.vectors_by_dimension[768].count;
    const mem_768_fp32 = estimateMemoryUsage(count_768, 768, 'fp32');
    const mem_768_fp16 = estimateMemoryUsage(count_768, 768, 'fp16');
    const mem_384_fp32 = estimateMemoryUsage(count_768, 384, 'fp32');
    const mem_384_fp16 = estimateMemoryUsage(count_768, 384, 'fp16');

    report.memory_analysis['768-dim-fp32'] = mem_768_fp32;
    report.memory_analysis['768-dim-fp16'] = mem_768_fp16;
    report.memory_analysis['legacy-384-comparison-fp32'] = mem_384_fp32;
    report.memory_analysis['legacy-384-comparison-fp16'] = mem_384_fp16;

    const savings_fp32 = mem_768_fp32.total_mib - mem_384_fp32.total_mib;
    const savings_fp16 = mem_768_fp16.total_mib - mem_384_fp16.total_mib;

    console.log(`  768-dim (${count_768} vectors):`);
    console.log(`    fp32: ${mem_768_fp32.total_mib} MiB`);
    console.log(`    fp16: ${mem_768_fp16.total_mib} MiB`);
    console.log(`  Legacy 384-D storage comparison (same count; not canonical):`);
    console.log(`    fp32: ${mem_384_fp32.total_mib} MiB (saves ${savings_fp32.toFixed(1)} MiB)`);
    console.log(`    fp16: ${mem_384_fp16.total_mib} MiB (saves ${savings_fp16.toFixed(1)} MiB)`);
  }

  // Governance recommendations
  report.governance_recommendations = [
    {
      priority: 'CRITICAL',
      item: 'Qualify canonical semantic_768 vectors by immutable representation provenance',
      rationale: 'Physical dimension alone does not prove model, tokenizer, input policy, or source revision',
      action: 'Require the current representation receipt before semantic admission or projection'
    },
    {
      priority: 'CRITICAL',
      item: 'Keep MRL and latent projections distinct from canonical semantic_768',
      rationale: '512/256/128 MRL and 256/128/64 latent vectors have separate representation identities',
      action: 'Record source representation, projection revision, target dimension, and evaluation receipt'
    },
    {
      priority: 'HIGH',
      item: 'Evaluate optional dimension-reduced challengers against semantic_768',
      rationale: 'Reduced vectors are executor/projection candidates, not replacements for canonical identity',
      action: 'Compare retrieval recall and latency on the same revision-qualified held-out cohort'
    },
    {
      priority: 'HIGH',
      item: 'Retain 384-D artifacts as legacy-only evidence',
      rationale: 'A legacy dimension must not be mistaken for canonical semantic_768 or a qualified MRL slice',
      action: 'Keep separate collection/column and explicit migration lifecycle; do not backfill authority from current model state'
    },
    {
      priority: 'MEDIUM',
      item: 'Establish hot/warm/cold storage tier policy',
      rationale: 'Keep canonical 768-D source vectors and only measured, revision-qualified projections in hot tiers',
      action: 'Archive legacy artifacts with manifest and rollback metadata; never delete canonical source vectors'
    },
    {
      priority: 'MEDIUM',
      item: 'Gate autoencoder training behind authorization',
      rationale: 'Training requires approved evaluation data and storage budget',
      action: 'Implement AutoencoderTrainingRecommendation contract; require explicit approval before running ae_train'
    }
  ];

  return report;
}

async function execute() {
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('VECTOR GOVERNANCE INVENTORY');
  console.log('═══════════════════════════════════════════════════════════\n');

  console.log('[Vector Inventory] Step 1: Scan semantic_facts.ndjson');
  const inventory = await inventorySemanticFacts();
  console.log(`  → Total vectors inventoried: ${inventory.total_count}`);
  console.log(`  → By dimension: ${JSON.stringify(inventory.vectors_by_dimension, null, 2)}`);

  console.log('\n[Vector Inventory] Step 2: Generate governance report');
  const report = await generateVectorGovernanceReport(inventory);

  console.log('\n[Vector Inventory] Step 3: Output governance report');
  const reportFile = path.join(OUTPUT_DIR, 'vector-governance-report.json');
  fs.writeFileSync(reportFile, JSON.stringify(report, null, 2), 'utf-8');
  console.log(`  → Output: vector-governance-report.json`);

  // Summary output
  console.log('\n[Vector Inventory] Governance Recommendations:');
  for (const rec of report.governance_recommendations) {
    console.log(`  [${rec.priority}] ${rec.item}`);
    console.log(`    Rationale: ${rec.rationale}`);
    console.log(`    Action: ${rec.action}`);
  }

  console.log('\n[Vector Inventory] Proof Status:');
  console.log(`  Stage 3 Semantic Extraction: ${report.proof_status.stage_3_semantic_extraction}`);
  console.log(`  EmbeddingGemma native 768: ${report.proof_status.embeddinggemma_native_768}`);
  console.log(`  MRL projection quality: ${report.proof_status.mrl_projection_quality}`);
  console.log(`  Latent projection quality: ${report.proof_status.latent_projection_quality}`);
  console.log(`  Legacy 384 policy: ${report.proof_status.legacy_384_classification}`);

  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('✓ VECTOR GOVERNANCE INVENTORY COMPLETE');
  console.log('═══════════════════════════════════════════════════════════\n');
}

execute().catch(err => {
  console.error('[ERROR]', err);
  process.exit(1);
});
