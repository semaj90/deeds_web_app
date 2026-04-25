// Simple compatibility test harness for nes-rl.js worker
// Exercises legacy and new message types to ensure backward compatibility.

const workerPath = '/workers/nes-rl.js';

function spawn() {
  return new Promise((resolve, reject) => {
    try {
      const w = new Worker(workerPath);
      w.onerror = (e) => reject(e);
      resolve(w);
    } catch (e) {
      reject(e);
    }
  });
}

async function request(worker, type, payload, timeoutMs = 3000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Timeout: ' + type)), timeoutMs);
    worker.onmessage = (e) => {
      clearTimeout(timer);
      resolve(e.data);
    };
    worker.postMessage({ type, payload });
  });
}

(async () => {
  const worker = await spawn();

  const init = await request(worker, 'INIT', { stateSize: 128, actionSize: 32 });
  console.log('INIT ->', init.type, Object.keys(init.payload || {}));

  const initWasm = await request(worker, 'INIT_WASM', {});
  console.log('INIT_WASM ->', initWasm.type);

  const smart = await request(worker, 'SMART_MODEL_SELECT', {
    query: 'Analyze this contract for indemnification clauses and governing law.',
  });
  console.log('SMART_MODEL_SELECT ->', smart.payload.selectedModel, smart.payload.confidence);

  const gen = await request(worker, 'GENERATE', {
    prompt: 'Summarize key risk factors in the agreement.',
  });
  console.log('GENERATE ->', gen.payload.text.slice(0, 80) + '...');

  const genLegal = await request(worker, 'GENERATE_LEGAL', {
    prompt: 'Provide legal rationale for termination for convenience clause enforcement.',
    legalContext: { domain: 'contracts', documentType: 'msa' },
  });
  console.log('GENERATE_LEGAL ->', genLegal.payload.qualityScore, genLegal.payload.model);

  // Direct endpoint checks (if running in browser environment these may fail; kept for Node with fetch + dev server)
  try {
    const r1 = await fetch('http://localhost:5175/api/ai/inference', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: 'Quick test generation' }),
    });
    console.log('/api/ai/inference status', r1.status);
  } catch (e) {
    console.log('Skip /api/ai/inference check (dev server not running)');
  }
  try {
    const r2 = await fetch('http://localhost:5175/api/legal/analysis', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: 'Analyze liability clauses',
        domain: 'contracts',
        documentType: 'msa',
      }),
    });
    console.log('/api/legal/analysis status', r2.status);
  } catch (e) {
    console.log('Skip /api/legal/analysis check (dev server not running)');
  }

  const stats = await request(worker, 'STATS', {});
  console.log('STATS -> epsilon', stats.payload.epsilon, 'generation', stats.payload.generation);

  worker.terminate();
})();
