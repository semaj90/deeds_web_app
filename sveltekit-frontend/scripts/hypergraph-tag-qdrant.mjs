#!/usr/bin/env node
/**
 * hypergraph-tag-qdrant.mjs
 *
 * Reads the assignments NDJSON produced by hypergraph-build.mjs and
 * writes a `som_cluster` payload field to each matching point in Qdrant.
 *
 * Usage:
 *   node scripts/hypergraph-tag-qdrant.mjs \
 *     --assignments ./tmp/assignments-ci.ndjson \
 *     --collection evidence_items \
 *     --qdrant http://127.0.0.1:6333 \
 *     [--batch 64]   [--dry-run]
 *
 * The assignments file must contain lines like:
 *   {"id": "<qdrant-point-id>", "centroid": 12}
 *
 * Qdrant point ids may be UUIDs or integers. String ids are used verbatim.
 */
import fs from 'fs';
import readline from 'readline';

function parseArgs() {
  const args = process.argv.slice(2);
  const out = { batch: 64, dryRun: false };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--assignments')  out.assignments  = args[++i];
    else if (a === '--collection') out.collection = args[++i];
    else if (a === '--qdrant')  out.qdrant  = args[++i];
    else if (a === '--batch')   out.batch   = Number(args[++i]);
    else if (a === '--dry-run') out.dryRun  = true;
    else if (a === '--help')    out.help    = true;
  }
  return out;
}

async function setPayloadBatch(qdrantUrl, collection, points, dryRun) {
  // points: [{id, centroid}]
  if (dryRun) {
    console.log(`[dry-run] Would set payload for ${points.length} points`);
    return;
  }
  // Qdrant SetPayload endpoint: PUT /collections/{name}/points/payload
  // Body: { "payload": { "som_cluster": <N>, "gpu_cluster": <N> }, "points": [<id>, ...] }
  // We must group by centroid value to batch efficiently.
  const byCentroid = new Map();
  for (const { id, centroid } of points) {
    if (!byCentroid.has(centroid)) byCentroid.set(centroid, []);
    byCentroid.get(centroid).push(id);
  }
  for (const [centroid, ids] of byCentroid) {
    const url = `${qdrantUrl}/collections/${encodeURIComponent(collection)}/points/payload`;
    const body = JSON.stringify({ payload: { som_cluster: centroid, gpu_cluster: centroid }, points: ids });
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => '');
      console.warn(`Qdrant payload update failed for cluster ${centroid}: ${res.status} ${txt.slice(0, 200)}`);
    }
  }
}

async function main() {
  const cfg = parseArgs();
  if (cfg.help || !cfg.assignments || !cfg.collection) {
    console.log('Usage: node scripts/hypergraph-tag-qdrant.mjs --assignments <file> --collection <name> [--qdrant <url>] [--batch 64] [--dry-run]');
    process.exit(cfg.help ? 0 : 1);
  }

  const qdrantUrl = cfg.qdrant || 'http://127.0.0.1:6333';
  const batchSize = cfg.batch;

  console.log(`Tagging collection "${cfg.collection}" from ${cfg.assignments}`);
  console.log(`Qdrant: ${qdrantUrl}  batch: ${batchSize}  dry-run: ${cfg.dryRun}`);

  const rl = readline.createInterface({ input: fs.createReadStream(cfg.assignments), crlfDelay: Infinity });
  let batch = [], total = 0, skipped = 0;

  for await (const line of rl) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let obj;
    try { obj = JSON.parse(trimmed); } catch (e) { skipped++; continue; }

    const id = obj.id;
    const centroid = obj.centroid;
    if (id == null || centroid == null) { skipped++; continue; }
    batch.push({ id: typeof id === 'number' ? id : String(id), centroid: Number(centroid) });

    if (batch.length >= batchSize) {
      await setPayloadBatch(qdrantUrl, cfg.collection, batch, cfg.dryRun);
      total += batch.length;
      batch = [];
      if (total % 1000 === 0) console.log(`  Tagged ${total} points so far…`);
    }
  }

  if (batch.length > 0) {
    await setPayloadBatch(qdrantUrl, cfg.collection, batch, cfg.dryRun);
    total += batch.length;
  }

  console.log(`Done. Tagged ${total} points, skipped ${skipped} invalid lines.`);
}

main().catch(err => { console.error(err); process.exit(1); });
