import * as fs from 'fs';
import * as readline from 'readline';
import { createHash } from 'crypto';

const SNAPSHOT_PATH = './phase110_snapshot/snapshot.ndjson';
const OUTPUT_DIR = './phase110_ground_truth';
const K_VALUES = [10, 50];

interface SnapshotRow {
  id: string;
  embedding_768: number[];
}

function cosine_similarity(a: number[], b: number[]): number {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

async function buildGroundTruth() {
  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  console.log('🔍 Building Phase 110 Exact Ground Truth (768-dim brute-force cosine)\n');

  // Read snapshot
  const rows: SnapshotRow[] = [];
  const rl = readline.createInterface({ input: fs.createReadStream(SNAPSHOT_PATH) });

  let lineNum = 0;
  for await (const line of rl) {
    if (lineNum === 0) { lineNum++; continue; } // Skip Arrow schema header
    const row = JSON.parse(line);
    rows.push({ id: row.id, embedding_768: row.embedding_768 });
    if (rows.length % 500 === 0) {
      console.log(`📖 Loaded ${rows.length} rows...`);
    }
  }

  console.log(`\n✅ Loaded ${rows.length} rows`);

  // Compute ground truth: brute-force cosine for each query
  const groundTruth: Record<string, Record<number, Array<{ id: string; score: number }>>> = {};

  console.log('\n🧮 Computing brute-force cosine similarity...\n');

  for (let queryIdx = 0; queryIdx < rows.length; queryIdx++) {
    const queryRow = rows[queryIdx];
    const scores: Array<{ id: string; score: number }> = [];

    // Compute similarity to all other rows
    for (let refIdx = 0; refIdx < rows.length; refIdx++) {
      if (queryIdx === refIdx) continue;
      const refRow = rows[refIdx];
      const sim = cosine_similarity(queryRow.embedding_768, refRow.embedding_768);
      scores.push({ id: refRow.id, score: sim });
    }

    // Sort descending
    scores.sort((a, b) => b.score - a.score);

    // Store top-K for each K value
    groundTruth[queryRow.id] = {};
    for (const k of K_VALUES) {
      groundTruth[queryRow.id][k] = scores.slice(0, k);
    }

    if ((queryIdx + 1) % 100 === 0) {
      console.log(`[${queryIdx + 1}/${rows.length}] Computed ground truth`);
    }
  }

  console.log(`\n✅ Ground truth computed for ${rows.length} queries`);

  // Write results
  for (const k of K_VALUES) {
    const filepath = `${OUTPUT_DIR}/ground_truth_k${k}.json`;
    const gtData: Record<string, Array<{ id: string; score: number }>> = {};
    
    for (const [queryId, kData] of Object.entries(groundTruth)) {
      gtData[queryId] = kData[k];
    }

    fs.writeFileSync(filepath, JSON.stringify(gtData, null, 2));
    const fileSize = fs.statSync(filepath).size;
    console.log(`✅ Ground truth k=${k}: ${filepath} (${(fileSize / 1024 / 1024).toFixed(2)} MB)`);
  }

  // Write manifest
  const manifest = {
    phase: 'Phase 1',
    name: 'Exact Ground Truth (Brute-Force Cosine)',
    snapshot_rows: rows.length,
    embedding_dimension: 768,
    embedding_model: 'embeddinggemma:latest',
    similarity_metric: 'cosine',
    algorithm: 'brute-force O(n²)',
    k_values: K_VALUES,
    timestamp: new Date().toISOString(),
  };

  fs.writeFileSync(`${OUTPUT_DIR}/manifest.json`, JSON.stringify(manifest, null, 2));
  console.log(`\n📋 Manifest: ${OUTPUT_DIR}/manifest.json`);
  console.log(JSON.stringify(manifest, null, 2));
}

buildGroundTruth().catch(console.error);
