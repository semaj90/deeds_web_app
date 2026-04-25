// ops/client-demo/main.js
// Main thread demo that allocates a SharedArrayBuffer, fills it with Float32 values,
// sends it to a worker, and receives a checksum result.

const WORKER_PATH = new URL('./worker.js', import.meta.url).pathname || './worker.js';

function makeFloat32SAB(length) {
  const sab = new SharedArrayBuffer(Float32Array.BYTES_PER_ELEMENT * length);
  const view = new Float32Array(sab);
  for (let i = 0; i < length; i++) view[i] = Math.random();
  return { sab, view };
}

async function runDemo() {
  const { sab, view } = makeFloat32SAB(1024 * 4); // 4k floats ~16KB
  const worker = new Worker(WORKER_PATH, { type: 'module' });

  worker.onmessage = (e) => {
    console.log('Main: received from worker', e.data);
    worker.terminate();
  };

  worker.onerror = (e) => {
    console.error('Worker error', e);
    worker.terminate();
  };

  console.log('Main: posting SAB to worker');
  worker.postMessage({ sab, length: view.length });

  // Example: call the ranker after receiving embeddings (replace with real flow)
  // fetch('http://localhost:4001/search', { method: 'POST', body: JSON.stringify({ query: 'test' }), headers: { 'Content-Type': 'application/json' } })
  //  .then(r => r.json()).then(console.log).catch(console.error);
}

runDemo().catch(console.error);
