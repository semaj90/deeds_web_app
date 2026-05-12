#!/usr/bin/env node
/**
 * Export CouchDB karpathy_wiki → Neo4j-importable JSONL graph facts.
 *
 * Usage:
 *   node scripts/couchdb-export-graph-jsonl.mjs
 *   node scripts/couchdb-export-graph-jsonl.mjs --out logs/graph-export.jsonl
 *   node scripts/couchdb-export-graph-jsonl.mjs --dry-run       # count only
 *   node scripts/couchdb-export-graph-jsonl.mjs --no-neo4j      # skip Neo4j upsert
 *
 * Output format (one JSON object per line):
 *   { "type": "node",   "id": "...", "labels": [...], "properties": {...} }
 *   { "type": "edge",   "source": "...", "target": "...", "relationship": "...", "properties": {...} }
 *
 * After export, the JSONL can be:
 *   1. Streamed into Neo4j via LOAD CSV / APOC / direct Cypher import
 *   2. Piped into npm run graphify:neo4j:clusters (which reads the same shape)
 *   3. Used to build the Obsidian vault note writer (next pipeline step)
 */

import { createWriteStream } from 'fs';
import { resolve } from 'path';

const COUCH_URL = process.env.COUCHDB_URL ?? 'http://admin:legal_ai_pass@127.0.0.1:5984';
const DB        = 'karpathy_wiki';
const DRY_RUN   = process.argv.includes('--dry-run');
const NO_NEO4J  = process.argv.includes('--no-neo4j');

const outArgIdx = process.argv.indexOf('--out');
const OUT_PATH  = outArgIdx >= 0 ? process.argv[outArgIdx + 1] : `logs/graph-export-${Date.now()}.jsonl`;

// ── CouchDB helpers ───────────────────────────────────────────────────────────

async function viewRows(view, params = {}) {
  const qs = new URLSearchParams({ limit: '1000', ...params }).toString();
  const url = `${COUCH_URL}/${DB}/_design/wiki/_view/${view}?${qs}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (res.status === 404) {
    console.warn(`[export] View ${view} not found — run couchdb-push-wiki-views.mjs first`);
    return [];
  }
  if (!res.ok) throw new Error(`CouchDB ${view} → ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.rows ?? [];
}

async function allDocs(type) {
  const url = `${COUCH_URL}/${DB}/_find`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ selector: { type }, limit: 2000 }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) {
    // Fallback to _all_docs if Mango is unavailable
    const all = await fetch(`${COUCH_URL}/${DB}/_all_docs?include_docs=true&limit=2000`);
    const d = await all.json();
    return (d.rows ?? []).map((r) => r.doc).filter((d) => d?.type === type);
  }
  const data = await res.json();
  return data.docs ?? [];
}

// ── JSONL line builders ───────────────────────────────────────────────────────

function nodeLine(id, labels, properties) {
  return JSON.stringify({ type: 'node', id, labels, properties });
}

function edgeLine(source, target, relationship, properties = {}) {
  return JSON.stringify({ type: 'edge', source, target, relationship, properties: { ...properties, source: 'couchdb_view' } });
}

// ── Neo4j upsert ──────────────────────────────────────────────────────────────

async function upsertNeo4j(lines) {
  if (NO_NEO4J) return;
  try {
    const { default: neo4j } = await import('neo4j-driver');
    const NEO4J_URL  = process.env.NEO4J_URL  ?? 'bolt://127.0.0.1:7687';
    const NEO4J_USER = process.env.NEO4J_USER ?? 'neo4j';
    const NEO4J_PASS = process.env.NEO4J_PASS ?? 'legal_ai_pass';

    const driver = neo4j.driver(NEO4J_URL, neo4j.auth.basic(NEO4J_USER, NEO4J_PASS));
    const session = driver.session();
    let nodeCount = 0;
    let edgeCount = 0;

    for (const line of lines) {
      const obj = JSON.parse(line);
      if (obj.type === 'node') {
        const label = obj.labels[0] ?? 'Doc';
        await session.run(
          `MERGE (n:${label} {id: $id}) SET n += $props`,
          { id: obj.id, props: obj.properties },
        );
        nodeCount++;
      } else if (obj.type === 'edge') {
        await session.run(
          `MATCH (a {id: $src}), (b {id: $tgt})
           MERGE (a)-[r:${obj.relationship}]->(b)
           SET r += $props`,
          { src: obj.source, tgt: obj.target, props: obj.properties },
        );
        edgeCount++;
      }
    }

    await session.close();
    await driver.close();
    console.log(`[export] Neo4j upsert: ${nodeCount} nodes, ${edgeCount} edges`);
  } catch (err) {
    console.warn(`[export] Neo4j upsert skipped: ${err.message}`);
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`[export] CouchDB: ${COUCH_URL}/${DB}`);
  if (DRY_RUN) console.log('[export] DRY RUN — counting only');

  const lines = [];
  const seenIds = new Set();

  // 1. Cluster encyclopedia nodes (cluster:N:encyclopedia docs)
  const encyclopedias = await allDocs('cluster_encyclopedia');
  for (const doc of encyclopedias) {
    const id = `cluster:${doc.cluster_id}`;
    if (!seenIds.has(id)) {
      seenIds.add(id);
      lines.push(nodeLine(id, ['Cluster', 'ClusterEncyclopedia'], {
        clusterId:  doc.cluster_id,
        label:      doc.label ?? '',
        summary:    (doc.summary ?? '').slice(0, 500),
        didYouMean: JSON.stringify(doc.did_you_mean ?? []),
        chunkCount: (doc.chunk_ids ?? []).length,
      }));
    }
  }
  console.log(`[export] ${encyclopedias.length} cluster encyclopedia nodes`);

  // 2. Chunk nodes + BELONGS_TO_CLUSTER edges (by_cluster view)
  const clusterRows = await viewRows('by_cluster');
  for (const row of clusterRows) {
    const [clusterId, docType] = row.key;
    const val = row.value;
    const chunkId = `chunk:${val.id}`;

    if (!seenIds.has(chunkId) && docType === 'chunk') {
      seenIds.add(chunkId);
      lines.push(nodeLine(chunkId, ['Chunk'], {
        caseId:     val.case_id ?? '',
        documentId: val.document_id ?? '',
        chunkId:    val.chunk_id ?? '',
        tags:       JSON.stringify(val.tags ?? []),
      }));
    }

    // BELONGS_TO_CLUSTER edge (chunk → cluster)
    if (docType === 'chunk') {
      lines.push(edgeLine(chunkId, `cluster:${clusterId}`, 'BELONGS_TO_CLUSTER', { clusterId }));
    }
  }
  console.log(`[export] ${clusterRows.length} chunk→cluster edges`);

  // 3. Video transcript segment nodes (by_video_timestamp view)
  const transcriptRows = await viewRows('by_video_timestamp');
  for (const row of transcriptRows) {
    const [caseId, videoId, startSec] = row.key;
    const val = row.value;
    const segId = val.id ?? `seg:${caseId}:${videoId}:${startSec}`;

    if (!seenIds.has(segId)) {
      seenIds.add(segId);
      lines.push(nodeLine(segId, ['TranscriptSegment'], {
        caseId,
        videoId,
        startSec,
        endSec:  val.end_sec,
        speaker: val.speaker ?? '',
        text:    (val.text ?? '').slice(0, 500),
        tags:    JSON.stringify(val.tags ?? []),
      }));

      // TRANSCRIPT_OF edge (segment → cluster if tagged with som_cluster)
      // Emitting a PART_OF edge to a video placeholder node
      const videoNodeId = `video:${caseId}:${videoId}`;
      if (!seenIds.has(videoNodeId)) {
        seenIds.add(videoNodeId);
        lines.push(nodeLine(videoNodeId, ['Video'], { caseId, videoId }));
      }
      lines.push(edgeLine(segId, videoNodeId, 'PART_OF', { startSec }));
    }
  }
  console.log(`[export] ${transcriptRows.length} transcript segment nodes`);

  // 4. did_you_mean alias edges (cluster → cluster via alias similarity)
  for (const doc of encyclopedias) {
    const srcId = `cluster:${doc.cluster_id}`;
    for (const alias of (doc.did_you_mean ?? [])) {
      lines.push(edgeLine(srcId, srcId, 'HAS_ALIAS', { alias }));
    }
  }

  console.log(`[export] Total lines: ${lines.length} (${[...seenIds].length} unique nodes)`);

  if (DRY_RUN) return;

  // Write JSONL
  const outPath = resolve(OUT_PATH);
  const stream  = createWriteStream(outPath);
  for (const line of lines) stream.write(line + '\n');
  await new Promise((res) => stream.end(res));
  console.log(`[export] ✅ Written: ${outPath}`);

  // Optional Neo4j upsert
  await upsertNeo4j(lines);
}

main().catch((err) => { console.error('[export]', err.message); process.exit(1); });
