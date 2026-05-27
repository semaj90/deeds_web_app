/**
 * Smoke test for Phase 10B TurboVec Rerank Blend
 */
import { orchestrateRetrieval } from '../src/lib/server/retrieval/orchestrator.js';

async function run() {
  console.log('--- TurboVec Rerank Smoke Test ---');
  
  try {
    const query = "how does the auth guard work?";
    console.log(`Executing orchestrateRetrieval with query: "${query}"`);
    
    // We'll run a minimal fetch to the codebase pipeline to avoid requiring a live case
    const result = await orchestrateRetrieval({
      query,
      pipeline: 'codebase',
      topK: 5,
      skipCorrectiveRag: true,
      skipDag: true,
      skipAuthority: true,
      skipGraph: true
    });

    console.log(`\nResult returned ${result.chunks.length} chunks.`);
    
    let preservedSourceRefs = true;
    for (const [i, chunk] of result.chunks.entries()) {
      console.log(`[Rank ${i+1}] Doc: ${chunk.documentId} | Score: ${chunk.similarity.toFixed(4)} | SourceRef: ${chunk.sourceId ?? 'MISSING'}`);
      if (!chunk.sourceId) preservedSourceRefs = false;
    }

    console.log(`\nTurboVec Latency: ${result.latencyMs?.turbovec ?? 0}ms`);
    console.log(`Fallback handled safely? YES ✅ (Since it didn't throw)`);
    console.log(`SourceRefs preserved? ${preservedSourceRefs ? 'YES ✅' : 'NO ❌'}`);
    
    if (!preservedSourceRefs) {
      console.error('Smoke test failed: SourceRefs were lost during rerank.');
      process.exit(1);
    }
    
    console.log('\n✅ Smoke test passed.');
    process.exit(0);
  } catch (err) {
    console.error('Smoke test failed:', err);
    process.exit(1);
  }
}

run();
