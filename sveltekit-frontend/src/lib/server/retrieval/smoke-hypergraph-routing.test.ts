import { describe, it, expect, beforeAll } from 'vitest';
import type { HyperRagFusionService } from '$lib/server/retrieval/hyperrag-fusion-service.js';

const QUERIES = [
  "ACE context cache Redis",
  "LangExtract evidence extraction",
  "legal corpus statute search",
  "evidence upload SeaweedFS",
  "gRPC MCP tool calling",
  "GPU WebGPU similarity",
  "Drizzle schema database"
];

const RUN_EXTERNAL_SMOKE = process.env.RUN_HYPERRAG_SMOKE === 'true';
const RUN_SYNTHESIS = process.env.RUN_HYPERRAG_SYNTHESIZE === 'true';

describe.skipIf(!RUN_EXTERNAL_SMOKE)('Atlas: Hypergraph Routing Smoke Test', () => {
  let service: HyperRagFusionService;

  beforeAll(async () => {
    const { HyperRagFusionService } = await import('$lib/server/retrieval/hyperrag-fusion-service.js');
    service = HyperRagFusionService.getInstance();
  });

  it.each(QUERIES)('should route query "%s" and return valid results', async (queryText) => {
    console.log(`\n🔍 Testing Query: "${queryText}"`);
    
    const result = await service.search({
      query: queryText,
      mode: 'codebase',
      useTopologyRouting: true,
      topK: 5,
      synthesize: RUN_SYNTHESIS
    });

    console.log(`✅ Hits: ${result.hits.length}`);
    console.log(`📡 Provenance:`, JSON.stringify(result.provenance));
    
    expect(result.hits).toBeDefined();
    expect(result.hits.length).toBeGreaterThan(0);
    expect(result.provenance.topologyRouting).toBe(true);

    if (result.synthesis) {
      console.log('📝 Synthesis snippet:', result.synthesis.slice(0, 100) + '...');
    }
  });
});
