// Web Worker: SharedArrayBuffer + WebGPU sketch for client-side embeddings
self.addEventListener('message', async (ev) => {
  const { command, data } = ev.data;
  if (command === 'embed') {
    // placeholder: compute lightweight embedding on client via WebGPU or call server
    const embedding = new Float32Array([0]);
    postMessage({ type: 'embedding', embedding });
  }
});