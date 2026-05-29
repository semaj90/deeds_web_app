import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
const __dirname = fileURLToPath(new URL('.', import.meta.url));

function safeAppendReport(obj) {
  try {
    const p = new URL('../../.tmp/qdrant-upsert-dim-report.jsonl', import.meta.url);
    const fp = fileURLToPath(p);
    fs.mkdirSync(fp.replace(/\/[^/]*$/, ''), { recursive: true });
    fs.appendFileSync(fp, JSON.stringify(obj) + '\n');
  } catch (e) {
    // best-effort
    try { console.warn('Could not write qdrant-upsert report', e); } catch {}
  }
}

function normalizePoints(points) {
  // Support points as {id, vector, payload} or {id, payload, vector}
  return points.map(p => ({ id: p.id, vector: p.vector ?? p.embedding ?? p.vector, payload: p.payload ?? p.meta ?? p.payload }));
}

export async function upsertValidated({ client, collection, points, expectedDim = Number(process.env.EMBED_DIM ?? 768), batchSize = 256, wait = false, dryRun = false } = {}) {
  if (!client) throw new Error('upsertValidated: missing client');
  if (!collection) throw new Error('upsertValidated: missing collection');
  if (!Array.isArray(points) || points.length === 0) return { upserted: 0, skipped: 0 };

  const normalized = normalizePoints(points || []);
  let skipped = 0;
  let upserted = 0;

  for (let i = 0; i < normalized.length; i += batchSize) {
    const batch = normalized.slice(i, i + batchSize);
    const valid = [];
    const invalid = [];

    for (const pt of batch) {
      const vec = pt.vector;
      if (!Array.isArray(vec) && !(vec instanceof Float32Array)) {
        invalid.push({ reason: 'not-array', id: pt.id, len: Array.isArray(vec) ? vec.length : typeof vec });
        skipped++;
        continue;
      }
      const len = vec.length;
      if (len !== expectedDim) {
        invalid.push({ reason: 'bad-dim', id: pt.id, len, expected: expectedDim });
        skipped++;
        continue;
      }
      valid.push({ id: pt.id, vector: Array.isArray(vec) ? vec : Array.from(vec), payload: pt.payload });
    }

    if (invalid.length > 0) {
      safeAppendReport({ time: new Date().toISOString(), collection, invalid });
      console.warn(`upsertValidated: skipped ${invalid.length} invalid points for collection=${collection}`);
    }

    if (valid.length === 0) continue;

    if (dryRun) {
      upserted += valid.length;
      continue;
    }

    // Support both client.upsert(collection, { points }) and client.upsert({ collection, points }) shapes
    try {
      if (typeof client.upsert === 'function') {
        // Detect older/rest client shape: upsert(collection, { points, wait })
        // We'll attempt both: first try client.upsert({ collection, points, wait })
        let called = false;
        try {
          // prefer object form
          await client.upsert({ collection, points: valid, wait });
          called = true;
        } catch (e) {
          // fallback to two-arg form
        }
        if (!called) {
          // some clients expect (collection, { points, wait })
          await client.upsert(collection, { points: valid, wait });
        }
      } else if (typeof client.upsertPoints === 'function') {
        await client.upsertPoints(collection, valid, { wait });
      } else if (typeof client.collections?.upsert === 'function') {
        await client.collections.upsert(collection, valid, { wait });
      } else {
        throw new Error('No supported upsert method found on client');
      }
      upserted += valid.length;
    } catch (err) {
      safeAppendReport({ time: new Date().toISOString(), collection, error: String(err), failedCount: valid.length });
      console.error('upsertValidated: qdrant upsert failed', err);
      // continue to next batch
    }
  }

  return { upserted, skipped };
}

export default upsertValidated;
