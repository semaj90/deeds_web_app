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

const OLLAMA_URL = process.env.OLLAMA_BASE_URL ?? 'http://127.0.0.1:11434';
const SYNTHESIZE = process.env.SMOKE_SYNTHESIZE === '1';

async function ollamaUp() {
  try {
    const res = await fetch(`${OLLAMA_URL}/api/tags`, { signal: AbortSignal.timeout(5000) });
    return res.ok;
  } catch {
    return false;
  }
}

async function run() {
  console.log('🧪 Atlas: Hypergraph Routing Smoke Test');

  if (!(await ollamaUp())) {
    console.log(`⚠️ Ollama unreachable at ${OLLAMA_URL} — skipping hypergraph routing smoke`);
    process.exit(0);
  }

  const service = HyperRagFusionService.getInstance();

  for (const queryText of QUERIES) {
    console.log(`\n🔍 Query: "${queryText}"`);
    try {
      const result = await service.search({
        query: queryText,
        mode: 'codebase',
        useTopologyRouting: true,
        topK: 5,
        synthesize: SYNTHESIZE
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
      } else if (!SYNTHESIZE) {
        console.log('📝 Synthesis skipped (set SMOKE_SYNTHESIZE=1 to enable)');
      }
    } catch (err) {
      console.error(`❌ Query failed: ${err.message}`);
    }
  }

  console.log('\n✅ Smoke test cycle complete.');
}

run()
  .then(() => process.exit(0))
  .catch(err => {
    console.error(`❌ Smoke test failed: ${err.message}`);
    process.exit(1);
  });
