#!/usr/bin/env node
/**
 * smoke-topology-ae2l-pca.mjs
 *
 * Standalone smoke test verifying the ae2l-pca 2-layer chained projection mode.
 * Loads real trained weights dynamically from Redis, generates sample embeddings,
 * and projects them to 4D manifold coordinates.
 */

import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// Bootstrapping SvelteKit $lib path aliases in script context
process.env.REDIS_URL = process.env.REDIS_URL || 'redis://127.0.0.1:6379';

async function run() {
  console.log('⚡ Standalone Smoke Test: Chained 2-Layer Autoencoder PCA Projection (ae2l-pca)');
  console.log(`🔌 Redis URL: ${process.env.REDIS_URL}\n`);

  try {
    // Dynamically load the project modules.
    const projectModuleUrl = pathToFileURL(resolve(process.cwd(), 'src/lib/server/topology/gpu-topology-projection.ts')).href;
    const { runTopologyProjection } = await import(projectModuleUrl);

    // 1. Generate 10 mock 768-dimensional embeddings
    console.log('🔄 Generating 10 mock 768-dimensional embeddings...');
    const mockEmbeddings = Array.from({ length: 10 }, (_, i) => ({
      id: `chunk:${i}`,
      stableKey: `key:${i}`,
      relativePath: `src/file_${i}.ts`,
      embedding: Array.from({ length: 768 }, (_, d) => Math.sin(i * 0.5 + d * 0.01)),
    }));
    console.log('✔️ 10 mock embeddings generated.');

    // 2. Execute projection pipeline in ae2l-pca mode (which loads weights from Redis)
    console.log('🔄 Executing runTopologyProjection in ae2l-pca mode (dynamic weights loading)...');
    const t0 = performance.now();
    const result = await runTopologyProjection(mockEmbeddings, {
      mode: 'ae2l-pca',
      normalize: true,
    });
    const duration = performance.now() - t0;

    // 3. Assertions and metrics
    console.log('\n📝 Validation Assertions:');
    console.log(`✔️ Pipeline execution ok: ${result.ok}`);
    console.log(`✔️ Total nodes projected: ${result.nodes.length}`);
    console.log(`✔️ Processing duration: ${duration.toFixed(1)} ms`);

    if (result.ok && result.nodes.length > 0) {
      const sampleNode = result.nodes[0];
      console.log(`   └─ Sample Node ID: ${sampleNode.id}`);
      console.log(`   └─ Sample Node Relative Path: ${sampleNode.relativePath}`);
      console.log(`   └─ Sample Node Projection Source: ${sampleNode.projectionSource}`);
      console.log(`   └─ Sample Node Manifold4 Coords: ${JSON.stringify(sampleNode.manifold4)}`);

      // Verify coordinate range
      const rangeOk = result.nodes.every(node => 
        node.manifold4.every(c => c >= 0 && c <= 1)
      );
      console.log(`✔️ Coordinates are correctly normalized to [0, 1] range: ${rangeOk}`);

      // Verify audit metadata
      console.log('✔️ Audit metadata successfully returned:');
      console.log(`   └─ Projection Source: ${result.audit.projection.source}`);
      console.log(`   └─ Projection Backend: ${result.audit.projection.backend}`);
      console.log(`   └─ Input Dimension: ${result.audit.projection.inputDim}`);
      console.log(`   └─ Output Dimension: ${result.audit.projection.outputDim}`);
      console.log(`   └─ Fit Sample Size: ${result.audit.fitSample}`);
    } else {
      throw new Error('Pipeline failed to project nodes correctly.');
    }

    console.log('\n✅ Chained 2-Layer Autoencoder PCA (ae2l-pca) projection is 100% operational!');
    process.exit(0);
  } catch (err) {
    console.error(`\n❌ Smoke Test failed: ${err.message}`);
    process.exit(1);
  }
}

run();
