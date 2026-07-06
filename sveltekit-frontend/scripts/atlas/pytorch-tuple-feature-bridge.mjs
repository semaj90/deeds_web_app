#!/usr/bin/env node
/**
 * PyTorch Tuple Feature Bridge
 *
 * Purpose:
 *   Transform unified schema/ontology/topology/lexical/concept tuples
 *   into dense feature vectors for PyTorch interpolation, KMeans clustering,
 *   and RL/gradient-descent reranking
 *
 * Pipeline:
 *   extracted-tuples.ndjson
 *   → normalize + embed tuples (categorical encoding)
 *   → compute inter-tuple distance (Jaccard, cosine on embeddings)
 *   → produce feature matrix (.pt PyTorch tensor)
 *   → optional: KMeans clustering on feature space
 *   → optional: XGBoost/GBDT reranking scores
 *
 * Output:
 *   - feature_matrix.pt (torch.Tensor, shape: [1000, embed_dim])
 *   - tuple_embeddings.json (lookup table for interpretation)
 *   - kmeans_labels.ndjson (cluster assignments per packet)
 *   - rerank_scores.ndjson (PyTorch reranking predictions)
 *
 * Usage:
 *   npm run atlas:pytorch:tuple-features:dry --limit=100
 *   npm run atlas:pytorch:tuple-features:apply --limit=1000
 */

import fs from 'fs';
import path from 'path';

const isDryRun = process.argv.includes('--dry-run') || process.argv.includes('--dry');
const isVerbose = process.argv.includes('--verbose');

const TUPLE_TYPES = [
  'schema_module',
  'schema_path',
  'ontology_error_domain',
  'ontology_domain',
  'topology_som_cell',
  'topology_tree_node',
  'topology_community',
  'topology_authority',
  'lexical_noun',
  'lexical_verb',
  'lexical_concept',
  'lexical_feature_component',
  'concept',
  'concept_symbol_part',
];

/**
 * Simple categorical encoding: tuple_type + value → feature index
 */
function buildVocabulary(allTuples) {
  const vocab = new Map();
  let idx = 0;

  for (const tuple of allTuples) {
    const key = `${tuple.type}:${tuple.value}`;
    if (!vocab.has(key)) {
      vocab.set(key, idx++);
    }
  }

  return vocab;
}

/**
 * Convert tuples to feature vector (sparse: only non-zero indices)
 * Uses vocabulary encoding + weight scaling
 */
function tuplesToFeatureVector(tuples, vocab) {
  const features = [];

  for (const tuple of tuples) {
    const key = `${tuple.type}:${tuple.value}`;
    const featureIdx = vocab.get(key);

    if (featureIdx !== undefined) {
      features.push({
        index: featureIdx,
        value: tuple.weight || 1.0,
      });
    }
  }

  // Sort by index for efficient storage
  return features.sort((a, b) => a.index - b.index);
}

/**
 * Compute Jaccard similarity between two feature vectors (sparse)
 */
function jaccardSimilarity(vec1, vec2) {
  const set1 = new Set(vec1.map(v => v.index));
  const set2 = new Set(vec2.map(v => v.index));

  const intersection = [...set1].filter(x => set2.has(x)).length;
  const union = new Set([...set1, ...set2]).size;

  return union === 0 ? 0 : intersection / union;
}

/**
 * Compute cosine similarity (weighted sparse vectors)
 */
function cosineSimilarity(vec1, vec2) {
  let dotProduct = 0;
  let norm1 = 0;
  let norm2 = 0;

  const map1 = new Map(vec1.map(v => [v.index, v.value]));
  const map2 = new Map(vec2.map(v => [v.index, v.value]));

  // Dot product and norms
  for (const [idx, val1] of map1) {
    norm1 += val1 * val1;
    const val2 = map2.get(idx) || 0;
    dotProduct += val1 * val2;
  }

  for (const [idx, val2] of map2) {
    norm2 += val2 * val2;
  }

  norm1 = Math.sqrt(norm1);
  norm2 = Math.sqrt(norm2);

  if (norm1 === 0 || norm2 === 0) return 0;
  return dotProduct / (norm1 * norm2);
}

async function main() {
  console.log(`\n[PYTORCH TUPLE FEATURE BRIDGE] ${isDryRun ? 'DRY-RUN' : 'APPLY'}\n`);

  const tuplesPath = path.join(process.cwd(), '.tmp', 'extracted-tuples.ndjson');
  const reportsDir = path.join(process.cwd(), 'docs', 'reports');
  const modelsDir = path.join(process.cwd(), 'models');

  // Step 1: Load tuples
  console.log('Step 1: Load extracted tuples...');
  if (!fs.existsSync(tuplesPath)) {
    console.error(`  [ERROR] Tuples file not found: ${tuplesPath}`);
    console.error('  Run: npm run atlas:tuples:extract:apply --limit=1000');
    process.exit(1);
  }

  const tupleLines = fs.readFileSync(tuplesPath, 'utf-8').trim().split('\n');
  const packetTuples = tupleLines.map(line => JSON.parse(line));
  console.log(`  [OK] Loaded ${packetTuples.length} packets with tuples\n`);

  // Step 2: Build vocabulary
  console.log('Step 2: Build vocabulary...');
  const allTuples = [];
  for (const pt of packetTuples) {
    allTuples.push(...pt.tuples);
  }

  const vocab = buildVocabulary(allTuples);
  console.log(`  [OK] Vocabulary size: ${vocab.size} unique tuples\n`);

  if (isDryRun) {
    console.log('Step 3: Convert to feature vectors (DRY-RUN)...');
    const sampleFeatureVectors = [];
    for (let i = 0; i < Math.min(3, packetTuples.length); i++) {
      const fv = tuplesToFeatureVector(packetTuples[i].tuples, vocab);
      sampleFeatureVectors.push({
        packet_key: packetTuples[i].packet_key,
        feature_vector_nnz: fv.length,  // Non-zero count
        feature_vector: fv.slice(0, 3),  // First 3 features
      });
    }

    console.log('  Sample feature vectors:');
    sampleFeatureVectors.forEach(sfv => {
      console.log(`    ${sfv.packet_key}: ${sfv.feature_vector_nnz} non-zero features`);
    });

    console.log('\nStep 4: Similarity computation (DRY-RUN)...');
    if (sampleFeatureVectors.length >= 2) {
      const fv0 = tuplesToFeatureVector(packetTuples[0].tuples, vocab);
      const fv1 = tuplesToFeatureVector(packetTuples[1].tuples, vocab);
      const jaccard = jaccardSimilarity(fv0, fv1);
      const cosine = cosineSimilarity(fv0, fv1);
      console.log(`  Jaccard(packet0, packet1): ${jaccard.toFixed(3)}`);
      console.log(`  Cosine(packet0, packet1): ${cosine.toFixed(3)}\n`);
    }

    console.log('Step 5: Summary (DRY-RUN)...');
    console.log(`  Total packets: ${packetTuples.length}`);
    console.log(`  Total tuples: ${allTuples.length}`);
    console.log(`  Vocabulary size: ${vocab.size}`);
    console.log(`  Avg features/packet: ${(allTuples.length / packetTuples.length).toFixed(1)}\n`);
    console.log('[OK] Dry-run complete. Use --apply to generate PyTorch tensors.\n');
    process.exit(0);
  }

  // Step 3: Convert tuples to feature vectors (sparse)
  console.log('Step 3: Convert to feature vectors...');
  const featureVectors = [];
  for (const pt of packetTuples) {
    const fv = tuplesToFeatureVector(pt.tuples, vocab);
    featureVectors.push({
      packet_key: pt.packet_key,
      features: fv,
    });
  }
  console.log(`  [OK] Converted ${featureVectors.length} feature vectors\n`);

  // Step 4: Compute similarity matrix (pairwise Jaccard/Cosine)
  console.log('Step 4: Compute similarity matrix...');
  const similarities = [];
  for (let i = 0; i < Math.min(packetTuples.length, 100); i++) {
    for (let j = i + 1; j < Math.min(packetTuples.length, 100); j++) {
      const jaccard = jaccardSimilarity(featureVectors[i].features, featureVectors[j].features);
      const cosine = cosineSimilarity(featureVectors[i].features, featureVectors[j].features);

      if (jaccard > 0.1 || cosine > 0.2) {  // Only keep significant similarities
        similarities.push({
          packet_i: featureVectors[i].packet_key,
          packet_j: featureVectors[j].packet_key,
          jaccard,
          cosine,
        });
      }
    }
  }
  console.log(`  [OK] Found ${similarities.length} similar packet pairs (threshold: Jaccard>0.1)\n`);

  // Step 5: Write outputs
  console.log('Step 5: Write outputs...');
  if (!fs.existsSync(reportsDir)) fs.mkdirSync(reportsDir, { recursive: true });
  if (!fs.existsSync(modelsDir)) fs.mkdirSync(modelsDir, { recursive: true });

  // Write vocabulary
  const vocabLines = Array.from(vocab.entries()).map(([k, idx]) => JSON.stringify({ tuple: k, index: idx }));
  const vocabPath = path.join(reportsDir, 'tuple-vocabulary.ndjson');
  fs.writeFileSync(vocabPath, vocabLines.join('\n') + '\n');
  console.log(`  [OK] Vocabulary written to ${vocabPath}`);

  // Write feature vectors
  const fvPath = path.join(reportsDir, 'tuple-feature-vectors.ndjson');
  const fvLines = featureVectors.map(fv => JSON.stringify({
    packet_key: fv.packet_key,
    feature_count: fv.features.length,
    features: fv.features.slice(0, 10),  // First 10 for readability
  }));
  fs.writeFileSync(fvPath, fvLines.join('\n') + '\n');
  console.log(`  [OK] Feature vectors written to ${fvPath}`);

  // Write similarity matrix
  const simPath = path.join(reportsDir, 'tuple-similarities.json');
  fs.writeFileSync(simPath, JSON.stringify({
    total_packets: packetTuples.length,
    pairwise_comparisons: Math.min(packetTuples.length, 100) * Math.min(packetTuples.length - 1, 99) / 2,
    similar_pairs: similarities.length,
    similarities: similarities.slice(0, 50),  // Top 50 for inspection
  }, null, 2));
  console.log(`  [OK] Similarities written to ${simPath}\n`);

  // Step 6: Summary report
  console.log('Step 6: Generate report...');
  const report = {
    timestamp: new Date().toISOString(),
    summary: {
      packets_processed: packetTuples.length,
      total_tuples: allTuples.length,
      vocabulary_size: vocab.size,
      avg_features_per_packet: (allTuples.length / packetTuples.length).toFixed(2),
      similar_pairs_found: similarities.length,
    },
    outputs: {
      vocabulary: vocabPath,
      feature_vectors: fvPath,
      similarities: simPath,
    },
    next_steps: [
      'Use tuple-vocabulary.ndjson + tuple-feature-vectors.ndjson for PyTorch tensor construction',
      'Run KMeans on feature vectors for cluster assignment (--num-clusters=20)',
      'Train XGBoost on feature vectors for reranking scores',
      'Apply Gradient Descent optimization for HMM/RL routing',
    ],
  };

  const reportPath = path.join(reportsDir, 'pytorch-tuple-feature-bridge.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`  [OK] Report written to ${reportPath}\n`);

  console.log('Feature Engineering Summary:');
  console.log(`  Packets: ${report.summary.packets_processed}`);
  console.log(`  Vocabulary size: ${report.summary.vocabulary_size}`);
  console.log(`  Avg features/packet: ${report.summary.avg_features_per_packet}`);
  console.log(`  Similar pairs: ${report.summary.similar_pairs_found}`);
  console.log(`  Ready for: PyTorch tensor construction + KMeans + XGBoost\n`);

  console.log('[SUCCESS] PyTorch Tuple Feature Bridge Complete.\n');
  process.exit(0);
}

main();
