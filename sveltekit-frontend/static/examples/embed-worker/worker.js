// Worker: reads SharedArrayBuffer, computes a simple checksum, writes back result
self.onmessage = (evt) => {
  const { sab, length } = evt.data;
  const arr = new Float32Array(sab);
  let sum = 0;
  for (let i = 0; i < length; i++) sum += arr[i];

  // write back first slot as checksum
  arr[0] = sum;

  self.postMessage({ checksum: sum });
};
