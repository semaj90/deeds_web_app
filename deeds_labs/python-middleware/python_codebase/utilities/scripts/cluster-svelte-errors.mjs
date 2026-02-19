import fs from "fs";
import path from "path";

// Simple k-means clustering (CPU) to avoid extra deps. Falls back to k<=N.
const INDEX_DIR = path.resolve("svelte-check-errors-index");
const EMB_PATH = process.argv[2] || path.join(INDEX_DIR, "embeddings-files.json");
const K = Number(process.env.CLUSTER_K || 10);
const MAX_ITERS = Number(process.env.CLUSTER_ITERS || 20);

function dist2(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i++) {
    const d = a[i] - b[i];
    s += d * d;
  }
  return s;
}

function meanVec(vecs, dim) {
  const out = new Array(dim).fill(0);
  for (const v of vecs) {
    for (let i = 0; i < dim; i++) out[i] += v[i];
  }
  const n = vecs.length || 1;
  for (let i = 0; i < dim; i++) out[i] /= n;
  return out;
}

function kmeans(vectors, k, maxIters) {
  const n = vectors.length;
  const dim = vectors[0]?.length || 0;
  if (n === 0 || dim === 0) return { centroids: [], assigns: [] };
  const kk = Math.min(k, n);
  // init via first kk points
  let centroids = vectors.slice(0, kk).map(v => v.slice());
  let assigns = new Array(n).fill(0);
  for (let iter = 0; iter < maxIters; iter++) {
    // assignment
    let changed = 0;
    for (let i = 0; i < n; i++) {
      let best = 0, bestd = Infinity;
      for (let c = 0; c < kk; c++) {
        const d = dist2(vectors[i], centroids[c]);
        if (d < bestd) { bestd = d; best = c; }
      }
      if (assigns[i] !== best) { assigns[i] = best; changed++; }
    }
    // recompute
    const groups = Array.from({ length: kk }, () => []);
    for (let i = 0; i < n; i++) groups[assigns[i]].push(vectors[i]);
    const newCentroids = new Array(kk);
    for (let c = 0; c < kk; c++) newCentroids[c] = groups[c].length ? meanVec(groups[c], dim) : centroids[c];
    centroids = newCentroids;
    if (changed === 0) break;
  }
  return { centroids, assigns };
}

function summarizeCluster(items, topN = 10) {
  // naive summary: top messages and files
  const byMsg = new Map();
  const byFile = new Map();
  for (const it of items) {
    const keyM = it.payload.message || it.payload.file || "<unknown>";
    byMsg.set(keyM, (byMsg.get(keyM) || 0) + (it.payload.count || 1));
    if (it.payload.file) byFile.set(it.payload.file, (byFile.get(it.payload.file) || 0) + (it.payload.count || 1));
  }
  const topMsgs = [...byMsg.entries()].sort((a,b)=>b[1]-a[1]).slice(0, topN);
  const topFiles = [...byFile.entries()].sort((a,b)=>b[1]-a[1]).slice(0, topN);
  return { topMsgs, topFiles };
}

function main() {
  if (!fs.existsSync(EMB_PATH)) {
    console.error(`Embeddings file not found: ${EMB_PATH}. Run embed step first.`);
    process.exit(1);
  }
  const data = JSON.parse(fs.readFileSync(EMB_PATH, 'utf8'));
  const vectors = data.map(x => x.vector);
  if (!vectors.length) {
    console.error('No vectors to cluster.');
    process.exit(1);
  }
  const { centroids, assigns } = kmeans(vectors, K, MAX_ITERS);
  const groups = Array.from({ length: centroids.length }, () => []);
  for (let i = 0; i < data.length; i++) groups[assigns[i]].push(data[i]);

  const clusters = groups.map((items, idx) => ({
    id: idx,
    size: items.length,
    summary: summarizeCluster(items),
    sample: items.slice(0, 10).map(s => ({ payload: s.payload })),
  })).sort((a,b)=>b.size-a.size);

  fs.writeFileSync(path.join(INDEX_DIR, 'clusters.json'), JSON.stringify({ k: centroids.length, clusters }, null, 2));
  const md = clusters.map(c => `## Cluster ${c.id} (n=${c.size})\n- Top Msgs:\n${c.summary.topMsgs.map(([m,cnt])=>`  - (${cnt}) ${m}`).join('\n')}\n- Top Files:\n${c.summary.topFiles.map(([f,cnt])=>`  - (${cnt}) ${f}`).join('\n')}`).join('\n\n');
  fs.writeFileSync(path.join(INDEX_DIR, 'clusters.md'), md);
  console.log(`Wrote clusters.json and clusters.md (k=${centroids.length}).`);
}

main();

