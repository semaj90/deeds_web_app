#!/usr/bin/env node
/**
 * scripts/smoke-manifold4-routing.mjs
 * 
 * Asserts that common queries route to the expected architectural clusters.
 */

import { HyperRagFusionService } from '../src/lib/server/retrieval/hyperrag-fusion-service.js';

const TEST_CASES = [
  {
    query: "ACE context cache Redis",
    expectedClusters: [72, 94, 25, 22],
    label: "ACE/Cache"
  },
  {
    query: "LangExtract evidence extraction",
    expectedClusters: [32],
    label: "LangExtract"
  },
  {
    query: "legal corpus statute search",
    expectedClusters: [47, 35, 21],
    label: "Legal Corpus"
  },
  {
    query: "evidence upload SeaweedFS",
    expectedClusters: [92, 86, 29],
    label: "Evidence Upload"
  },
  {
    query: "gRPC MCP tool calling",
    expectedClusters: [82],
    label: "gRPC/MCP"
  },
  {
    query: "GPU WebGPU similarity",
    expectedClusters: [20, 23, 80],
    label: "GPU/WebGPU"
  },
  {
    query: "Drizzle schema database",
    expectedClusters: [55, 95, 91, 88, 48],
    label: "Database/Schema"
  },
  {
    query: "legal server routing and handlers",
    expectedClusters: [89, 41],
    label: "Legal Server"
  },
  {
    query: "ui component styling and bits-ui",
    expectedClusters: [41, 40],
    label: "UI Components"
  },
  {
    query: "observability and vector logging",
    expectedClusters: [59, 36],
    label: "Observability"
  }
];

async function runTest() {
  console.log('🧪 Manifold4 Quality Control: Expected-Cluster Smoke Test');
  const fusion = HyperRagFusionService.getInstance();
  let passed = 0;

  for (const test of TEST_CASES) {
    console.log(`\n🔍 Testing: "${test.query}" (${test.label})`);
    
    try {
      const result = await fusion.search({
        query: test.query,
        mode: 'codebase',
        topK: 5,
        useTaskDistillates: true,
        useTopologyRouting: true
      });

      const routedClusters = result.routingExplanation?.finalClusters.map(Number) || [];
      const matched = test.expectedClusters.some(id => routedClusters.includes(id));

      if (matched) {
        console.log(`✅ Passed: Routed to at least one expected cluster: [${routedClusters.join(', ')}]`);
        passed++;
      } else {
        console.error(`❌ Failed: Expected one of [${test.expectedClusters.join(', ')}], but got [${routedClusters.join(', ')}]`);
      }
    } catch (err) {
      console.error(`❌ Error during test: ${err.message}`);
    }
  }

  console.log(`\n📊 Summary: ${passed}/${TEST_CASES.length} tests passed.`);
  process.exit(passed === TEST_CASES.length ? 0 : 1);
}

runTest();
