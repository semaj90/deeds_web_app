#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const bridge = require(path.resolve('simd-bridge/cpp/build/Release/tensorrt_bridge.node'));

const GPU_REQUIRED = String(process.env.GPU_REQUIRED ?? '').toLowerCase() === 'true';
const DIM = Number(process.env.EMBED_DIM ?? 384);
const TOPK = Number(process.env.TOPK ?? 8);

const input = process.argv[2] ?? '.tmp/ace-nes-packets.json';
const output = process.argv[3] ?? '.tmp/turbovec-neighbors.ndjson';

console.log('[gpu] cuda=', bridge.checkCudaAvailable());

if (GPU_REQUIRED && bridge.checkCudaAvailable() !== 1) {
  throw new Error('CUDA required but unavailable');
}

function readPackets(file) {
  const text = fs.readFileSync(file, 'utf8').trim();
  if (text.startsWith('[')) return JSON.parse(text);
  return text.split(/\r?\n/).filter(Boolean).map((x) => JSON.parse(x));
}

function getEmbedding(row) {
  return row.embedding ?? row.vector ?? row.payload?.embedding ?? row.payload?.vector;
}

function getId(row, i) {
  return row.packet_key
    ?? row.id
    ?? row.packet_id
    ?? row.packetId
    ?? row.source_ref
    ?? row.canonical_source_ref
    ?? String(i);
}

function packEmbeddings(rows) {
  const vectors = new Float32Array(rows.length * DIM);

  for (let i = 0; i < rows.length; i++) {
    const emb = getEmbedding(rows[i]);
    if (!emb) throw new Error(`missing embedding at row ${i}`);
    if (emb.length !== DIM) throw new Error(`bad embedding ${i}: got ${emb.length}, expected ${DIM}`);
    vectors.set(Float32Array.from(emb), i * DIM);
  }

  return vectors;
}

function topKNeighbors(sim, rows, row) {
  const n = rows.length;
  const out = [];

  for (let col = 0; col < n; col++) {
    if (row === col) continue;
    out.push({
      source_id: getId(rows[row], row),
      neighbor_id: getId(rows[col], col),
      similarity: sim[row * n + col]
    });
  }

  return out.sort((a, b) => b.similarity - a.similarity).slice(0, TOPK);
}

const rows = readPackets(input);
console.log('[load]', rows.length, 'packets');

const vectors = packEmbeddings(rows);

console.time('[gpu] graphSimilarity');
const sim = bridge.graphSimilarity(vectors, rows.length, DIM);
console.timeEnd('[gpu] graphSimilarity');

if (!(sim instanceof Float32Array)) throw new Error(`graphSimilarity returned ${typeof sim}`);
if (sim.length !== rows.length * rows.length) throw new Error(`bad sim length: ${sim.length}`);

const edges = [];

for (let i = 0; i < rows.length; i++) {
  edges.push(...topKNeighbors(sim, rows, i));
}

fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, edges.map((e) => JSON.stringify(e)).join('\n') + '\n');

console.log('[done]', edges.length, 'edges ->', output);
