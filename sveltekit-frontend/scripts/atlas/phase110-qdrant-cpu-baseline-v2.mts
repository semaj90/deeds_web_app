import * as fs from 'fs';
import * as readline from 'readline';

const SNAPSHOT_PATH = './phase110_snapshot/snapshot.ndjson';
const GROUND_TRUTH_K10 = './phase110_ground_truth/ground_truth_k10.json';
const GROUND_TRUTH_K50 = './phase110_ground_truth/ground_truth_k50.json';
const OUTPUT_DIR = './phase110_qdrant_baseline';
const QDRANT_URL = 'http://127.0.0.1:6333';
const COLLECTION_NAME = 'phase110_baseline_768';

interface SnapshotRow {
  id: string;
  packet_key: string;
  feature_id: string;
  embedding_768: number[];
}

async function queryQdrant(queryVector: number[], k: number): Promise<string[]> {
  const searchRes = await fetch(`${QDRANT_URL}/collections/${COLLECTION_NAME}/points/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      vector: queryVector,
      limit: k,
      with_payload: true,
    }),
  });

  if (!searchRes.ok) {
    throw new Error(`Search failed: ${searchRes.status}`);
  }

  const data = await searchRes.json() as { result: Array<{ payload: { row_id: string } }> };
  return data.result.map(r => r.payload.row_id);
}

async function computeRecall(rows: SnapshotRow[], groundTruthK10: Record<string, Array<{ id: string }>>, groundTruthK50: Record<string, Array<{ id: string }>>) {
  console.log(`\n📊 Computing recall metrics (100-row sample)...\n`);

  const recallsK10: number[] = [];
  const recallsK50: number[] = [];

  for (let i = 0; i < Math.min(100, rows.length); i++) {
    const row = rows[i];
    const gtK10 = groundTruthK10[row.id] || [];
    const gtK50 = groundTruthK50[row.id] || [];

    const gtSetK10 = new Set(gtK10.map(r => r.id));
    const gtSetK50 = new Set(gtK50.map(r => r.id));

    try {
      const retrievedK10 = await queryQdrant(row.embedding_768, 10);
      const retrievedK50 = await queryQdrant(row.embedding_768, 50);

      // Recall = intersection size / ground truth size
      const intersectionK10 = retrievedK10.filter(id => gtSetK10.has(id)).length;
      const intersectionK50 = retrievedK50.filter(id => gtSetK50.has(id)).length;

      const recallK10 = gtSetK10.size > 0 ? intersectionK10 / gtSetK10.size : 1.0;
      const recallK50 = gtSetK50.size > 0 ? intersectionK50 / gtSetK50.size : 1.0;

      recallsK10.push(recallK10);
      recallsK50.push(recallK50);

      if ((i + 1) % 20 === 0) {
        const avgK10 = (recallsK10.reduce((a, b) => a + b, 0) / recallsK10.length * 100).toFixed(2);
        const avgK50 = (recallsK50.reduce((a, b) => a + b, 0) / recallsK50.length * 100).toFixed(2);
        console.log(`[${i + 1}/100] Mean Recall@10: ${avgK10}%, Mean Recall@50: ${avgK50}%`);
      }
    } catch (err) {
      console.error(`Error querying row ${row.id}:`, err);
    }
  }

  return { k10: recallsK10, k50: recallsK50 };
}

async function runBaseline() {
  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  console.log('🔬 Phase 2: Qdrant CPU Baseline (768-dim cosine ANN)\n');

  // Load snapshot
  console.log('📖 Loading snapshot...');
  const rows: SnapshotRow[] = [];
  const rl = readline.createInterface({ input: fs.createReadStream(SNAPSHOT_PATH) });

  let lineNum = 0;
  for await (const line of rl) {
    if (lineNum === 0) { lineNum++; continue; }
    const row = JSON.parse(line);
    rows.push({
      id: row.id,
      packet_key: row.packet_key,
      feature_id: row.feature_id,
      embedding_768: row.embedding_768,
    });
  }

  console.log(`✅ Loaded ${rows.length} rows`);

  // Load ground truth
  console.log('\n📖 Loading ground truth...');
  const gtK10 = JSON.parse(fs.readFileSync(GROUND_TRUTH_K10, 'utf-8'));
  const gtK50 = JSON.parse(fs.readFileSync(GROUND_TRUTH_K50, 'utf-8'));
  console.log(`✅ Ground truth loaded (${Object.keys(gtK10).length} queries)`);

  // Collection already exists from previous run
  console.log(`\n✅ Collection ${COLLECTION_NAME} already populated`);

  // Compute recall (sample first 100 queries)
  const metrics = await computeRecall(rows, gtK10, gtK50);

  // Compute statistics
  const avgRecallK10 = metrics.k10.reduce((a, b) => a + b, 0) / metrics.k10.length;
  const avgRecallK50 = metrics.k50.reduce((a, b) => a + b, 0) / metrics.k50.length;

  const sortedK10 = [...metrics.k10].sort((a, b) => a - b);
  const sortedK50 = [...metrics.k50].sort((a, b) => a - b);
  const p50K10 = sortedK10[Math.floor(sortedK10.length / 2)];
  const p50K50 = sortedK50[Math.floor(sortedK50.length / 2)];
  const p95K10 = sortedK10[Math.floor(sortedK10.length * 0.95)];
  const p95K50 = sortedK50[Math.floor(sortedK50.length * 0.95)];

  const report = {
    phase: 'Phase 2',
    name: 'Qdrant CPU Baseline',
    collection_name: COLLECTION_NAME,
    total_vectors: rows.length,
    sample_size: 100,
    embedding_dimension: 768,
    similarity_metric: 'cosine',
    recall_at_10: {
      mean: (avgRecallK10 * 100).toFixed(2) + '%',
      p50: (p50K10 * 100).toFixed(2) + '%',
      p95: (p95K10 * 100).toFixed(2) + '%',
    },
    recall_at_50: {
      mean: (avgRecallK50 * 100).toFixed(2) + '%',
      p50: (p50K50 * 100).toFixed(2) + '%',
      p95: (p95K50 * 100).toFixed(2) + '%',
    },
    timestamp: new Date().toISOString(),
  };

  fs.writeFileSync(`${OUTPUT_DIR}/baseline_report.json`, JSON.stringify(report, null, 2));

  console.log(`\n📊 Recall Results:\n`);
  console.log(JSON.stringify(report, null, 2));
  console.log(`\n✅ Report saved: ${OUTPUT_DIR}/baseline_report.json`);
}

runBaseline().catch(console.error);
