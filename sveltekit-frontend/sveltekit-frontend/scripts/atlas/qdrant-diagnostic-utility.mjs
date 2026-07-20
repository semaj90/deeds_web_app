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

    // 2. CUDA capabilities via config inspection
    console.log('🎮 CUDA/GPU Capabilities:');
    let cudaHints = { hnsw_enabled: false, optimizations: [] };
    
    for (const coll of health.collections.slice(0, 3)) {
      try {
        const config = await qdrant.getCollection(coll.name);
        const hnsw = config.config?.hnsw_config;
        
        if (hnsw) {
          cudaHints.hnsw_enabled = true;
          if (hnsw.m > 16) cudaHints.optimizations.push('high-m-factor');
          if (hnsw.ef_construction > 200) cudaHints.optimizations.push('aggressive-construction');
        }
      } catch (e) {}
    }
    console.log(`   ${cudaHints.hnsw_enabled ? '✅' : '⚠️'} HNSW: ${cudaHints.hnsw_enabled ? 'enabled' : 'disabled'}`);
    console.log(`   Optimizations: ${cudaHints.optimizations.length > 0 ? cudaHints.optimizations.join(', ') : 'none detected'}\n`);

    // 3. Collection inventory
    console.log('📦 Collection Inventory:');
    let totalPoints = 0;
    let collectionSummary = [];
    
    for (const coll of health.collections) {
      try {
        const config = await qdrant.getCollection(coll.name);
        const points = config.points_count || 0;
        
        if (points > 0) {
          totalPoints += points;
          let vecInfo = 'unknown';
          if (config.config?.vectors) {
            const vectors = config.config.vectors;
            if (typeof vectors === 'object' && !Array.isArray(vectors)) {
              // Named vectors
              const dims = Object.entries(vectors).map(([name, cfg]) => `${name}:${cfg.size}d`).join(', ');
              vecInfo = `named(${dims})`;
            } else if (vectors.size) {
              vecInfo = `${vectors.size}d`;
            }
          }
          collectionSummary.push({ name: coll.name, points, vecInfo });
        }
      } catch (e) {}
    }
    
    collectionSummary.sort((a, b) => b.points - a.points);
    collectionSummary.forEach(c => {
      console.log(`   ${c.name.padEnd(40)} ${String(c.points).padStart(6)} points (${c.vecInfo})`);
    });
    console.log(`\n   Total indexed: ${totalPoints} points\n`);

    // 4. Canonical collection detail
    console.log('📊 Canonical Collection (384-hybrid):');
    try {
      const canonical = await qdrant.getCollection('codebase_chunks_384_hybrid');
      console.log(`   Points: ${canonical.points_count}`);
      if (canonical.config?.vectors) {
        for (const [name, vec] of Object.entries(canonical.config.vectors)) {
          console.log(`   Vector "${name}": ${vec.size}d`);
        }
      }
    } catch (e) {
      console.log(`   ⚠️  Collection not found`);
    }

    // 5. Payload schema
    console.log('\n🔑 Payload Schema:');
    try {
      const canonical = await qdrant.getCollection('codebase_chunks_384_hybrid');
      const schema = canonical.payload_schema || {};
      const keys = Object.keys(schema);
      if (keys.length > 0) {
        keys.slice(0, 10).forEach(k => {
          const indexed = schema[k].indexed ? '[indexed]' : '';
          console.log(`   ${k}: ${schema[k].data_type || 'unknown'} ${indexed}`);
        });
        if (keys.length > 10) console.log(`   ... and ${keys.length - 10} more`);
      } else {
        console.log(`   (no schema defined)`);
      }
    } catch (e) {}

    console.log('\n✅ Diagnostics complete');

  } catch (err) {
    console.error(`❌ Error: ${err.message}`);
    process.exit(1);
  }
}

qdrantDiagnostics();
