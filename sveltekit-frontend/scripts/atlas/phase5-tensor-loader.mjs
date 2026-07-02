#!/usr/bin/env node
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPORTS_DIR = path.join(__dirname, '../../docs/reports');

// Configuration
const CANONICAL_DIM = 384;
const BATCH_SIZE = 1000;

async function main() {
  const startTime = Date.now();
  console.log('\n⚡ Phase 102 Step 5: Tensor Loader\n');

  const client = new pg.Client({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5434'),
    user: process.env.DB_USER || 'legal_admin',
    password: process.env.DB_PASSWORD || 'postgres',
    database: process.env.DB_NAME || 'legal_ai_db'
  });

  try {
    await client.connect();
    console.log('✅ Connected to Postgres\n');

    // Step 1: Count embeddings
    console.log('📊 Step 1: Audit Embeddings\n');
    const countResult = await client.query(`
      SELECT
        COUNT(*) as total_chunks,
        COUNT(content_embedding) as embedded_chunks
      FROM codebase_chunk_index
      WHERE content_embedding IS NOT NULL
    `);

    const { total_chunks, embedded_chunks } = countResult.rows[0];
    console.log(`  Total chunks: ${total_chunks}`);
    console.log(`  Chunks with embeddings: ${embedded_chunks}`);
    console.log(`  Embeddings are 768-dim (halfvec) — will be truncated to ${CANONICAL_DIM}-dim`);
    console.log(`  Coverage: ${(embedded_chunks / total_chunks * 100).toFixed(2)}%\n`);

    // Step 2: Load embeddings in batches
    console.log('💾 Step 2: Load Embeddings to Memory\n');

    const embeddings = [];
    const metadata = [];
    let batchCount = 0;

    const chunkResult = await client.query(`
      SELECT
        id as chunk_id,
        qdrant_id as chunk_key,
        content_embedding,
        relative_path as source_ref,
        relative_path as file_path,
        line_start,
        line_end
      FROM codebase_chunk_index
      WHERE content_embedding IS NOT NULL
      ORDER BY id
    `);

    console.log(`  Processing ${chunkResult.rows.length} embeddings...\n`);

    for (const row of chunkResult.rows) {
      // Extract embedding — pgvector returns as string "[0.1, 0.2, ...]"
      let embedding;
      try {
        if (typeof row.content_embedding === 'string') {
          // Parse string representation: "[0.1, 0.2, ...]"
          const parsed = row.content_embedding
            .slice(1, -1)  // Remove [ and ]
            .split(',')
            .map(s => parseFloat(s.trim()));
          embedding = parsed;
        } else if (Array.isArray(row.content_embedding)) {
          embedding = row.content_embedding;
        } else {
          console.log(`  ⚠️  Skipping chunk ${row.chunk_id}: unexpected embedding type`);
          continue;
        }
      } catch (e) {
        console.log(`  ⚠️  Skipping chunk ${row.chunk_id}: parse error`);
        continue;
      }

      if (!embedding || embedding.length === 0) {
        console.log(`  ⚠️  Skipping chunk ${row.chunk_id}: empty embedding`);
        continue;
      }

      // Truncate to canonical dimension if needed
      const truncated = new Float32Array(embedding.slice(0, CANONICAL_DIM));
      embeddings.push(truncated);
      metadata.push({
        chunk_id: row.chunk_id,
        chunk_key: row.chunk_key,
        source_ref: row.source_ref,
        file_path: row.file_path,
        line_start: row.line_start,
        line_end: row.line_end,
        original_dim: embedding.length
      });

      batchCount++;
      if (batchCount % BATCH_SIZE === 0) {
        console.log(`  ✓ Loaded ${batchCount}/${chunkResult.rows.length} embeddings`);
      }
    }

    console.log(`  ✅ Loaded ${embeddings.length} embeddings (${CANONICAL_DIM}-dim)\n`);

    // Step 3: Calculate memory usage
    console.log('📈 Step 3: Memory Analysis\n');
    const memoryPerEmbedding = CANONICAL_DIM * 4; // float32 = 4 bytes
    const totalMemoryMB = (embeddings.length * memoryPerEmbedding) / (1024 * 1024);
    const totalMemoryGB = totalMemoryMB / 1024;

    console.log(`  Embeddings: ${embeddings.length}`);
    console.log(`  Dimension: ${CANONICAL_DIM}`);
    console.log(`  Memory per embedding: ${memoryPerEmbedding} bytes`);
    console.log(`  Total memory (fp32): ${totalMemoryMB.toFixed(2)} MB (${totalMemoryGB.toFixed(3)} GB)`);
    console.log(`  RTX 3060 Ti (8GB): ${((8 * 1024 - totalMemoryMB) / 1024).toFixed(2)} GB free after load\n`);

    // Step 4: GPU availability check
    console.log('🎮 Step 4: GPU Availability Check\n');
    let gpuAvailable = false;
    try {
      // Try to import tensorrt_bridge
      const addon = require('../../../simd-bridge/cpp/build/Release/tensorrt_bridge.node');
      if (addon.isCudaAvailable && addon.isCudaAvailable()) {
        gpuAvailable = true;
        console.log('  ✅ CUDA available (tensorrt_bridge.node detected)');
      } else {
        console.log('  ⚠️  tensorrt_bridge.node present but CUDA unavailable');
      }
    } catch (e) {
      console.log(`  ⚠️  tensorrt_bridge.node not available: ${e.message}`);
    }

    if (!gpuAvailable) {
      console.log('  📌 GPU fallback: tensors loaded to CPU memory\n');
    } else {
      console.log('  ✅ GPU path: Ready for SOM clustering on CUDA\n');
    }

    // Step 5: Prepare tensor metadata for Step 6
    console.log('📝 Step 5: Prepare Tensor Metadata\n');

    const tensorMetadata = {
      phase: '102-step-5',
      timestamp: new Date().toISOString(),
      embedding_count: embeddings.length,
      embedding_dim: CANONICAL_DIM,
      memory_mb: parseFloat(totalMemoryMB.toFixed(2)),
      memory_gb: parseFloat(totalMemoryGB.toFixed(3)),
      gpu_available: gpuAvailable,
      precision: 'fp32',
      metadata_rows: metadata.length,
      chunk_id_range: {
        min: metadata.length > 0 ? metadata[0].chunk_id : null,
        max: metadata.length > 0 ? metadata[metadata.length - 1].chunk_id : null
      }
    };

    const reportPath = path.join(REPORTS_DIR, 'phase5-tensor-loader.json');
    await fs.writeFile(reportPath, JSON.stringify(tensorMetadata, null, 2));
    console.log(`  ✅ Tensor metadata saved: ${reportPath}\n`);

    // Step 6: Summary
    console.log('📊 Summary\n');
    console.log(`  Embeddings loaded: ${embeddings.length}`);
    console.log(`  Dimensions: ${CANONICAL_DIM}`);
    console.log(`  Total memory: ${totalMemoryMB.toFixed(2)} MB`);
    console.log(`  GPU ready: ${gpuAvailable ? '✅ Yes' : '⚠️  No (CPU fallback)'}`);
    console.log(`  Precision: fp32 (canonical, deterministic)`);
    console.log(`  Status: ✅ READY FOR STEP 6 (SOM/Clustering)\n`);

    console.log(`✅ COMPLETE in ${Date.now() - startTime}ms\n`);

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

await main();
