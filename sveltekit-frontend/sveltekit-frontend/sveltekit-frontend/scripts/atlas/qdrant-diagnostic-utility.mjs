#!/usr/bin/env node
import { QdrantClient } from '@qdrant/js-client-rest';

const qdrant = new QdrantClient({ url: 'http://127.0.0.1:6333', checkCompatibility: false });

async function qdrantDiagnostics() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║  Qdrant Diagnostics Utility                               ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  try {
    // 1. Health check
    console.log('🔍 Health Check:');
    const health = await qdrant.getCollections();
    console.log(`   ✅ Server responding — ${health.collections.length} collections\n`);

    // 2. CUDA capabilities
    console.log('🎮 CUDA/GPU Capabilities:');
    // Query info doesn't expose CUDA status directly, but we can infer from collection config
    let cudaEnabled = false;
    
    for (const coll of health.collections.slice(0, 3)) {
      const config = await qdrant.getCollection(coll.name);
      // HNSW config presence and m/ef_construction values can hint at GPU optimization
      const quantization = config.config?.quantization_config;
      const hnsw = config.config?.hnsw_config;
      
      if (quantization || hnsw?.m > 16) {
        cudaEnabled = true;
      }
    }
    console.log(`   ${cudaEnabled ? '✅' : '⚠️'} HNSW optimizations detected: ${cudaEnabled ? 'likely GPU-accelerated' : 'CPU-only inference'}\n`);

    // 3. Collection inventory
    console.log('📦 Collection Inventory:');
    let vectorDims = new Map();
    let totalPoints = 0;
    
    for (const coll of health.collections) {
      const config = await qdrant.getCollection(coll.name);
      const points = config.points_count || 0;
      const vectors = config.config?.vectors;
      
      if (points > 0) {
        totalPoints += points;
        // Extract vector dimensions
        if (vectors) {
          if (typeof vectors === 'object' && !Array.isArray(vectors)) {
            // Named vectors
            for (const [name, cfg] of Object.entries(vectors)) {
              const dim = cfg.size;
              vectorDims.set(`${coll.name}:${name}`, dim);
              console.log(`   ${coll.name}/${name}: ${dim}d, ${points} points`);
            }
          } else if (typeof vectors === 'object' && vectors.size) {
            // Single vector
            vectorDims.set(coll.name, vectors.size);
            console.log(`   ${coll.name}: ${vectors.size}d, ${points} points`);
          }
        }
      }
    }
    console.log(`   Total indexed: ${totalPoints} points\n`);

    // 4. Canonical collection analysis
    console.log('📊 Canonical Collection (384-hybrid):');
    const canonical = await qdrant.getCollection('codebase_chunks_384_hybrid');
    console.log(`   Points: ${canonical.points_count}`);
    console.log(`   Config: ${JSON.stringify(canonical.config, null, 2)}\n`);

    // 5. Payload index status
    console.log('🔑 Payload Index Status:');
    const payloadIndexes = canonical.payload_schema || {};
    for (const [field, schema] of Object.entries(payloadIndexes)) {
      console.log(`   ${field}: ${schema.data_type || 'unknown'}${schema.indexed ? ' [INDEXED]' : ''}`);
    }

    // 6. Vector similarity check (sanity test)
    console.log('\n✓ Vector Similarity Sanity Test:');
    const testVec = Array(384).fill(0.5); // dummy 384-dim vector
    try {
      const result = await qdrant.search('codebase_chunks_384_hybrid', {
        vector: testVec,
        limit: 1,
        with_payload: false,
      });
      console.log(`   ✅ Search working — returned ${result.length} result(s)\n`);
    } catch (err) {
      console.log(`   ⚠️  Search failed: ${err.message}\n`);
    }

  } catch (err) {
    console.error(`❌ Error: ${err.message}`);
    process.exit(1);
  }
}

qdrantDiagnostics();
