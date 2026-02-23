// Example main thread for SharedArrayBuffer + Worker demo
const N = 1024; // length of float32 array
const sab = new SharedArrayBuffer(Float32Array.BYTES_PER_ELEMENT * N);
const shared = new Float32Array(sab);

// fill input with random values
for (let i = 0; i < N; i++) shared[i] = Math.random();

const worker = new Worker('/examples/embed-worker/worker.js');
worker.postMessage({ sab: length, N: N });

worker.onmessage = (evt) => {
  console.log('Main got message', evt.data);
};

console.log('Main posted data to worker');
