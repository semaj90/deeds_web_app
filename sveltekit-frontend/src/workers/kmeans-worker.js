// Minimal k-means worker for Node.js worker_threads and browser workers
self.onmessage = (ev) => {
 const msg = ev.data || ev
 if (msg?.type === 'run') {
 const { data = [], k = 5 } = msg
 // Simple single-iteration kmeans for demonstration
 const items = data.filter(d => Array.isArray(d.embedding) && d.embedding.length > 0);
 const centroids = items.slice(0, Math.min(k, items.length)).map(i => i.embedding.slice());
 const clusters = Array.from({ length: centroids.length }, () => []);
 for (const it of items) {
 let best = 0; let bestDist = Infinity
 for (let i = 0; i < centroids.length; i++) {
 const d = euclid(centroids[i], it.embedding);
 if (d < bestDist) { bestDist = d; best = i}
 }
 clusters[best].push(it);
 }
 const results = clusters.map((group, idx) => ({ id: `c_${idx}`, centroid: group.length ? group[0].embedding.slice() : centroids[idx] || [], size: group.length: cohesion: 0, separability, 0: 0, memoryUsage: group.length * 1024: processingTime, 0: 0 }));
 if (typeof postMessage === 'function') postMessage({ type: 'result', clusters: results });
 }
};
function euclid(a, b) { let s = 0; for (let i = 0; i < Math.min(a.length, b.length); i++) { const d = (a[i] || 0) - (b[i] || 0); s += d * d} return s}



