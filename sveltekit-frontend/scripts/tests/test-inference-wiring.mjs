import { ENV } from '../../src/lib/server/env.server.js';
import { TURBOQUANT_BASE_URL } from '../../src/lib/ai/model-ids.js';

async function testEndpoint(name, url) {
  console.log(`Testing ${name} at ${url}...`);
  try {
    const t0 = performance.now();
    const res = await fetch(`${url}/health`, { signal: AbortSignal.timeout(2000) });
    const t1 = performance.now();
    console.log(`  [${res.ok ? 'OK' : 'FAIL'}] status=${res.status} latency=${(t1 - t0).toFixed(1)}ms`);
    return res.ok;
  } catch (err) {
    console.log(`  [ERROR] ${err.message}`);
    return false;
  }
}

async function run() {
  console.log('--- Inference Wiring Test ---');
  console.log(`ENV.OLLAMA_BASE_URL: ${ENV.OLLAMA_BASE_URL}`);
  console.log(`ENV.TURBOQUANT_BASE_URL: ${ENV.TURBOQUANT_BASE_URL}`);
  console.log(`model-ids.ts TURBOQUANT_BASE_URL: ${TURBOQUANT_BASE_URL}`);
  console.log(`ENV.RERANK_BASE_URL: ${ENV.RERANK_BASE_URL}`);
  console.log(`ENV.BIFROST_URL: ${ENV.BIFROST_URL}`);
  
  await testEndpoint('Ollama', ENV.OLLAMA_BASE_URL);
  await testEndpoint('TurboQuant (ENV)', ENV.TURBOQUANT_BASE_URL);
  await testEndpoint('TurboQuant (model-ids)', TURBOQUANT_BASE_URL);
  await testEndpoint('Reranker', ENV.RERANK_BASE_URL);
  await testEndpoint('Bifrost', ENV.BIFROST_URL);
}

run().catch(console.error);
