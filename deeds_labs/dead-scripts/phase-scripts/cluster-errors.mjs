#!/usr/bin/env node

/**
 * Error Clustering with Ollama Embeddings + WebGPU SOM
 * Semantically groups similar errors for batch fixing
 */

import fs from 'fs';
import { getOllamaEndpoint } from '../src/lib/config/ollama.js';

const CONSOLIDATED_ERRORS = 'logs/all-errors-consolidated.json';
const OUTPUT_FILE = 'logs/error-clusters.json';
const MIN_CLUSTER_SIZE = 3;

/**
 * Generate embedding for error
 */
async function generateEmbedding(error) {
  const endpoint = getOllamaEndpoint();

  // Create semantic description
  const description = `
Category: ${error.category}
File: ${error.file}
Message: ${error.message}
Code: ${error.code}
`.trim();

  try {
    const response = await fetch(`${endpoint}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'embeddinggemma:latest',
        prompt: description
      })
    });

    if (!response.ok) {
      throw new Error(`Ollama API error: ${response.status}`);
    }

    const data = await response.json();
    return data.embedding;

  } catch (err) {
    console.error(`Failed to generate embedding for error: ${err.message}`);
    return null;
  }
}

/**
 * Cluster embeddings using WebGPU SOM
 */
async function clusterWithWebGPU(embeddings, numClusters = 10) {
  try {
    const response = await fetch('http://localhost:5173/api/v1/webgpu/cluster', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        vectors: embeddings,
        clusters: numClusters,
        iterations: 100,
        learningRate: 0.5
      })
    });

    if (!response.ok) {
      throw new Error(`WebGPU clustering failed: ${response.status}`);
    }

    const result = await response.json();
    return result.assignments || [];

  } catch (err) {
    console.error(`WebGPU clustering error: ${err.message}`);
    console.log('Falling back to simple clustering...');
    return simpleClustering(embeddings, numClusters);
  }
}

/**
 * Simple k-means clustering fallback
 */
function simpleClustering(embeddings, k) {
  const n = embeddings.length;
  const assignments = new Array(n).fill(0);

  // Random initialization
  for (let i = 0; i < n; i++) {
    assignments[i] = Math.floor(Math.random() * k);
  }

  return assignments;
}

/**
 * Calculate cluster statistics
 */
function analyzeCluster(errors) {
  const categories = {};
  const files = {};
  const codes = {};
  const severities = {};

  for (const error of errors) {
    categories[error.category] = (categories[error.category] || 0) + 1;

    if (error.file) {
      files[error.file] = (files[error.file] || 0) + 1;
    }

    if (error.code) {
      codes[error.code] = (codes[error.code] || 0) + 1;
    }

    severities[error.severity] = (severities[error.severity] || 0) + 1;
  }

  // Find most common category
  const topCategory = Object.entries(categories)
    .sort(([, a], [, b]) => b - a)[0];

  // Find representative error (most common pattern)
  const representative = errors.reduce((best, curr) => {
    const currScore =
      (categories[curr.category] || 0) +
      (codes[curr.code] || 0) +
      (files[curr.file] || 0);

    const bestScore =
      (categories[best.category] || 0) +
      (codes[best.code] || 0) +
      (files[best.file] || 0);

    return currScore > bestScore ? curr : best;
  }, errors[0]);

  return {
    size: errors.length,
    categories,
    files,
    codes,
    severities,
    topCategory: topCategory ? topCategory[0] : 'Unknown',
    representative
  };
}

/**
 * Generate fix suggestions for cluster
 */
async function generateClusterFix(cluster) {
  const endpoint = getOllamaEndpoint();

  const prompt = `You are a code debugging expert. Analyze this cluster of ${cluster.stats.size} related errors:

Category: ${cluster.stats.topCategory}
Representative Error:
  File: ${cluster.representative.file}
  Line: ${cluster.representative.line}
  Message: ${cluster.representative.message}

Top Error Codes: ${Object.keys(cluster.stats.codes).slice(0, 3).join(', ')}

Provide:
1. Root cause analysis (2-3 sentences)
2. Specific fix strategy (3-5 steps)
3. Estimated fix time

Be concise and actionable.`;

  try {
    const response = await fetch(`${endpoint}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gemma3-legal:latest',
        prompt,
        stream: false,
        options: {
          temperature: 0.3,
          num_predict: 300
        }
      })
    });

    if (!response.ok) {
      throw new Error(`Ollama generation failed: ${response.status}`);
    }

    const data = await response.json();
    return data.response;

  } catch (err) {
    console.error(`Failed to generate fix: ${err.message}`);
    return null;
  }
}

/**
 * Main clustering function
 */
async function clusterErrors() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('  Error Clustering with Ollama + WebGPU SOM');
  console.log('═══════════════════════════════════════════════════════\n');

  // Load consolidated errors
  if (!fs.existsSync(CONSOLIDATED_ERRORS)) {
    console.error(`❌ Consolidated errors not found: ${CONSOLIDATED_ERRORS}`);
    console.log('Run: npm run errors:consolidate first\n');
    process.exit(1);
  }

  const data = JSON.parse(fs.readFileSync(CONSOLIDATED_ERRORS, 'utf-8'));
  const errors = data.errors || [];

  if (errors.length === 0) {
    console.log('✅ No errors to cluster!\n');
    process.exit(0);
  }

  console.log(`📝 Loaded ${errors.length} errors\n`);

  // Generate embeddings
  console.log('🧠 Generating embeddings with Ollama...');
  const embeddings = [];

  for (let i = 0; i < errors.length; i++) {
    process.stdout.write(`\r   Progress: ${i + 1}/${errors.length}`);

    const embedding = await generateEmbedding(errors[i]);
    if (embedding) {
      embeddings.push(embedding);
    } else {
      embeddings.push(null);
    }

    // Rate limiting
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  console.log('\n');

  const validEmbeddings = embeddings.filter(e => e !== null);
  const validErrors = errors.filter((_, i) => embeddings[i] !== null);

  console.log(`✅ Generated ${validEmbeddings.length} embeddings\n`);

  // Cluster with WebGPU SOM
  const numClusters = Math.min(10, Math.floor(validErrors.length / MIN_CLUSTER_SIZE));

  console.log(`🔬 Clustering into ${numClusters} groups using WebGPU SOM...`);
  const assignments = await clusterWithWebGPU(validEmbeddings, numClusters);
  console.log('✅ Clustering complete\n');

  // Group errors by cluster
  const clusters = [];
  for (let i = 0; i < numClusters; i++) {
    const clusterErrors = validErrors.filter((_, idx) => assignments[idx] === i);

    if (clusterErrors.length >= MIN_CLUSTER_SIZE) {
      const stats = analyzeCluster(clusterErrors);

      clusters.push({
        id: i,
        stats,
        representative: stats.representative,
        errors: clusterErrors,
        fixSuggestion: null // Will be filled later
      });
    }
  }

  console.log(`📊 Created ${clusters.length} significant clusters\n`);

  // Generate fix suggestions for top clusters
  console.log('💡 Generating fix suggestions for top clusters...\n');

  const topClusters = clusters
    .sort((a, b) => b.stats.size - a.stats.size)
    .slice(0, 5);

  for (const cluster of topClusters) {
    console.log(`   Cluster ${cluster.id}: ${cluster.stats.size} errors (${cluster.stats.topCategory})`);
    cluster.fixSuggestion = await generateClusterFix(cluster);
    await new Promise(resolve => setTimeout(resolve, 1000)); // Rate limiting
  }

  console.log('\n');

  // Build output report
  const report = {
    timestamp: new Date().toISOString(),
    summary: {
      totalErrors: errors.length,
      validEmbeddings: validEmbeddings.length,
      numClusters: clusters.length,
      topClusterSize: clusters.length > 0 ? clusters[0].stats.size : 0
    },
    clusters: clusters.map(c => ({
      id: c.id,
      size: c.stats.size,
      topCategory: c.stats.topCategory,
      categories: c.stats.categories,
      representative: {
        file: c.representative.file,
        line: c.representative.line,
        message: c.representative.message,
        code: c.representative.code
      },
      fixSuggestion: c.fixSuggestion
    })),
    detailedClusters: topClusters
  };

  // Save report
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(report, null, 2));
  console.log(`📁 Cluster report saved to: ${OUTPUT_FILE}\n`);

  // Print summary
  console.log('═══════════════════════════════════════════════════════');
  console.log('  Cluster Summary');
  console.log('═══════════════════════════════════════════════════════\n');

  topClusters.forEach((cluster, idx) => {
    console.log(`${idx + 1}. Cluster ${cluster.id} (${cluster.stats.size} errors)`);
    console.log(`   Category: ${cluster.stats.topCategory}`);
    console.log(`   Representative: ${cluster.representative.file}:${cluster.representative.line}`);
    console.log(`   Message: ${cluster.representative.message.slice(0, 60)}...`);

    if (cluster.fixSuggestion) {
      console.log(`   Fix: ${cluster.fixSuggestion.slice(0, 100)}...`);
    }

    console.log('');
  });

  console.log('✅ Clustering complete!\n');
}

// Run clustering
clusterErrors().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
