#!/usr/bin/env node
/**
 * Smoke Test: GPU Acceleration Workers
 *
 * Tests KMeans, SOM, and PageRank workers with small sample data
 * before full production execution.
 *
 * Usage:
 *   node scripts/atlas/smoke-test-gpu-workers.mjs --verbose
 */

import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isVerbose = process.argv.includes('--verbose') || process.argv.includes('-v');
const PYTHON_WORKERS_DIR = path.join(__dirname, '../../python-workers');

function log(msg, level = 'INFO') {
  const timestamp = new Date().toISOString().split('T')[1].slice(0, 8);
  console.log(`[${timestamp}] [${level}] ${msg}`);
}

function runWorker(scriptName, jobPayload) {
  return new Promise((resolve, reject) => {
    log(`Testing ${scriptName}...`, 'TEST');

    const python = spawn('python', [path.join(PYTHON_WORKERS_DIR, scriptName)], {
      env: {
        ...process.env,
        CUDA_VISIBLE_DEVICES: '0',
        PYTHONUNBUFFERED: '1',
      },
      timeout: 60000, // 60 seconds
    });

    let stdout = '';
    let stderr = '';

    python.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    python.stderr.on('data', (data) => {
      stderr += data.toString();
      if (isVerbose) log(`STDERR: ${data}`, 'STDERR');
    });

    python.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`${scriptName} exited with code ${code}: ${stderr}`));
      } else {
        try {
          const result = JSON.parse(stdout);
          resolve({ script: scriptName, result });
        } catch (e) {
          reject(new Error(`Invalid JSON from ${scriptName}: ${stdout}`));
        }
      }
    });

    python.stdin.write(JSON.stringify(jobPayload));
    python.stdin.end();
  });
}

async function testKMeans() {
  log('🔬 Testing KMeans worker...', 'TEST');

  // Generate random 100 points in 768-dim space
  const n = 100;
  const d = 768;
  const vectors = Array.from({ length: n }, () =>
    Array.from({ length: d }, () => Math.random() - 0.5)
  );

  const job = {
    vectors,
    k: 10,
    max_iter: 50,
    tol: 1e-4,
    random_seed: 42,
  };

  try {
    const { result } = await runWorker('worker_kmeans.py', job);

    // Verify result structure
    if (!Array.isArray(result.cluster_ids) || result.cluster_ids.length !== n) {
      throw new Error(`Expected ${n} cluster_ids, got ${result.cluster_ids.length}`);
    }
    if (!Array.isArray(result.centroids) || result.centroids.length !== 10) {
      throw new Error(`Expected 10 centroids, got ${result.centroids.length}`);
    }
    if (typeof result.confidence !== 'number' || result.confidence < 0 || result.confidence > 1) {
      throw new Error(`Invalid confidence: ${result.confidence}`);
    }

    log(`  ✓ KMeans PASS (confidence: ${(result.confidence * 100).toFixed(2)}%, iterations: ${result.iterations})`, 'PASS');
    return true;
  } catch (err) {
    log(`  ✗ KMeans FAIL: ${err.message}`, 'FAIL');
    return false;
  }
}

async function testSOM() {
  log('🔬 Testing SOM worker...', 'TEST');

  // Generate random 100 points in 768-dim space
  const n = 100;
  const d = 768;
  const vectors = Array.from({ length: n }, () =>
    Array.from({ length: d }, () => Math.random() - 0.5)
  );

  const job = {
    vectors,
    grid_size: 10,
    learning_rate: 0.5,
    epochs: 20,
    random_seed: 42,
  };

  try {
    const { result } = await runWorker('worker_som.py', job);

    // Verify result structure
    if (!Array.isArray(result.som_indices) || result.som_indices.length !== n) {
      throw new Error(`Expected ${n} som_indices, got ${result.som_indices.length}`);
    }
    if (!Array.isArray(result.bmu_grid_x) || result.bmu_grid_x.length !== n) {
      throw new Error(`Expected ${n} bmu_grid_x, got ${result.bmu_grid_x.length}`);
    }
    if (!Array.isArray(result.bmu_grid_y) || result.bmu_grid_y.length !== n) {
      throw new Error(`Expected ${n} bmu_grid_y, got ${result.bmu_grid_y.length}`);
    }
    if (typeof result.convergence !== 'number' || result.convergence < 0 || result.convergence > 1) {
      throw new Error(`Invalid convergence: ${result.convergence}`);
    }

    log(`  ✓ SOM PASS (convergence: ${(result.convergence * 100).toFixed(2)}%, epochs: ${result.epochs_trained})`, 'PASS');
    return true;
  } catch (err) {
    log(`  ✗ SOM FAIL: ${err.message}`, 'FAIL');
    return false;
  }
}

async function testPageRank() {
  log('🔬 Testing PageRank worker...', 'TEST');

  // Create a small graph (20 nodes, ~40 edges)
  const edges = [];
  for (let i = 0; i < 20; i++) {
    const outDegree = Math.floor(Math.random() * 4) + 1;
    for (let j = 0; j < outDegree; j++) {
      const dest = Math.floor(Math.random() * 20);
      edges.push([i, dest]);
    }
  }

  const job = {
    edges,
    personalization: Array(20).fill(1 / 20),
    damping: 0.85,
    iterations: 30,
    tol: 1e-4,
    random_seed: 42,
  };

  try {
    const { result } = await runWorker('worker_pagerank.py', job);

    // Verify result structure
    if (!Array.isArray(result.node_ids) || result.node_ids.length === 0) {
      throw new Error('No node_ids returned');
    }
    if (!Array.isArray(result.pagerank_scores) || result.pagerank_scores.length !== result.node_ids.length) {
      throw new Error(`Score count (${result.pagerank_scores.length}) doesn't match node count (${result.node_ids.length})`);
    }
    if (result.pagerank_scores.some(s => s < 0 || s > 1)) {
      throw new Error('PageRank scores outside [0, 1]');
    }

    log(`  ✓ PageRank PASS (nodes: ${result.node_ids.length}, convergence: ${(result.convergence * 100).toFixed(2)}%, iterations: ${result.iterations})`, 'PASS');
    return true;
  } catch (err) {
    log(`  ✗ PageRank FAIL: ${err.message}`, 'FAIL');
    return false;
  }
}

async function main() {
  console.log('\n🚀 GPU Acceleration Worker Smoke Test\n');

  const results = {
    kmeans: false,
    som: false,
    pagerank: false,
  };

  try {
    log('Starting smoke tests...', 'INFO');

    results.kmeans = await testKMeans();
    results.som = await testSOM();
    results.pagerank = await testPageRank();

    // Summary
    const passed = Object.values(results).filter(v => v).length;
    const total = Object.keys(results).length;

    console.log('\n📊 Summary:\n');
    console.log(`  KMeans:   ${results.kmeans ? '✓ PASS' : '✗ FAIL'}`);
    console.log(`  SOM:      ${results.som ? '✓ PASS' : '✗ FAIL'}`);
    console.log(`  PageRank: ${results.pagerank ? '✓ PASS' : '✗ FAIL'}`);
    console.log(`\n  Total: ${passed}/${total} workers passed\n`);

    if (passed === total) {
      log('🎉 All smoke tests PASSED! Ready for production execution.', 'SUCCESS');
      process.exit(0);
    } else {
      log('❌ Some smoke tests FAILED. Check errors above.', 'FAILURE');
      process.exit(1);
    }
  } catch (err) {
    log(`Fatal error: ${err.message}`, 'FATAL');
    process.exit(1);
  }
}

main();
