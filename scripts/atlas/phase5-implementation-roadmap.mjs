#!/usr/bin/env node
/**
 * Phase 5 Implementation Roadmap
 *
 * Maps 17 evaluation layers to executable npm tasks and implementation milestones.
 * Defines parallel work streams, dependencies, and success criteria.
 */

import { execSync } from 'child_process';
import { existsSync } from 'fs';
import { resolve } from 'path';

const REPO_ROOT = resolve(new URL(import.meta.url).pathname, '../../..').replace(/^\/([A-Z]:)/, '$1');

const LAYERS = [
  {
    id: 1,
    name: 'Freeze Canonical Evaluation Corpus',
    script: 'scripts/atlas/freeze-eval-corpus.mjs',
    npm: 'atlas:eval:freeze',
    duration: '2-3h',
    dependencies: [],
    criticalPath: true,
    description: 'Export deterministic snapshot from Postgres: chunks.arrow, vectors, row-map, ontology, manifest'
  },
  {
    id: 2,
    name: 'Test Single-Vector Representations',
    script: 'tests/atlas/vectors/single-vector.eval.py',
    npm: 'atlas:eval:single-vector',
    duration: '3-4h',
    dependencies: [1],
    criticalPath: true,
    description: 'Benchmark content/summary/signature/latent/topology vectors separately'
  },
  {
    id: 3,
    name: 'Test Multi-Vector Fusion',
    script: 'tests/atlas/vectors/multi-vector-fusion.eval.py',
    npm: 'atlas:eval:fusion',
    duration: '2-3h',
    dependencies: [2],
    criticalPath: true,
    description: 'Compare RRF vs weighted fusion vs baselines'
  },
  {
    id: 4,
    name: 'Test Domain Classification',
    script: 'tests/atlas/domain/domain-classifier.eval.py',
    npm: 'atlas:eval:domain',
    duration: '3-4h',
    dependencies: [1],
    criticalPath: false,
    description: 'Evaluate Naive Bayes / XGBoost domain classification (Macro F1 ≥0.85)'
  },
  {
    id: 5,
    name: 'Test SOM and K-means Clustering',
    script: 'tests/atlas/clustering/som-quality.eval.py',
    npm: 'atlas:eval:clustering',
    duration: '2-3h',
    dependencies: [1],
    criticalPath: false,
    description: 'Measure quantization error, silhouette score, domain purity'
  },
  {
    id: 6,
    name: 'Test Ranking Features and XGBoost',
    script: 'tests/atlas/ranking/reranker-ablation.eval.py',
    npm: 'atlas:eval:ranking',
    duration: '3-4h',
    dependencies: [2, 4],
    criticalPath: false,
    description: 'Ablation study: dense only → dense+SOM → dense+domain → full XGBoost'
  },
  {
    id: 7,
    name: 'Test Ontology Tuples',
    script: 'tests/atlas/ontology/tuple-validation.test.ts',
    npm: 'atlas:eval:ontology',
    duration: '2h',
    dependencies: [1],
    criticalPath: false,
    description: 'Validate knowledge graph (IMPLEMENTS, USES_SCHEMA, DEPENDS_ON, etc.)'
  },
  {
    id: 8,
    name: 'Test Multi-hop Retrieval',
    script: 'tests/atlas/ontology/multihop-retrieval.eval.py',
    npm: 'atlas:eval:multihop',
    duration: '2-3h',
    dependencies: [7],
    criticalPath: false,
    description: 'Measure irrelevant expansion, answer coverage, hop count distribution'
  },
  {
    id: 9,
    name: 'Test Arrow and mmap Correctness',
    script: 'tests/atlas/storage/arrow-roundtrip.test.py',
    npm: 'atlas:eval:storage',
    duration: '1-2h',
    dependencies: [1],
    criticalPath: false,
    description: 'Round-trip verification: Postgres → Arrow → mmap → GPU'
  },
  {
    id: 10,
    name: 'Test cuVS and Qdrant',
    script: 'tests/atlas/vectors/cuvs-recall.eval.py',
    npm: 'atlas:eval:cuvs',
    duration: '1-2h',
    dependencies: [2],
    criticalPath: true,
    description: 'Compare cuVS IVF-Flat vs Qdrant HNSW (Phase 4 continuation)'
  },
  {
    id: 11,
    name: 'Test Redis/BitFrost Packets',
    script: 'tests/atlas/packets/bitfrost-isolation.test.ts',
    npm: 'atlas:eval:bitfrost',
    duration: '1-2h',
    dependencies: [],
    criticalPath: false,
    description: 'Verify cache isolation, cross-tenant leakage, stale rejection'
  },
  {
    id: 12,
    name: 'Test CHROM97 Packet Packing',
    script: 'tests/atlas/packets/chrom97-roundtrip.test.ts',
    npm: 'atlas:eval:chrom97',
    duration: '1-2h',
    dependencies: [1],
    criticalPath: false,
    description: 'Compact packet round-trip: encode ↔ decode, version migration'
  },
  {
    id: 13,
    name: 'Test RPC and A2A Boundaries',
    script: 'tests/atlas/rpc/grpc-contract.test.ts',
    npm: 'atlas:eval:rpc',
    duration: '2h',
    dependencies: [],
    criticalPath: false,
    description: 'Verify gRPC schema parity, trace propagation, authorization'
  },
  {
    id: 14,
    name: 'Test DAG and Kanban Transitions',
    script: 'tests/atlas/workflow/dag-transition.test.ts',
    npm: 'atlas:eval:workflow',
    duration: '2h',
    dependencies: [],
    criticalPath: false,
    description: 'State atomicity, DAG ordering, cycle detection'
  },
  {
    id: 15,
    name: 'Test Cache Warming Loops',
    script: 'tests/atlas/cache/warming-loops.test.ts',
    npm: 'atlas:eval:cache',
    duration: '1-2h',
    dependencies: [11],
    criticalPath: false,
    description: 'Promotion policy: retrieved → ranked → validated → promoted'
  },
];

const IMPLEMENTATIONS = [
  {
    name: 'RRF Fusion Module',
    path: 'sveltekit-frontend/src/lib/server/retrieval/rrf-fusion.ts',
    duration: '2-3h',
    blocksLayers: [3, 6],
    description: 'Score fusion: RRF + weighted blend of signals'
  },
  {
    name: 'Signal Normalizer',
    path: 'sveltekit-frontend/src/lib/server/retrieval/signal-normalizer.ts',
    duration: '1-2h',
    blocksLayers: [3, 6],
    description: 'Normalize 6+ retrieval signals to [0,1] scale'
  },
  {
    name: 'Retrieval Orchestrator',
    path: 'sveltekit-frontend/src/lib/server/retrieval/go-retrieval-facade.ts',
    duration: '2-3h',
    blocksLayers: [2, 3, 6],
    description: 'Wire RRF into main retrieval path'
  },
  {
    name: 'RRF API Endpoint',
    path: 'sveltekit-frontend/src/routes/api/retrieval/rrf/+server.ts',
    duration: '1h',
    blocksLayers: [3],
    description: 'POST /api/retrieval/rrf for end-to-end testing'
  },
  {
    name: 'Feature Schema Migration',
    path: 'sveltekit-frontend/drizzle/0101_atlas_packet_features.sql',
    duration: '30m',
    blocksLayers: [2, 4, 6],
    description: 'Create atlas_packet_features table (schema)'
  },
  {
    name: 'Metrics Schema Migration',
    path: 'sveltekit-frontend/drizzle/0102_atlas_packet_metrics.sql',
    duration: '30m',
    blocksLayers: [4, 6],
    description: 'Create atlas_packet_metrics table (predictions + rankings)'
  },
  {
    name: 'Corpus Freeze Script',
    path: 'scripts/atlas/freeze-eval-corpus.mjs',
    duration: '2-3h',
    blocksLayers: [1],
    description: 'Export Arrow + mmap artifacts for evaluation'
  },
  {
    name: 'Training Data Export',
    path: 'scripts/atlas/export-semantic-training-rows.mjs',
    duration: '1h',
    blocksLayers: [4, 6],
    description: 'Build balanced train/test splits from accepted/rejected packets'
  },
  {
    name: 'Naive Bayes Classifier',
    path: 'models/naive-bayes-classifier.json',
    duration: '1-2h',
    blocksLayers: [4],
    description: 'Train from semantic-training-rows.ndjson'
  },
  {
    name: 'XGBoost Reranker',
    path: 'models/xgboost-reranker.ubj',
    duration: '2-3h',
    blocksLayers: [6],
    description: 'Train from dense + graph + domain features'
  },
];

const WORK_STREAMS = [
  {
    name: 'Stream A: Models',
    duration: '4-6h',
    tasks: [
      'Generate training data (export-semantic-training-rows.mjs)',
      'Train Naive Bayes (atlas:train:naive-bayes)',
      'Train XGBoost (atlas:train:xgboost)',
    ],
    parallel: true,
    canStartWith: [],
  },
  {
    name: 'Stream B: RRF Integration',
    duration: '6-8h',
    tasks: [
      'Create RRF fusion module (rrf-fusion.ts)',
      'Create signal normalizer (signal-normalizer.ts)',
      'Wire into orchestrator (go-retrieval-facade.ts)',
      'Create API endpoint (/api/retrieval/rrf)',
    ],
    parallel: false,
    canStartWith: ['Minimal schema'],
  },
  {
    name: 'Stream C: Schema + Tests',
    duration: '2-3h',
    tasks: [
      'Feature schema migration (drizzle)',
      'Metrics schema migration (drizzle)',
      'Create test suite (rrf-fusion.spec.ts)',
    ],
    parallel: true,
    canStartWith: [],
  },
  {
    name: 'Stream D: Evaluation Layers',
    duration: '10-12h',
    tasks: [
      'Layer 1: Corpus freeze',
      'Layer 2: Single-vector baseline',
      'Layer 3: Fusion evaluation',
      'Layer 10: cuVS vs Qdrant',
    ],
    parallel: false,
    blockedBy: ['Stream B: RRF Integration'],
  },
];

function printLayers() {
  console.log('\n📊 PHASE 5 EVALUATION LAYERS\n');
  console.log('Layer | Name | Duration | Dependencies | Critical Path');
  console.log('------|------|----------|--------------|---------------');

  LAYERS.forEach(layer => {
    const critical = layer.criticalPath ? '✅' : '  ';
    const deps = layer.dependencies.length > 0 ? layer.dependencies.join(',') : '-';
    console.log(`  ${layer.id.toString().padStart(2)} | ${layer.name.substring(0,40).padEnd(40)} | ${layer.duration.padEnd(8)} | ${deps.padEnd(12)} | ${critical}`);
  });
}

function printImplementations() {
  console.log('\n🔧 PHASE 5 IMPLEMENTATION TASKS\n');
  console.log('Module | Duration | Blocks Layers | Description');
  console.log('-------|----------|---------------|----------------------------');

  IMPLEMENTATIONS.forEach(impl => {
    const blocks = impl.blocksLayers.join(',');
    console.log(`${impl.name.substring(0,30).padEnd(30)} | ${impl.duration.padEnd(8)} | ${blocks.padEnd(12)} | ${impl.description.substring(0,30)}`);
  });
}

function printWorkStreams() {
  console.log('\n⚙️  PARALLEL WORK STREAMS\n');

  WORK_STREAMS.forEach(stream => {
    console.log(`\n${stream.name}`);
    console.log(`Duration: ${stream.duration}`);
    console.log(`Parallel: ${stream.parallel ? 'Yes' : 'No'}`);
    if (stream.canStartWith && stream.canStartWith.length > 0) console.log(`Can start with: ${stream.canStartWith.join(', ')}`);
    if (stream.blockedBy && stream.blockedBy.length > 0) console.log(`Blocked by: ${stream.blockedBy.join(', ')}`);
    console.log('Tasks:');
    stream.tasks.forEach(task => console.log(`  - ${task}`));
  });
}

function printProductionGates() {
  console.log('\n✅ MINIMUM PRODUCTION GATES (Layer 17)\n');

  const gates = [
    ['Identity', 'Row-map completeness', '100%'],
    ['Identity', 'source_ref validity', '100%'],
    ['Vectors', 'Embedding coverage', '≥95%'],
    ['Vectors', 'AST structural coverage', '≥90%'],
    ['Clustering', 'SOM coverage', '≥95%'],
    ['Clustering', 'K-means coverage', '≥95%'],
    ['Domain', 'Macro F1', '≥0.85'],
    ['Retrieval', 'cuVS Recall@10', '≥0.95'],
    ['Retrieval', 'cuVS Recall@50', '≥0.97'],
    ['Ranking', 'Reranker NDCG@10 improvement', 'Positive'],
    ['Graph', 'Multi-hop irrelevant expansion', '<20%'],
    ['Security', 'Cross-tenant leakage', '0'],
    ['Storage', 'Arrow/mmap row mismatch', '0'],
  ];

  console.log('Category | Metric | Acceptance');
  console.log('---------|--------|----------');
  gates.forEach(([cat, metric, acc]) => {
    console.log(`${cat.padEnd(10)} | ${metric.padEnd(35)} | ${acc}`);
  });
}

function printRecommendedProof() {
  console.log('\n🎯 RECOMMENDED END-TO-END PROOF\n');
  console.log('100 judged queries through full stack:');
  console.log('  1. Multi-vector retrieval (content + summary + signature + topology)');
  console.log('  2. cuVS/Qdrant comparison');
  console.log('  3. Domain + topology feature join');
  console.log('  4. XGBoost rerank');
  console.log('  5. Two-hop ontology expansion');
  console.log('  6. CHROM97 packet build');
  console.log('  7. Source validation');
  console.log('  8. Metrics persistence');
  console.log('\nThis tells you whether semantic, topological, ontology and packet');
  console.log('layers IMPROVE retrieval—or merely ADD COMPLEXITY.\n');
}

function main() {
  console.log('\n' + '='.repeat(80));
  console.log('PHASE 5: MULTI-LAYER EVALUATION FRAMEWORK');
  console.log('='.repeat(80));

  const mode = process.argv[2];

  switch (mode) {
    case '--layers':
      printLayers();
      break;
    case '--implementations':
      printImplementations();
      break;
    case '--streams':
      printWorkStreams();
      break;
    case '--gates':
      printProductionGates();
      break;
    case '--proof':
      printRecommendedProof();
      break;
    case '--all':
      printLayers();
      printImplementations();
      printWorkStreams();
      printProductionGates();
      printRecommendedProof();
      break;
    default:
      console.log('\nUsage: node phase5-implementation-roadmap.mjs [option]\n');
      console.log('Options:');
      console.log('  --layers            Show 17 evaluation layers');
      console.log('  --implementations   Show implementation tasks');
      console.log('  --streams           Show parallel work streams');
      console.log('  --gates             Show production acceptance gates');
      console.log('  --proof             Show recommended end-to-end proof');
      console.log('  --all               Show everything\n');
  }
}

main();
