#!/usr/bin/env node
/**
 * Vector Governance Inventory
 *
 * Catalog all vectors in the system by dimension, model, storage tier, and authority status.
 * Build the foundation for 768→384 governance decisions.
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
      canonical_dimension: 384,
      native_model: 'embeddinggemma:latest',
      legacy_dimensions: [768],
      derived_dimensions: [64]
    },
    proof_status: {
      stage_3_semantic_extraction: 'MOCK_FIXTURE_ONLY',
      native_384_embedding: 'NOT_YET_PROVEN',
      legacy_768_classification: 'NOT_YET_PROVEN',
      ae_768_to_384_training: 'NOT_YET_EVALUATED'
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
    report.memory_analysis['384-dim-fp32'] = mem_384_fp32;
    report.memory_analysis['384-dim-fp16'] = mem_384_fp16;

    const savings_fp32 = mem_768_fp32.total_mib - mem_384_fp32.total_mib;
    const savings_fp16 = mem_768_fp16.total_mib - mem_384_fp16.total_mib;

    console.log(`  768-dim (${count_768} vectors):`);
    console.log(`    fp32: ${mem_768_fp32.total_mib} MiB`);
    console.log(`    fp16: ${mem_768_fp16.total_mib} MiB`);
    console.log(`  384-dim (same count):`);
    console.log(`    fp32: ${mem_384_fp32.total_mib} MiB (saves ${savings_fp32.toFixed(1)} MiB)`);
    console.log(`    fp16: ${mem_384_fp16.total_mib} MiB (saves ${savings_fp16.toFixed(1)} MiB)`);
  }

  // Governance recommendations
  report.governance_recommendations = [
    {
      priority: 'CRITICAL',
      item: 'Classify all 768-dim vectors as LEGACY or FIXTURE_ONLY',
      rationale: 'Stage 3 mock vectors do not represent semantic embeddings; deterministic hashing only',
      action: 'Add authority_status field to all vector records'
    },
    {
      priority: 'CRITICAL',
      item: 'Prove native 384-dim EmbeddingGemma embedding path',
      rationale: 'Cannot use 768→384 transformation until native path is verified',
      action: 'Run embeddinggemma:latest on representative sample; compare cosine similarity to ground truth'
    },
    {
      priority: 'HIGH',
      item: 'Establish PCA 768→384 baseline',
      rationale: 'Before training autoencoder, establish simple dimensionality reduction baseline',
      action: 'Compute PCA on legacy 768-dim vectors; measure reconstruction error and retrieval recall'
    },
    {
      priority: 'HIGH',
      item: 'Implement vector transformation metadata contract',
      rationale: 'Every 384-dim vector must declare its source (native, PCA, AE) and validation status',
      action: 'Add VectorRepresentation schema with sourceDimension, targetDimension, representationType, transformationId'
    },
    {
      priority: 'MEDIUM',
      item: 'Establish hot/warm/cold storage tier policy',
      rationale: 'Do not retain both 768 and 384 in hot path unless measured use case requires it',
      action: 'Archive legacy 768-dim vectors after successful 384 promotion; retain manifest for rollback'
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
  console.log(`  Native 384 Embedding: ${report.proof_status.native_384_embedding}`);
  console.log(`  Legacy 768 Classification: ${report.proof_status.legacy_768_classification}`);
  console.log(`  AE 768→384 Training: ${report.proof_status.ae_768_to_384_training}`);

  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('✓ VECTOR GOVERNANCE INVENTORY COMPLETE');
  console.log('═══════════════════════════════════════════════════════════\n');
}

execute().catch(err => {
  console.error('[ERROR]', err);
  process.exit(1);
});
