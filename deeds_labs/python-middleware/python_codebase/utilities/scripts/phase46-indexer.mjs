#!/usr/bin/env node
/**
 * Phase 46 Indexer - Safe Crawl & Tensor Cache continuation
 * --------------------------------------------------------
 * Consumes cached document chunks produced by python-services/doc_ingest.py,
 * reads embeddings from Redis, and upserts the data into Postgres (pgvector)
 * and Neo4j for downstream RAG + knowledge graph workflows.
 */

import { promises as fsp } from 'fs';
import path from 'path';
import { createHash } from 'crypto';
import Redis from 'ioredis';
import neo4j from 'neo4j-driver';
import pgPkg from 'pg';
import fetch from 'node-fetch';

const {
  Client: PostgresClient,
} = pgPkg;

const DEFAULT_CACHE_DIR =
  process.env.PHASE46_CACHE_DIR ||
  process.env.DOC_INGEST_CACHE_DIR ||
  path.join(process.cwd(), 'cache', 'phase46_adapter');
const CACHE_DIR = path.resolve(DEFAULT_CACHE_DIR);
const MANIFEST_PATH = path.join(CACHE_DIR, 'manifest.json');

const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const DATABASE_URL = process.env.DATABASE_URL || null;
const PG_TABLE = process.env.PHASE46_PG_TABLE || 'rag_document_chunks';

const NEO4J_URL =
  process.env.NEO4J_URL ||
  process.env.NEO4J_URI ||
  process.env.NEO4J_BOLT_URL ||
  null;
const NEO4J_USER =
  process.env.NEO4J_USER ||
  process.env.NEO4J_USERNAME ||
  'neo4j';
const NEO4J_PASSWORD = process.env.NEO4J_PASSWORD || 'neo4j';

const TOP_K_SIMILAR = Number.parseInt(process.env.PHASE46_SIMILAR_TOP_K || '3', 10);
const SIMILARITY_THRESHOLD = Number.parseFloat(process.env.PHASE46_SIMILAR_THRESHOLD || '0.82');
const CHUNK_TEXT_PREVIEW = Number.parseInt(process.env.PHASE46_CHUNK_PREVIEW || '480', 10);
const PHASE47_GRAPH_URL = process.env.PHASE47_GRAPH_URL || 'http://localhost:8093';
const PHASE47_DISABLE = process.env.PHASE47_DISABLE === '1';

function logInfo(message, ...args) {
  console.log(`[Phase46] ${message}`, ...args);
}

function logWarn(message, ...args) {
  console.warn(`[Phase46][warn] ${message}`, ...args);
}

function logError(message, ...args) {
  console.error(`[Phase46][error] ${message}`, ...args);
}

async function pathExists(filePath) {
  try {
    await fsp.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function loadJson(filePath) {
  const content = await fsp.readFile(filePath, 'utf8');
  return JSON.parse(content);
}

function computeChecksum(text) {
  return createHash('sha256').update(text).digest('hex');
}

function cosineSimilarity(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) {
    return null;
  }
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i += 1) {
    const av = Number(a[i]) || 0;
    const bv = Number(b[i]) || 0;
    dot += av * bv;
    normA += av * av;
    normB += bv * bv;
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  if (!denom) return null;
  return dot / denom;
}

function buildSimilarityEdges(chunks, topK, threshold) {
  const edges = [];
  for (let i = 0; i < chunks.length; i += 1) {
    const current = chunks[i];
    if (!current.embedding) continue;

    const candidates = [];
    for (let j = i + 1; j < chunks.length; j += 1) {
      const other = chunks[j];
      if (!other.embedding) continue;
      const score = cosineSimilarity(current.embedding, other.embedding);
      if (score !== null && score >= threshold) {
        candidates.push({ otherIndex: j, score });
      }
    }
    candidates.sort((a, b) => b.score - a.score);
    const limited = candidates.slice(0, topK);
    limited.forEach(({ otherIndex, score }) => {
      const other = chunks[otherIndex];
      edges.push({
        fromId: current.id,
        toId: other.id,
        score: Number(score.toFixed(4)),
      });
    });
  }
  return edges;
}

async function callPhase47Graph(docId, chunkEmbeddings) {
  if (PHASE47_DISABLE || !chunkEmbeddings.length || !PHASE47_GRAPH_URL) {
    return null;
  }

  const url = `${PHASE47_GRAPH_URL.replace(/\/$/, '')}/analyze_graph`;
  const payload = {
    source: docId,
    keys: chunkEmbeddings.map((chunk) => chunk.id),
    text_embeddings: chunkEmbeddings.map((chunk) => chunk.embedding),
    ast_embeddings: chunkEmbeddings.map((chunk) => chunk.embedding),
    top_k: Math.min(TOP_K_SIMILAR, chunkEmbeddings.length),
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5_000);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    if (!res.ok) {
      logWarn(`Phase47 graph analyzer returned ${res.status}`);
      return null;
    }
    const json = await res.json();
    if (!Array.isArray(json?.edges)) {
      return null;
    }
    return json.edges
      .filter((edge) => edge?.src && edge?.dst)
      .map((edge) => ({
        fromId: edge.src,
        toId: edge.dst,
        score: Number.parseFloat(edge.score),
      }));
  } catch (err) {
    logWarn(`Phase47 graph analyzer unavailable: ${err.message}`);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function connectRedis() {
  if (!REDIS_URL) {
    logWarn('REDIS_URL not provided; cannot read embeddings.');
    return null;
  }
  const redis = new Redis(REDIS_URL);
  redis.on('error', (err) => logError('Redis error:', err.message));
  try {
    await redis.ping();
    logInfo(`Connected to Redis (${REDIS_URL}).`);
    return redis;
  } catch (err) {
    logError('Failed to connect to Redis:', err.message);
    return null;
  }
}

async function upsertPostgres(rows, vectorDim) {
  if (!DATABASE_URL) {
    logWarn('DATABASE_URL not provided; skipping Postgres upsert.');
    return;
  }
  if (!rows.length) {
    logInfo('No rows to upsert into Postgres.');
    return;
  }
  if (!vectorDim || Number.isNaN(vectorDim)) {
    logError('Vector dimension unknown; cannot create pgvector column.');
    return;
  }

  const client = new PostgresClient({ connectionString: DATABASE_URL });
  await client.connect();
  logInfo('Connected to Postgres.');

  try {
    await client.query('CREATE EXTENSION IF NOT EXISTS vector;');
    await client.query(`
      CREATE TABLE IF NOT EXISTS ${PG_TABLE} (
        doc_id TEXT NOT NULL,
        chunk_index INTEGER NOT NULL,
        source TEXT,
        title TEXT,
        lang TEXT,
        checksum TEXT,
        content TEXT,
        embedding vector(${vectorDim}),
        fetched_at TIMESTAMPTZ,
        metadata JSONB,
        PRIMARY KEY (doc_id, chunk_index)
      );
    `);

    const insertSql = `
      INSERT INTO ${PG_TABLE}
        (doc_id, chunk_index, source, title, lang, checksum, content, embedding, fetched_at, metadata)
      VALUES
        ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
      ON CONFLICT (doc_id, chunk_index)
      DO UPDATE SET
        title = EXCLUDED.title,
        lang = EXCLUDED.lang,
        checksum = EXCLUDED.checksum,
        content = EXCLUDED.content,
        embedding = EXCLUDED.embedding,
        fetched_at = EXCLUDED.fetched_at,
        metadata = EXCLUDED.metadata;
    `;

    for (const row of rows) {
      const embeddingLiteral = row.embedding
        ? `[${row.embedding.join(',')}]`
        : null;
      await client.query(insertSql, [
        row.docId,
        row.chunkIndex,
        row.source,
        row.title,
        row.lang,
        row.checksum,
        row.text,
        embeddingLiteral,
        row.fetchedAt,
        JSON.stringify(row.metadata ?? {}),
      ]);
    }

    logInfo(`Upserted ${rows.length} chunk rows into Postgres (${PG_TABLE}).`);
  } catch (err) {
    logError('Postgres upsert failed:', err.message);
  } finally {
    await client.end();
  }
}

async function upsertNeo4j(documents) {
  if (!NEO4J_URL) {
    logWarn('NEO4J_URL not provided; skipping Neo4j updates.');
    return;
  }
  if (!documents.length) {
    logInfo('No documents to upsert into Neo4j.');
    return;
  }

  const driver = neo4j.driver(NEO4J_URL, neo4j.auth.basic(NEO4J_USER, NEO4J_PASSWORD));
  const session = driver.session({ defaultAccessMode: neo4j.session.WRITE });

  try {
    await session.writeTransaction((tx) =>
      tx.run(
        `
        UNWIND $docs AS doc
          MERGE (d:Document {id: doc.docId})
            SET d.title = doc.title,
                d.lang = doc.lang,
                d.source = doc.source,
                d.checksum = doc.checksum,
                d.fetched_at = doc.fetchedAt

          WITH d, doc
          UNWIND doc.chunks AS chunk
            MERGE (c:Chunk {id: chunk.id})
              SET c.index = chunk.index,
                  c.text_preview = chunk.textPreview,
                  c.lang = doc.lang,
                  c.embeddingKey = chunk.embeddingKey,
                  c.tokens = chunk.tokensEstimate,
                  c.checksum = chunk.checksum
            MERGE (d)-[:HAS_CHUNK]->(c)

          WITH doc
          UNWIND doc.similarities AS rel
            MERGE (c1:Chunk {id: rel.fromId})
            MERGE (c2:Chunk {id: rel.toId})
            MERGE (c1)-[r:SIMILAR_TO]->(c2)
              SET r.score = rel.score,
                  r.last_updated = doc.fetchedAt
        `,
        { docs: documents },
      ),
    );
    logInfo(`Upserted ${documents.length} documents into Neo4j.`);
  } catch (err) {
    logError('Neo4j upsert failed:', err.message);
  } finally {
    await session.close();
    await driver.close();
  }
}

async function main() {
  if (!(await pathExists(MANIFEST_PATH))) {
    logWarn(`Manifest not found at ${MANIFEST_PATH}. Nothing to index.`);
    process.exit(0);
  }

  const manifest = await loadJson(MANIFEST_PATH);
  const docIds = Object.keys(manifest);
  if (!docIds.length) {
    logInfo('Manifest empty. Nothing to index.');
    process.exit(0);
  }

  const redis = await connectRedis();
  if (!redis) {
    logError('Redis unavailable; cannot proceed.');
    process.exit(1);
  }

  const postgresRows = [];
  const neo4jDocs = [];
  let vectorDim = null;

  for (const docId of docIds) {
    const manifestEntry = manifest[docId] || {};
    const cachePath = manifestEntry.cache_path
      ? path.resolve(manifestEntry.cache_path)
      : path.join(CACHE_DIR, `${docId}.json`);

    if (!(await pathExists(cachePath))) {
      logWarn(`Cache file missing for ${docId}: ${cachePath}`);
      continue;
    }

    let payload;
    try {
      payload = await loadJson(cachePath);
    } catch (err) {
      logWarn(`Failed to parse cache JSON for ${docId}: ${err.message}`);
      continue;
    }

    const chunks = Array.isArray(payload.chunks) ? payload.chunks : [];
    if (!chunks.length) {
      logWarn(`No chunks stored for ${docId}; skipping.`);
      continue;
    }

    const docMeta = {
      docId: payload.doc_id || docId,
      title: payload.title || manifestEntry.title || docId,
      lang: payload.lang || manifestEntry.lang || 'unknown',
      checksum: payload.checksum || manifestEntry.checksum || computeChecksum(chunks.map((c) => c.text || '').join('\n')),
      fetchedAt: payload.fetched_at || manifestEntry.fetched_at || new Date().toISOString(),
      source: payload.source || manifestEntry.source || 'unknown',
      metadata: payload.metadata || manifestEntry.metadata || {},
      chunks: [],
    };

    const chunkEmbeddings = [];

    for (const chunk of chunks) {
      const chunkIndex = chunk.index;
      const chunkText = chunk.text || '';
      const embeddingKey = `embedding:doc:${docMeta.docId}:chunk:${chunkIndex}`;
      let embedding = null;
      try {
        const raw = await redis.get(embeddingKey);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed?.vector)) {
            embedding = parsed.vector.map((v) => Number(v));
          } else if (Array.isArray(parsed)) {
            embedding = parsed.map((v) => Number(v));
          }
        }
      } catch (err) {
        logWarn(`Failed to load embedding ${embeddingKey}: ${err.message}`);
      }

      if (embedding && !vectorDim) {
        vectorDim = embedding.length;
      }

      const chunkRecord = {
        id: `${docMeta.docId}:${chunkIndex}`,
        index: chunkIndex,
        textPreview: chunkText.slice(0, CHUNK_TEXT_PREVIEW),
        tokensEstimate: chunk.tokens_estimate || chunk.tokensEstimate || chunkText.split(/\s+/).length,
        embeddingKey,
        embedding,
        checksum: computeChecksum(chunkText),
      };

      docMeta.chunks.push(chunkRecord);

      if (embedding) {
        postgresRows.push({
          docId: docMeta.docId,
          chunkIndex,
          source: docMeta.source,
          title: docMeta.title,
          lang: docMeta.lang,
          checksum: chunkRecord.checksum,
          text: chunkText,
          embedding,
          fetchedAt: docMeta.fetchedAt,
          metadata: docMeta.metadata,
        });
        chunkEmbeddings.push(chunkRecord);
      } else {
        logWarn(`Chunk ${chunkIndex} for ${docMeta.docId} missing embedding; skipping vector storage.`);
      }
    }

    let similarities = [];
    if (chunkEmbeddings.length) {
      const graphEdges = await callPhase47Graph(docMeta.docId, chunkEmbeddings);
      if (Array.isArray(graphEdges) && graphEdges.length) {
        similarities = graphEdges.map((edge) => ({
          fromId: edge.fromId,
          toId: edge.toId,
          score: Number(edge.score || 0),
        }));
      } else {
        similarities = buildSimilarityEdges(chunkEmbeddings, TOP_K_SIMILAR, SIMILARITY_THRESHOLD);
      }
    }
    docMeta.similarities = similarities;
    neo4jDocs.push(docMeta);
  }

  await upsertPostgres(postgresRows, vectorDim);
  await upsertNeo4j(neo4jDocs);

  await redis.quit();
  logInfo('Phase 46 indexing complete.');
}

main().catch((err) => {
  logError('Indexer crashed:', err);
  process.exit(1);
});
