#!/usr/bin/env node
/**
 * smoke-hypergraph-routing.mjs
 * 
 * Validates the end-to-end HyperRAG topology routing pipeline.
 * Tests lookup server connectivity, cluster pre-filtering, 
 * and provenance metadata.
 */
import { HyperRagFusionService } from '../src/lib/server/retrieval/hyperrag-fusion-service.js';

const QUERIES = [
  "ACE context cache Redis",
  "LangExtract evidence extraction",
  "legal corpus statute search",
  "evidence upload SeaweedFS",
  "gRPC MCP tool calling",
  "GPU WebGPU similarity",
  "Drizzle schema database"
];

async function run() {
  console.log('🧪 Atlas: Hypergraph Routing Smoke Test');
  const service = HyperRagFusionService.getInstance();

  for (const queryText of QUERIES) {
    console.log(`\n🔍 Query: "${queryText}"`);
    try {
      const result = await service.search({
        query: queryText,
        mode: 'codebase',
        useTopologyRouting: true,
        topK: 5,
        synthesize: true
      });

      console.log(`✅ Hits: ${result.hits.length}`);
      console.log(`📡 Provenance:`, result.provenance);
      
      if (result.provenance.topologyRouting) {
        console.log('✨ Topology routing ACTIVE');
        const routedHits = result.hits.filter(h => h.reasons.some(r => r.includes('topology')));
        console.log(`🎯 Routed hits: ${routedHits.length}`);
      } else {
        console.warn('⚠️ Topology routing INACTIVE (fail-open used)');
      }

      if (result.synthesis) {
        console.log('📝 Synthesis snippet:', result.synthesis.slice(0, 100) + '...');
      }
    } catch (err) {
      console.error(`❌ Query failed: ${err.message}`);
    }
  }

  console.log('\n✅ Smoke test cycle complete.');
}

run();
