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

interface RecallMetric {
  k: number;
  query_id: string;
  ground_truth_top_k: Set<string>;
  retrieved_top_k: Set<string>;
  intersection: number;
  recall: number;
}

async function uploadToQdrant(rows: SnapshotRow[]) {
  console.log(`\n📤 Uploading ${rows.length} vectors to Qdrant...\n`);

  const points = rows.map((row, idx) => ({
    id: idx,
    vector: row.embedding_768,
    payload: {
      row_id: row.id,
      packet_key: row.packet_key,
      feature_id: row.feature_id,
    },
  }));

  // Create collection
  const createRes = await fetch(`${QDRANT_URL}/collections/${COLLECTION_NAME}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      vectors: {
        size: 768,
        distance: 'Cosine',
      },
    }),
  });

  if (!createRes.ok && createRes.status !== 400) {
    throw new Error(`Failed to create collection: ${createRes.status}`);
  }

  console.log(`✅ Collection ${COLLECTION_NAME} ready`);

  // Upsert points in batches
  const BATCH_SIZE = 100;
  for (let i = 0; i < points.length; i += BATCH_SIZE) {
    const batch = points.slice(i, i + BATCH_SIZE);
    const upsertRes = await fetch(`${QDRANT_URL}/collections/${COLLECTION_NAME}/points`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        points: batch,
      }),
    });

    if (!upsertRes.ok) {
      throw new Error(`Failed to upsert batch ${i / BATCH_SIZE}: ${upsertRes.status}`);
    }

    if ((i + BATCH_SIZE) % 500 === 0 || i + BATCH_SIZE >= points.length) {
      console.log(`  Uploaded ${Math.min(i + BATCH_SIZE, points.length)}/${points.length} points`);
    }
  }

  console.log(`\n✅ All vectors uploaded to Qdrant`);
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
  console.log(`\n📊 Computing recall metrics...\n`);

  const metrics: { k10: number[], k50: number[] } = { k10: [], k50: [] };
  let processed = 0;

  for (const row of rows) {
    const gtK10 = groundTruthK10[row.id] || [];
    const gtK50 = groundTruthK50[row.id] || [];

    const gtSetK10 = new Set(gtK10.map(r => r.id));
    const gtSetK50 = new Set(gtK50.map(r => r.id));

    try {
      const retrievedK10 = await queryQdrant(row.embedding_768, 10);
      const retrievedK50 = await queryQdrant(row.embedding_768, 50);

      const recallK10 = retrievedK10.filter(id => gtSetK10.has(id)).length / Math.max(1, gtSetK10.size);
      const recallK50 = retrievedK50.filter(id => gtSetK50.has(id)).length / Math.max(1, gtSetK50.size);

      metrics.k10.push(recallK10);
      metrics.k50.push(recallK50);

      processed++;
      if (processed % 50 === 0) {
        const avgRecallK10 = (metrics.k10.reduce((a, b) => a + b, 0) / metrics.k10.length * 100).toFixed(2);
        const avgRecallK50 = (metrics.k50.reduce((a, b) => a + b, 0) / metrics.k50.length * 100).toFixed(2);
        console.log(`[${processed}/${rows.length}] Recall@10: ${avgRecallK10}%, Recall@50: ${avgRecallK50}%`);
      }
    } catch (err) {
      console.error(`Error querying row ${row.id}:`, err);
    }
  }

  return metrics;
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

  // Upload to Qdrant
  await uploadToQdrant(rows);

  // Compute recall (sample first 100 queries for speed)
  const sampleRows = rows.slice(0, 100);
  const metrics = await computeRecall(sampleRows, gtK10, gtK50);

  // Compute statistics
  const avgRecallK10 = metrics.k10.reduce((a, b) => a + b, 0) / metrics.k10.length;
  const avgRecallK50 = metrics.k50.reduce((a, b) => a + b, 0) / metrics.k50.length;
  const medianRecallK10 = metrics.k10.sort((a, b) => a - b)[Math.floor(metrics.k10.length / 2)];
  const medianRecallK50 = metrics.k50.sort((a, b) => a - b)[Math.floor(metrics.k50.length / 2)];

  const report = {
    phase: 'Phase 2',
    name: 'Qdrant CPU Baseline',
    collection_name: COLLECTION_NAME,
    total_vectors: rows.length,
    sample_size: sampleRows.length,
    embedding_dimension: 768,
    similarity_metric: 'cosine',
    recall_at_10: {
      mean: avgRecallK10,
      median: medianRecallK10,
      percentage_mean: (avgRecallK10 * 100).toFixed(2) + '%',
      percentage_median: (medianRecallK10 * 100).toFixed(2) + '%',
    },
    recall_at_50: {
      mean: avgRecallK50,
      median: medianRecallK50,
      percentage_mean: (avgRecallK50 * 100).toFixed(2) + '%',
      percentage_median: (medianRecallK50 * 100).toFixed(2) + '%',
    },
    timestamp: new Date().toISOString(),
  };

  fs.writeFileSync(`${OUTPUT_DIR}/baseline_report.json`, JSON.stringify(report, null, 2));

  console.log(`\n📋 Baseline Report:\n`);
  console.log(JSON.stringify(report, null, 2));
  console.log(`\n✅ Report saved: ${OUTPUT_DIR}/baseline_report.json`);
}

runBaseline().catch(console.error);
