'use strict';
const Redis = require('ioredis');
const fs = require('fs');
const path = require('path');

const QDRANT_URL = 'http://127.0.0.1:6333';
const COLLECTION = 'codebase_chunks_768';
const BATCH_SIZE = 50;

async function qdrantScroll(offset, limit) {
  const res = await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points/scroll`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ limit, offset, with_payload: true, with_vector: false }),
  });
  return res.json();
}

async function qdrantSetPayload(points) {
  // points: [{ id, payload }]
  const results = await Promise.all(points.map(({ id, payload }) =>
    fetch(`${QDRANT_URL}/collections/${COLLECTION}/points/payload`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ points: [id], payload }),
    }).then(r => r.json())
  ));
  return results;
}

async function main() {
  // Load authority data from JSONL
  const jsonlPath = path.resolve(__dirname, '../memory/packets/atlas-node-authority.jsonl');
  const authorityMap = new Map(); // source_ref -> { karpathy_blend, authority_score, final_blend }
  for (const line of fs.readFileSync(jsonlPath, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    try {
      const r = JSON.parse(line);
      if (r.source_ref) authorityMap.set(r.source_ref, r);
    } catch {}
  }
  console.log('Authority map size:', authorityMap.size);

  let offset = null;
  let total = 0, patched = 0;

  while (true) {
    const body = { limit: BATCH_SIZE, with_payload: true, with_vector: false };
    if (offset) body.offset = offset;

    const res = await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points/scroll`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    const points = data.result?.points ?? [];
    if (!points.length) break;

    const updates = [];
    for (const pt of points) {
      const srcRef = pt.payload?.source_ref || pt.payload?.file_path || pt.payload?.path || '';
      const authority = authorityMap.get(srcRef);
      if (!authority) continue;
      updates.push({
        id: pt.id,
        payload: {
          authority_score:    authority.authority_score ?? null,
          karpathy_blend:     authority.karpathy_blend ?? null,
          karpathy_attn:      authority.karpathy_attn ?? null,
          karpathy_pr:        authority.karpathy_pr ?? null,
          final_blend:        authority.final_blend ?? null,
        },
      });
    }

    if (updates.length) {
      // Batch update: set payload per point
      const batchRes = await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points/payload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          points: updates.map(u => u.id),
          payload: updates.reduce((acc, u) => {
            // Qdrant set-payload applies same payload to all listed points — do one at a time
            return u.payload;
          }, {}),
        }),
      });
      // Fall back to per-point updates since Qdrant applies one payload to all points in batch
      for (const u of updates) {
        await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points/payload`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ points: [u.id], payload: u.payload }),
        });
        patched++;
      }
    }

    total += points.length;
    offset = data.result?.next_page_offset ?? null;
    process.stdout.write(`\rScrolled: ${total} | Patched: ${patched}`);
    if (!offset) break;
  }

  console.log(`\nDone. Total scrolled: ${total}, patched: ${patched}`);
}
main().catch(e => { console.error('\n' + e.message); process.exit(1); });
