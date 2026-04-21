/**
 * Backfill legal_documents Qdrant collection from Postgres legal_chunks embeddings.
 * Reads embedded chunks, upserts to Qdrant with proper payloads.
 */
import postgres from 'postgres';
import crypto from 'crypto';

const DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgresql://legal_admin:123456@127.0.0.1:5432/legal_ai_db';
const QDRANT_URL = process.env.QDRANT_URL ?? 'http://127.0.0.1:6333';
const COLLECTION = 'legal_documents';

const sql = postgres(DATABASE_URL, { max: 3 });

function deterministicPointId(key) {
  const hash = crypto.createHash('md5').update(key).digest();
  return hash.readUInt32BE(0) % 2147483648;
}

async function main() {
  // 1. Delete and recreate collection with only 'content' vector
  console.log('Recreating collection with single content vector...');
  await fetch(`${QDRANT_URL}/collections/${COLLECTION}`, { method: 'DELETE' });
  await new Promise(r => setTimeout(r, 500));

  const createResp = await fetch(`${QDRANT_URL}/collections/${COLLECTION}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      vectors: { content: { size: 768, distance: 'Cosine' } },
      on_disk_payload: true,
      quantization_config: { scalar: { type: 'int8', quantile: 0.99, always_ram: true } },
    }),
  });
  console.log('Create:', createResp.status, await createResp.text());

  // 2. Read all embedded chunks with document metadata
  console.log('Reading chunks from Postgres...');
  const chunks = await sql`
    SELECT
      c.id AS chunk_id,
      c.legal_node_id AS node_id,
      c.chunk_index,
      c.chunk_text,
      c.page_start,
      c.page_end,
      c.embedding::text AS embedding_text,
      n.heading,
      n.document_id,
      d.title AS doc_title,
      d.corpus_type
    FROM legal_chunks c
    JOIN legal_nodes n ON n.id = c.legal_node_id
    JOIN library_documents d ON d.id = n.document_id
    WHERE c.embedding IS NOT NULL
    ORDER BY d.id, c.chunk_index
  `;

  console.log(`Found ${chunks.length} embedded chunks`);

  // 3. Build Qdrant points
  const points = [];
  for (const chunk of chunks) {
    // Parse embedding from Postgres vector text format: [0.1,0.2,...]
    const embText = chunk.embedding_text;
    if (!embText) continue;
    const vector = embText.replace(/^\[|\]$/g, '').split(',').map(Number);
    if (vector.length !== 768) continue;

    const pointKey = `legal-chunk:${chunk.node_id}:${chunk.chunk_index}`;
    points.push({
      id: deterministicPointId(pointKey),
      vector: { content: vector },
      payload: {
        chunk_id: String(chunk.chunk_id),
        document_id: String(chunk.document_id),
        node_id: String(chunk.node_id),
        heading: chunk.heading || '',
        snippet: (chunk.chunk_text || '').slice(0, 400),
        page_start: chunk.page_start,
        page_end: chunk.page_end,
        chunk_index: chunk.chunk_index,
        source: 'legal_library',
        doc_title: chunk.doc_title || '',
        corpus_type: chunk.corpus_type || '',
      },
    });
  }

  console.log(`Built ${points.length} Qdrant points`);

  // 4. Batch upsert (50 per batch)
  let upserted = 0;
  const batchSize = 50;
  for (let i = 0; i < points.length; i += batchSize) {
    const batch = points.slice(i, i + batchSize);
    const resp = await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points?wait=true`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ points: batch }),
    });
    if (resp.ok) {
      upserted += batch.length;
    } else {
      const err = await resp.text();
      console.error(`Batch ${Math.floor(i / batchSize)} failed:`, err.slice(0, 200));
    }
    if ((i + batchSize) % 500 === 0) {
      console.log(`  ... ${upserted} / ${points.length} upserted`);
    }
  }

  console.log(`\nDone: ${upserted} points upserted to ${COLLECTION}`);

  // Verify
  const verifyResp = await fetch(`${QDRANT_URL}/collections/${COLLECTION}`);
  const verifyData = await verifyResp.json();
  console.log(`Qdrant points_count: ${verifyData.result.points_count}`);

  await sql.end();
}

main().catch(err => { console.error(err); process.exit(1); });
