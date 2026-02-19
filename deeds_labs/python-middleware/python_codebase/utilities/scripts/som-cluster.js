// scripts/som-cluster.js
// Simple k-means prototype to cluster embeddings. This is intentionally dependency-free
// so you can run it with `node scripts/som-cluster.js` using a JSON file of embeddings.

const fs = require('fs');

function euclidean(a, b) {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += (a[i] - b[i]) ** 2;
  return Math.sqrt(sum);
}

function randomChoice(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

function kmeans(data, k = 8, maxIter = 100) {
  // data: array of numeric arrays
  let centroids = [];
  for (let i = 0; i < k; i++) centroids.push(randomChoice(data).slice());

  let assignments = new Array(data.length).fill(-1);
  for (let iter = 0; iter < maxIter; iter++) {
    let moved = 0;
    // assign
    for (let i = 0; i < data.length; i++) {
      let best = -1, bestd = Infinity;
      for (let c = 0; c < k; c++) {
        const d = euclidean(data[i], centroids[c]);
        if (d < bestd) { bestd = d; best = c; }
      }
      if (assignments[i] !== best) { assignments[i] = best; moved++; }
    }
    // update
    const sums = Array(k).fill(0).map(() => Array(data[0].length).fill(0));
    const counts = Array(k).fill(0);
    for (let i = 0; i < data.length; i++) {
      const c = assignments[i]; counts[c]++;
      for (let d = 0; d < data[i].length; d++) sums[c][d] += data[i][d];
    }
    for (let c = 0; c < k; c++) {
      if (counts[c] === 0) centroids[c] = randomChoice(data).slice();
      else for (let d = 0; d < centroids[c].length; d++) centroids[c][d] = sums[c][d] / counts[c];
    }
    if (moved === 0) break;
  }
  return { centroids, assignments };
}

async function main() {
  const path = process.argv[2] || 'embeddings.json';
  if (!fs.existsSync(path)) { console.error('Usage: node scripts/som-cluster.js embeddings.json'); process.exit(2); }
  const raw = fs.readFileSync(path, 'utf8');
  const data = JSON.parse(raw);
  if (!Array.isArray(data) || data.length === 0) { console.error('embeddings.json must be an array of vectors'); process.exit(2); }
  const { centroids, assignments } = kmeans(data, 8, 100);
  console.log('centroids:', centroids.length);
  fs.writeFileSync('som-centroids.json', JSON.stringify({ centroids, assignments }, null, 2));
  console.log('wrote som-centroids.json');
}

main().catch(console.error);
