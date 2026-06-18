#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

function arg(name, fallback = null) {
  const i = process.argv.indexOf(`--${name}`);
  if (i >= 0 && i + 1 < process.argv.length) return process.argv[i + 1];
  return fallback;
}

function flag(name) {
  return process.argv.includes(`--${name}`);
}

const bridge = require(path.resolve('simd-bridge/cpp/build/Release/tensorrt_bridge.node'));

const GPU_REQUIRED = String(process.env.GPU_REQUIRED ?? '').toLowerCase() === 'true';
const DIM = Number(arg('dim', process.env.EMBED_DIM ?? '384'));
const TOPK = Number(arg('topk', process.env.TOPK ?? '8'));
const LIMIT = Number(arg('limit', '0'));

const input = arg('input', '.tmp/ace-nes-packets.json');
const output = arg('out', '.tmp/turbovec-neighbors.ndjson');
const auditOutput = arg('audit-out', 'docs/reports/turbovec-atlas-gap-audit.json');
const embeddingsDir = arg('embeddings-dir', '.opencode/embeddings');
const CHECK_NEO4J = flag('neo4j') || String(process.env.CHECK_NEO4J ?? '').toLowerCase() === 'true';

console.log('[gpu] cuda=', bridge.checkCudaAvailable());

if (GPU_REQUIRED && bridge.checkCudaAvailable() !== 1) {
  throw new Error('CUDA required but unavailable');
}

function readPackets(file) {
  const text = fs.readFileSync(file, 'utf8').trim();
  if (!text) return [];
  if (text.startsWith('[')) return JSON.parse(text);
  return text
    .split(/\r?\n/)
    .filter(Boolean)
    .map((x) => JSON.parse(x));
}

function unwrapEmbedding(value) {
  if (!value) return null;
  if (Array.isArray(value)) return value;
  if (ArrayBuffer.isView(value)) return Array.from(value);

  if (typeof value === 'string') {
    try {
      return unwrapEmbedding(JSON.parse(value));
    } catch {
      return null;
    }
  }

  if (typeof value === 'object') {
    return (
      unwrapEmbedding(value.embedding) ??
      unwrapEmbedding(value.vector) ??
      unwrapEmbedding(value.embeddings) ??
      unwrapEmbedding(value.payload?.embedding) ??
      unwrapEmbedding(value.payload?.vector) ??
      unwrapEmbedding(value.data?.embedding)
    );
  }

  return null;
}

function getEmbedding(row) {
  return (
    unwrapEmbedding(row.embedding) ??
    unwrapEmbedding(row.vector) ??
    unwrapEmbedding(row.embeddings) ??
    unwrapEmbedding(row.payload?.embedding) ??
    unwrapEmbedding(row.payload?.vector) ??
    unwrapEmbedding(row.data?.embedding) ??
    unwrapEmbedding(row.nes_chrom_packet?.embedding) ??
    unwrapEmbedding(row.card?.embedding)
  );
}

function getId(row, i) {
  return String(
    row.id ??
      row.packet_id ??
      row.packetId ??
      row.uuid ??
      row.source_ref ??
      row.canonical_source_ref ??
      row.payload?.id ??
      row.payload?.packet_id ??
      row.payload?.source_ref ??
      row.payload?.canonical_source_ref ??
      i
  );
}

function loadFromEmbeddingDir(dir) {
  if (!fs.existsSync(dir)) return [];

  const rows = [];
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .sort();

  for (const file of files) {
    const full = path.join(dir, file);

    try {
      const j = JSON.parse(fs.readFileSync(full, 'utf8'));
      rows.push({
        id: j.id ?? j.source_ref ?? j.canonical_source_ref ?? file.replace(/\.json$/, ''),
        ...j,
      });
    } catch (err) {
      console.warn('[load] skipped bad embedding file:', full, err.message);
    }
  }

  return rows;
}

function loadRows() {
  let rows;

  if (fs.existsSync(input)) {
    rows = readPackets(input);
    console.log('[load] input=', input, rows.length, 'packets');
  } else {
    console.log('[load] input missing, falling back to', embeddingsDir);
    rows = loadFromEmbeddingDir(embeddingsDir);
    console.log('[load] embeddings=', rows.length, 'packets');
  }

  if (LIMIT > 0) rows = rows.slice(0, LIMIT);
  return rows;
}

function packEmbeddings(rows) {
  const ids = [];
  const kept = [];
  const missing = [];
  const badDim = [];
  const vectors = new Float32Array(rows.length * DIM);

  let k = 0;

  for (let i = 0; i < rows.length; i++) {
    const emb = getEmbedding(rows[i]);
    const id = getId(rows[i], i);

    if (!emb) {
      missing.push({ index: i, id });
      continue;
    }

    if (emb.length !== DIM) {
      badDim.push({ index: i, id, got: emb.length, expected: DIM });
      continue;
    }

    vectors.set(Float32Array.from(emb), k * DIM);
    ids.push(id);
    kept.push(rows[i]);
    k++;
  }

  return {
    ids,
    rows: kept,
    missing,
    badDim,
    vectors: vectors.slice(0, k * DIM),
  };
}

function topKNeighbors(sim, ids, row) {
  const n = ids.length;
  const out = [];

  for (let col = 0; col < n; col++) {
    if (row === col) continue;

    const similarity = sim[row * n + col];
    if (!Number.isFinite(similarity)) continue;

    out.push({
      source_id: ids[row],
      neighbor_id: ids[col],
      similarity,
    });
  }

  return out
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, TOPK)
    .map((e, i) => ({ ...e, topk_rank: i + 1, source: 'turbovec' }));
}

async function checkNeo4j() {
  const result = {
    checked: CHECK_NEO4J,
    reachable: false,
    gds_available: false,
    error: null,
  };

  if (!CHECK_NEO4J) return result;

  try {
    const neo4j = await import('neo4j-driver');
    const driver = neo4j.default.driver(
      process.env.NEO4J_URI ?? 'bolt://127.0.0.1:7687',
      neo4j.default.auth.basic(
        process.env.NEO4J_USER ?? 'neo4j',
        process.env.NEO4J_PASSWORD ?? 'password'
      )
    );

    const session = driver.session();

    try {
      await session.run('RETURN 1 AS ok');
      result.reachable = true;

      try {
        await session.run('CALL gds.version() YIELD version RETURN version');
        result.gds_available = true;
      } catch (err) {
        result.error = `Neo4j reachable but GDS unavailable: ${err.message}`;
      }
    } finally {
      await session.close();
      await driver.close();
    }
  } catch (err) {
    result.error = `Neo4j check failed: ${err.message}`;
  }

  return result;
}

const rows = loadRows();
const packed = packEmbeddings(rows);

console.log(
  '[pack]',
  'valid=',
  packed.ids.length,
  'missing=',
  packed.missing.length,
  'badDim=',
  packed.badDim.length
);

const edges = [];

if (packed.ids.length >= 2) {
  console.time('[gpu] graphSimilarity');
  const sim = bridge.graphSimilarity(packed.vectors, packed.ids.length, DIM);
  console.timeEnd('[gpu] graphSimilarity');

  if (!(sim instanceof Float32Array)) throw new Error(`graphSimilarity returned ${typeof sim}`);
  if (sim.length !== packed.ids.length * packed.ids.length)
    throw new Error(`bad sim length: ${sim.length}`);

  for (let i = 0; i < packed.ids.length; i++) {
    edges.push(...topKNeighbors(sim, packed.ids, i));
  }
} else {
  console.warn('[gpu] skipped graphSimilarity: need at least 2 valid embeddings');
}

fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(
  output,
  edges.map((e) => JSON.stringify(e)).join('\n') + (edges.length ? '\n' : '')
);

console.log('[done]', edges.length, 'edges ->', output);

const neo4j = await checkNeo4j();

const gaps = [];

if (packed.missing.length) {
  gaps.push({
    type: 'embedding_coverage',
    label: 'Rows missing embeddings',
    count: packed.missing.length,
  });
}

if (packed.badDim.length) {
  gaps.push({
    type: 'embedding_dim',
    label: 'Rows with wrong embedding dimensions',
    count: packed.badDim.length,
  });
}

if (!edges.length) {
  gaps.push({ type: 'turbovec', label: 'No TurboVec edges produced' });
}

if (neo4j.checked && !neo4j.reachable) {
  gaps.push({ type: 'neo4j', label: 'Neo4j unreachable', error: neo4j.error });
}

if (neo4j.checked && neo4j.reachable && !neo4j.gds_available) {
  gaps.push({
    type: 'neo4j_gds',
    label: 'Neo4j reachable but GDS unavailable',
    fallback: 'Use TurboVec SIMILAR_TO edges + Cypher traversal',
    error: neo4j.error,
  });
}

if (!neo4j.checked) {
  gaps.push({
    type: 'neo4j_gds',
    label: 'Neo4j/GDS not checked',
    hint: 'Run with --neo4j',
  });
}

const audit = {
  timestamp: new Date().toISOString(),
  config: {
    dim: DIM,
    topk: TOPK,
    limit: LIMIT,
    input,
    output,
    embeddingsDir,
    checkNeo4j: CHECK_NEO4J,
  },
  gpu: {
    cuda_available: bridge.checkCudaAvailable() === 1,
    memory_probe_trusted: false,
  },
  counts: {
    loaded_rows: rows.length,
    valid_embeddings: packed.ids.length,
    missing_embeddings: packed.missing.length,
    wrong_dim_embeddings: packed.badDim.length,
    edges: edges.length,
  },
  neo4j,
  gaps,
  samples: {
    missing: packed.missing.slice(0, 10),
    badDim: packed.badDim.slice(0, 10),
    edges: edges.slice(0, 10),
  },
};

fs.mkdirSync(path.dirname(auditOutput), { recursive: true });
fs.writeFileSync(auditOutput, JSON.stringify(audit, null, 2));

console.log('[audit] wrote', auditOutput);
