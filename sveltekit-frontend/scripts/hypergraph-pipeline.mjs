#!/usr/bin/env node
/**
 * hypergraph-pipeline.mjs
 * 
 * Orchestrates the full hypergraph build pipeline:
 * 1. Export embeddings from Qdrant
 * 2. Build centroids + assignments (streaming k-means)
 * 3. Index centroid topology (neighbors)
 * 4. Tag Qdrant points with cluster assignments
 * 5. (Optional) Summarize clusters via Ollama
 */
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';

async function runScript(scriptPath, args) {
  return new Promise((resolve, reject) => {
    console.log(`\n🚀 Running: node ${scriptPath} ${args.join(' ')}`);
    const proc = spawn('node', [scriptPath, ...args], { stdio: 'inherit' });
    proc.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Script ${scriptPath} failed with code ${code}`));
    });
  });
}

async function main() {
  const collection = process.argv[2] || 'codebase_chunks_768';
  const k = process.argv[3] || '100';
  const tmpDir = './tmp/hypergraph';
  
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
  
  const embeddingsFile = path.join(tmpDir, `${collection}-embeddings.ndjson`);
  const centroidsFile = path.join(tmpDir, `${collection}-centroids.json`);
  const assignmentsFile = path.join(tmpDir, `${collection}-assignments.ndjson`);
  
  try {
    // 1. Export
    await runScript('scripts/export-embeddings-qdrant.mjs', [
      '--collection', collection,
      '--output', embeddingsFile,
      '--batch', '500'
    ]);
    
    // 2. Build
    await runScript('scripts/hypergraph-build.mjs', [
      '--input', embeddingsFile,
      '--clusters', k,
      '--out', centroidsFile,
      '--assignments', assignmentsFile,
      '--redis', 'redis://127.0.0.1:6379',
      '--prefix', `hypergraph:${collection}`
    ]);
    
    // 3. Topology
    await runScript('scripts/hypergraph-topology-writer.mjs', [
      '--centroids', centroidsFile,
      '--redis', 'redis://127.0.0.1:6379',
      '--prefix', `hypergraph:${collection}`,
      '--k', '16'
    ]);
    
    // 4. Tag
    await runScript('scripts/hypergraph-tag-qdrant.mjs', [
      '--assignments', assignmentsFile,
      '--collection', collection
    ]);
    
    // 5. Digest
    await runScript('scripts/hypergraph-cluster-digest.mjs', [
      '--collection', collection
    ]);
    
    // 6. Sync
    await runScript('scripts/sync-hypergraph-to-redis.mjs', []);
    await runScript('scripts/sync-clusters-to-kag.mjs', []);
    
    console.log('\n✅ Hypergraph pipeline completed successfully.');
    console.log(`- Embeddings: ${embeddingsFile}`);
    console.log(`- Centroids: ${centroidsFile}`);
    console.log(`- Assignments: ${assignmentsFile}`);
    
  } catch (err) {
    console.error(`\n❌ Pipeline failed: ${err.message}`);
    process.exit(1);
  }
}

main();
