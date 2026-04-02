/**
 * Export error_embeddings payloads from Qdrant -384 volume
 * Run: node scripts/export-qdrant-384.mjs
 * Requires: Qdrant -384 running on port 16333
 */
import fs from 'fs';

const BATCH = 100;
const QDRANT_URL = 'http://127.0.0.1:16333';
const OUT_DIR = 'deeds_labs/data-exports/qdrant-384';

fs.mkdirSync(OUT_DIR, { recursive: true });

async function exportCollection(name) {
  const OUT = `${OUT_DIR}/${name}_payloads.jsonl`;
  let offset = null;
  let total = 0;
  const stream = fs.createWriteStream(OUT);

  while (true) {
    const body = { limit: BATCH, with_payload: true, with_vector: false };
    if (offset !== null) body.offset = offset;

    const res = await fetch(`${QDRANT_URL}/collections/${name}/points/scroll`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const data = await res.json();

    if (!data.result || !data.result.points || data.result.points.length === 0) break;

    for (const pt of data.result.points) {
      stream.write(JSON.stringify({ id: pt.id, payload: pt.payload }) + '\n');
      total++;
    }

    offset = data.result.next_page_offset;
    if (offset === null || offset === undefined) break;

    if (total % 10000 === 0) process.stderr.write(`  ${name}: exported ${total} points...\n`);
  }

  stream.end();
  console.log(`${name}: ${total} points → ${OUT}`);
  return total;
}

// Export all non-empty collections
const collections = ['error_embeddings', 'phase44_fingerprints'];
let grandTotal = 0;
for (const coll of collections) {
  grandTotal += await exportCollection(coll);
}
console.log(`\nTotal exported: ${grandTotal} points`);