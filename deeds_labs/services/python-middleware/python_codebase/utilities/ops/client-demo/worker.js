// ops/client-demo/worker.js
// Worker that receives a SharedArrayBuffer of Float32 values, computes a simple checksum
// and posts the result back to the main thread.

self.onmessage = (e) => {
  const { sab, length } = e.data;
  if (!sab) return self.postMessage({ error: 'no sab' });
  const view = new Float32Array(sab, 0, length);
  let s = 0;
  for (let i = 0; i < view.length; i++) s += view[i];
  // write a small result back to the first element (demo only)
  view[0] = s;
  self.postMessage({ checksum: s, length: view.length });
};
