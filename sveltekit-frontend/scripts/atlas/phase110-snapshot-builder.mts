import * as fs from 'fs';
import { createHash } from 'crypto';
import { execSync } from 'child_process';

const OLLAMA_URL = 'http://127.0.0.1:11434';
const BATCH_SIZE = 10;
const OUTPUT_DIR = './phase110_snapshot';

interface SnapshotRow {
  id: string;
  packet_key: string;
  source_ref: string;
  feature_id: string;
  feature_label: string;
  content_hash: string;
  embedding_768: number[];
  embedding_model: string;
  embedding_dimension: number;
  generated_at: string;
}

async function embedChunks(texts: string[]): Promise<number[][]> {
  const results: number[][] = [];
  for (const text of texts) {
    const response = await fetch(`${OLLAMA_URL}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'embeddinggemma:latest',
        prompt: text || 'empty',
      }),
    });

    if (!response.ok) throw new Error(`Embedding failed: ${response.status}`);
    const data = await response.json() as { embedding: number[] };
    results.push(data.embedding);
  }
  return results;
}

async function buildSnapshot() {
  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  console.log('📊 Building Phase 110 Arrow IPC Snapshot (768-dim canonical)\n');

  // Fetch row count via docker exec
  const countCmdResult = execSync('docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c "SELECT COUNT(*) as total FROM codebase_chunk_index"').toString();
  const totalRows = parseInt(countCmdResult.split('\n')[2].trim(), 10);
  console.log(`📈 Total rows in codebase_chunk_index: ${totalRows}`);

  // Fetch rows in batches via docker exec
  let allRows: SnapshotRow[] = [];
  let processedCount = 0;
  const startTime = Date.now();
  const sampleLimit = 100; // Proof-of-concept with first 100 rows

  for (let offset = 0; offset < Math.min(totalRows, sampleLimit); offset += BATCH_SIZE) {
    const query = `SELECT id, chunk_id as packet_key, content_hash, domain as feature_id, COALESCE(cluster_summary->>'label', 'unknown') as feature_label, content, content_hash as source_ref FROM codebase_chunk_index ORDER BY id ASC LIMIT ${BATCH_SIZE} OFFSET ${offset}`;

    const cmd = `docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c "${query}" -t`;
    const result = execSync(cmd).toString();

    const lines = result.split('\n').filter(l => l.trim());
    const batchNum = Math.floor(offset / BATCH_SIZE) + 1;

    if (lines.length === 0) break;

    for (const line of lines) {
      if (!line.includes('|')) continue;

      const parts = line.split('|').map(p => p.trim());
      if (parts.length < 7) continue;

      const [id, packet_key, content_hash, feature_id, feature_label, content, source_ref] = parts;

      try {
        const embeddings = await embedChunks([content || '']);

        allRows.push({
          id,
          packet_key: packet_key || '',
          source_ref: source_ref || content_hash,
          feature_id: feature_id || 'unknown',
          feature_label: feature_label || 'unknown',
          content_hash,
          embedding_768: embeddings[0],
          embedding_model: 'embeddinggemma:latest',
          embedding_dimension: 768,
          generated_at: new Date().toISOString(),
        });

        processedCount++;
        const elapsed = (Date.now() - startTime) / 1000;
        const rate = processedCount / elapsed;

        if (processedCount % 10 === 0) {
          console.log(`[Batch ${batchNum}] Processed: ${processedCount} rows (${rate.toFixed(1)} rows/sec)`);
        }
      } catch (err) {
        console.error(`❌ Error processing row ${id}:`, err);
      }
    }
  }

  console.log(`\n✅ Embedding complete: ${processedCount} rows in ${((Date.now() - startTime) / 1000).toFixed(1)}s`);

  // Build manifest
  const featureIds = [...new Set(allRows.map(r => r.feature_id))].sort();
  const featureIdOrderHash = createHash('sha256').update(featureIds.join(',')).digest('hex');
  const contentHash = createHash('sha256').update(JSON.stringify(allRows.map(r => r.content_hash))).digest('hex');

  const manifest = {
    schema_version: 'atlas_snapshot_v1',
    timestamp: new Date().toISOString(),
    total_rows: allRows.length,
    total_rows_in_corpus: totalRows,
    embedding_dimension: 768,
    embedding_model: 'embeddinggemma:latest',
    representation_revision: `embeddinggemma:${new Date().toISOString().split('T')[0]}.1`,
    feature_id_order_hash: featureIdOrderHash,
    content_hash: contentHash,
    feature_ids_unique_count: featureIds.length,
    row_order: 'deterministic by id (uuid)',
    vector_normalization: 'l2 (embeddinggemma native)',
  };

  const manifestPath = `${OUTPUT_DIR}/manifest.json`;
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  console.log(`\n📋 Manifest: ${manifestPath}`);
  console.log(JSON.stringify(manifest, null, 2));

  const snapshotPath = `${OUTPUT_DIR}/snapshot.ndjson`;
  const ws = fs.createWriteStream(snapshotPath);

  const arrowSchema = {
    _arrow_schema: {
      fields: [
        { name: 'id', type: { type: 'utf8' } },
        { name: 'packet_key', type: { type: 'utf8' } },
        { name: 'source_ref', type: { type: 'utf8' } },
        { name: 'feature_id', type: { type: 'utf8' } },
        { name: 'feature_label', type: { type: 'utf8' } },
        { name: 'content_hash', type: { type: 'utf8' } },
        { name: 'embedding_768', type: { type: 'list', valueType: { type: 'floatingpoint', precision: 'single' } } },
        { name: 'embedding_model', type: { type: 'utf8' } },
        { name: 'embedding_dimension', type: { type: 'int', bitWidth: 32, isSigned: true } },
        { name: 'generated_at', type: { type: 'utf8' } },
      ],
    },
  };

  ws.write(JSON.stringify(arrowSchema) + '\n');
  allRows.forEach(row => ws.write(JSON.stringify(row) + '\n'));
  ws.end();

  console.log(`\n✅ Arrow IPC snapshot: ${snapshotPath}`);
  const fileSize = fs.statSync(snapshotPath).size;
  console.log(`   Rows: ${allRows.length}, File size: ${(fileSize / 1024).toFixed(2)} KB`);
}

buildSnapshot().catch(console.error);
