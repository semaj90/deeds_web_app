#!/usr/bin/env node
/**
 * READ-ONLY export of a bounded real-vector fixture from
 * codebase_chunks_768_v2 (named vector 'content') for the
 * PyTorch<->cuVS exact top-k parity proof. No mutation.
 */
import { writeFileSync } from 'node:fs';

const QDRANT = process.env.QDRANT_URL ?? 'http://127.0.0.1:6333';
const COLLECTION = process.env.QDRANT_COLLECTION_V2 ?? 'codebase_chunks_768_v2';
const CORPUS_SIZE = Number(process.env.FIXTURE_CORPUS_SIZE ?? 2000);
const OUT = 'C:/Users/james/Videos/deeds-web-app/docs/reports/fixtures/vector-parity-fixture-2026-08-04.json';

const rows = [];
let offset = null;
while (rows.length < CORPUS_SIZE) {
  const body = {
    limit: Math.min(500, CORPUS_SIZE - rows.length),
    with_payload: ['postgres_id', 'source_ref'],
    with_vector: ['content'],
  };
  if (offset) body.offset = offset;
  const res = await fetch(`${QDRANT}/collections/${COLLECTION}/points/scroll`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  const data = await res.json();
  const pts = data.result?.points ?? [];
  if (!pts.length) break;
  for (const p of pts) {
    const vec = p.vector?.content;
    if (!Array.isArray(vec) || vec.length !== 768) continue;
    rows.push({
      qdrant_point_id: String(p.id),
      postgres_id: p.payload?.postgres_id ?? null,
      source_ref: p.payload?.source_ref ?? null,
      vector: vec,
    });
  }
  offset = data.result?.next_page_offset ?? null;
  if (!offset) break;
}

console.log(`Exported ${rows.length} vectors (target ${CORPUS_SIZE})`);
writeFileSync(OUT, JSON.stringify({ collection: COLLECTION, named_vector: 'content', dimension: 768, count: rows.length, rows }));
console.log('Fixture:', OUT);
