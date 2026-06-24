#!/usr/bin/env node
/**
 * Test Stage A0 Routing Matrix Integration
 *
 * Purpose:
 *   Verify that the 4x6 routing matrix correctly selects retrieval lanes
 *   based on query signals.
 *
 * Usage:
 *   node scripts/atlas/test-stage-a0-routing.mjs [--verbose]
 */

import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Import routing functions (would need to be adapted to run in Node)
const ROUTING_WEIGHTS = [
  [0.55, 0.05, 0.10, 0.05, 0.05, 0.20],  // SEMANTIC — cosine + cache
  [0.15, 0.70, 0.10, 0.05, 0.05, 0.05],  // SOM — som_distance dominates
  [0.10, 0.05, 0.70, 0.05, 0.05, 0.05],  // ONTOLOGY — feature_overlap dominates
  [0.05, 0.05, 0.10, 0.40, 0.40, 0.00],  // LINEAGE — pagerank + recency (no cache)
];

const LANE_NAMES = ['semantic', 'som', 'ontology', 'lineage'];

function normalizeSomDistance(distance) {
  if (distance <= 0) return 1.0;
  if (distance === 1) return 0.9;
  if (distance === 2) return 0.75;
  if (distance === 3) return 0.45;
  if (distance === 4) return 0.25;
  return 0.1;
}

function applyRoutingGuards(signals) {
  const cosine = signals.cosine_similarity ?? 0;
  const cacheHit = signals.cache_hit_confidence ?? 0;
  const somDistance = signals.som_distance ?? 999;
  const featureOverlap = signals.feature_overlap ?? 0;
  const pagerank = signals.pagerank ?? 0;
  const recency = signals.recency_score ?? 0;

  if (cacheHit >= 0.85 && featureOverlap < 0.75) {
    return 'semantic';
  }

  if (cosine >= 0.82 && somDistance > 2 && featureOverlap < 0.65) {
    return 'semantic';
  }

  if (somDistance <= 2 && cosine < 0.78 && featureOverlap < 0.7) {
    return 'som';
  }

  if (featureOverlap >= 0.78) {
    return 'ontology';
  }

  if (pagerank >= 0.75 && recency >= 0.75 && cacheHit < 0.8) {
    return 'lineage';
  }

  return null;
}

function normalizeSignals(signals) {
  return [
    signals.cosine_similarity,
    normalizeSomDistance(signals.som_distance),
    signals.feature_overlap,
    signals.pagerank,
    signals.recency_score,
    signals.cache_hit_confidence,
  ];
}

function computeRoutingScores(signals) {
  const normalized = normalizeSignals(signals);

  const scores = ROUTING_WEIGHTS.map((weights, laneIdx) => {
    const laneScore = weights.reduce((sum, w, colIdx) => sum + w * normalized[colIdx], 0);

    const signalScores = {
      cosine: weights[0] * normalized[0],
      som_distance: weights[1] * normalized[1],
      feature_overlap: weights[2] * normalized[2],
      pagerank: weights[3] * normalized[3],
      recency: weights[4] * normalized[4],
      cache_hit: weights[5] * normalized[5],
    };

    return {
      lane: LANE_NAMES[laneIdx],
      score: laneScore,
      signal_scores: signalScores,
      confidence: laneScore,
    };
  });

  return scores.sort((a, b) => b.score - a.score);
}

function selectRoutingLane(signals) {
  const guardedLane = applyRoutingGuards(signals);
  if (guardedLane) {
    const scores = computeRoutingScores(signals);
    const decision = scores.find(s => s.lane === guardedLane) || scores[0];
    return { ...decision, confidence: 1.0 };
  }
  const scores = computeRoutingScores(signals);
  return scores[0];
}

function visualizeMatrix(signals) {
  const scores = computeRoutingScores(signals);
  const header = `\n📈 Stage A0 Routing Matrix Scores\n`;
  const lines = scores.map((s) => {
    const score = (s.score * 100).toFixed(1);
    const bar = '█'.repeat(Math.floor(s.score * 40));
    return `  ${s.lane.padEnd(10)} ${bar} ${score}%`;
  });
  return header + lines.join('\n');
}

// Test cases
const testCases = [
  {
    name: 'High semantic similarity (natural language query)',
    signals: {
      cosine_similarity: 0.85,
      som_distance: 5,
      feature_overlap: 0.3,
      pagerank: 0.5,
      recency_score: 0.7,
      cache_hit_confidence: 0.1,
    },
    expectedLane: 'semantic',
  },
  {
    name: 'SOM topology match (grid-proximate)',
    signals: {
      cosine_similarity: 0.4,
      som_distance: 2,
      feature_overlap: 0.3,
      pagerank: 0.5,
      recency_score: 0.7,
      cache_hit_confidence: 0.1,
    },
    expectedLane: 'som',
  },
  {
    name: 'Ontology match (feature-rich)',
    signals: {
      cosine_similarity: 0.4,
      som_distance: 15,
      feature_overlap: 0.9,
      pagerank: 0.5,
      recency_score: 0.5,
      cache_hit_confidence: 0.1,
    },
    expectedLane: 'ontology',
  },
  {
    name: 'Lineage match (authority + recency)',
    signals: {
      cosine_similarity: 0.3,
      som_distance: 20,
      feature_overlap: 0.4,
      pagerank: 0.9,
      recency_score: 0.95,
      cache_hit_confidence: 0.1,
    },
    expectedLane: 'lineage',
  },
  {
    name: 'Cache hit (warm path)',
    signals: {
      cosine_similarity: 0.5,
      som_distance: 15,
      feature_overlap: 0.5,
      pagerank: 0.5,
      recency_score: 0.9,
      cache_hit_confidence: 0.95,
    },
    expectedLane: 'semantic', // Will use cached result regardless
  },
];

async function runTests() {
  console.log(`\n═══ Stage A0 Routing Matrix Tests ═══\n`);

  let passed = 0;
  let failed = 0;

  for (const testCase of testCases) {
    console.log(`📋 Test: ${testCase.name}`);
    const winner = selectRoutingLane(testCase.signals);
    const scores = computeRoutingScores(testCase.signals);

    const isPass = winner.lane === testCase.expectedLane;
    if (isPass) {
      console.log(`   ✅ PASS: Selected lane '${winner.lane}' (expected '${testCase.expectedLane}')`);
      console.log(`   Score: ${(winner.score * 100).toFixed(1)}%`);
      passed++;
    } else {
      console.log(`   ❌ FAIL: Selected lane '${winner.lane}' (expected '${testCase.expectedLane}')`);
      console.log(`   Score: ${(winner.score * 100).toFixed(1)}%`);
      failed++;
    }

    if (process.argv.includes('--verbose')) {
      console.log(visualizeMatrix(testCase.signals));
    }

    console.log();
  }

  // Summary
  console.log(`═══ Results ═══`);
  console.log(`Passed: ${passed}/${testCases.length}`);
  console.log(`Failed: ${failed}/${testCases.length}`);

  if (failed === 0) {
    console.log(`\n✨ All tests passed!`);
    process.exit(0);
  } else {
    console.log(`\n❌ Some tests failed.`);
    process.exit(1);
  }
}

runTests();
