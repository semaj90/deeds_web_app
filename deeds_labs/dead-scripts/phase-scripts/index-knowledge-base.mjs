#!/usr/bin/env node
/**
 * Enhanced Knowledge Base Indexer
 *
 * Indexes markdown/text files into Qdrant `knowledge_base` collection + Postgres.
 *
 * Features:
 * 1. Content-hash idempotency (deterministic point IDs, no duplicates on re-run)
 * 2. Token-based chunking with overlap (500 words / 75 word overlap)
 * 3. Configurable source directory via CLI arg
 * 4. Postgres dual storage (knowledge_base table)
 * 5. File-level skip detection (SHA-256 hash comparison)
 * 6. Frontmatter parsing (YAML --- blocks)
 * 7. Batch embedding via Ollama /api/embed
 * 8. BM42 sparse vectors for hybrid search (FNV-1a hashing, legal boost)
 *
 * Usage:
 *   node scripts/index-knowledge-base.mjs [source-directory]
 *   node scripts/index-knowledge-base.mjs ../memory
 *   node scripts/index-knowledge-base.mjs data/knowledge
 *
 * Environment:
 *   QDRANT_URL     (default: http://localhost:6333)
 *   OLLAMA_URL     (default: http://localhost:11434)
 *   DATABASE_URL   (default: postgresql://legal_admin:123456@127.0.0.1:5432/legal_ai_db)
 */

import fs from 'fs/promises';
import crypto from 'node:crypto';
import path from 'path';
import { fileURLToPath } from 'url';
import postgres from 'postgres';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.dirname(__dirname);

// ── Configuration ─────────────────────────────────────────────────────────────
const QDRANT_URL = process.env.QDRANT_URL || 'http://localhost:6333';
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://legal_admin:123456@127.0.0.1:5432/legal_ai_db';
const COLLECTION = 'knowledge_base';
const EXPECTED_DIMENSION = 768;
const CHUNK_WORDS = 500;
const CHUNK_OVERLAP = 75;
const MIN_CHUNK_WORDS = 50;
const BATCH_SIZE = 50;
const EMBED_CONCURRENCY = 5;

const sql = postgres(DATABASE_URL, { max: 3 });

// ── CLI argument: source directory ────────────────────────────────────────────
const cliDir = process.argv[2];
const KNOWLEDGE_DIR = cliDir
  ? path.resolve(cliDir)
  : path.join(rootDir, 'data', 'knowledge');

// ── Statistics ────────────────────────────────────────────────────────────────
const stats = {
  filesFound: 0,
  filesSkipped: 0,
  filesIndexed: 0,
  chunksCreated: 0,
  embeddingsOK: 0,
  embeddingsFailed: 0,
  qdrantUpsertsOK: 0,
  pgInserts: 0,
  sparseVectorsGenerated: 0,
};

// ── Deterministic point ID (same approach as index-lawpdfs-to-rag.ts) ─────────
function deterministicPointId(key) {
  const hash = crypto.createHash('md5').update(key).digest();
  return hash.readUInt32BE(0) % 2147483648; // positive int32
}

// ── SHA-256 file hash ─────────────────────────────────────────────────────────
function fileHash(content) {
  return crypto.createHash('sha256').update(content).digest('hex');
}

// ── BM42 Sparse Vector (matches bm42-sparse.ts + Go search service) ──────────
const BM42_STOP = new Set([
  'the','a','an','is','are','was','were','be','been','being','have','has','had',
  'do','does','did','will','would','could','should','may','might','shall','can',
  'to','of','in','for','on','with','at','by','from','as','into','about','between',
  'through','after','before','above','below','and','or','not','but','if','then',
  'than','so','no','nor','too','very','what','which','who','whom','this','that',
  'these','those','how','when','where','why','all','each','every','both','few',
  'more','most','other','some','such','only','own','same','just','also','any','it','its',
]);

function fnv1aHash(token) {
  let h = 0x811c9dc5;
  for (let i = 0; i < token.length; i++) {
    h ^= token.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) % 2_000_000;
}

function generateSparseVector(text) {
  const tokens = text.toLowerCase().replace(/[^\w\s§./-]/g, ' ')
    .split(/\s+/).filter(t => t.length > 1 && !BM42_STOP.has(t));
  if (tokens.length === 0) return { indices: [], values: [] };
  const tf = new Map();
  for (const token of tokens) {
    const idx = fnv1aHash(token);
    const isLegal = token.startsWith('§') || token.includes('u.s.c') || token.includes('cfr');
    const entry = tf.get(idx);
    if (entry) { entry.count++; if (isLegal) entry.isLegal = true; }
    else tf.set(idx, { count: 1, isLegal });
  }
  const indices = [], values = [];
  for (const [idx, { count, isLegal }] of tf) {
    indices.push(idx);
    values.push(Math.log(1 + count) * (isLegal ? 2.0 : 1.0));
  }
  const norm = Math.sqrt(values.reduce((s, v) => s + v * v, 0));
  if (norm > 0) for (let i = 0; i < values.length; i++) values[i] /= norm;
  return { indices, values };
}

// ── Frontmatter parser ────────────────────────────────────────────────────────
function parseFrontmatter(content) {
  const fmRegex = /^---\s*\n([\s\S]*?)\n---\s*\n/;
  const match = content.match(fmRegex);
  if (!match) return { meta: {}, body: content };

  const meta = {};
  const yamlLines = match[1].split('\n');
  for (const line of yamlLines) {
    const kv = line.match(/^(\w[\w-]*)\s*:\s*(.+)$/);
    if (kv) {
      const key = kv[1].trim();
      let val = kv[2].trim();
      // Parse inline arrays: [a, b, c]
      if (val.startsWith('[') && val.endsWith(']')) {
        val = val.slice(1, -1).split(',').map(s => s.trim().replace(/^["']|["']$/g, ''));
      }
      meta[key] = val;
    }
  }

  return { meta, body: content.slice(match[0].length) };
}

// ── Markdown section splitter ─────────────────────────────────────────────────
function splitByHeadings(body) {
  const sections = [];
  const lines = body.split('\n');
  let current = { heading: 'Introduction', text: '', level: 0 };

  for (const line of lines) {
    const headingMatch = line.match(/^(#{1,6})\s+(.+)/);
    if (headingMatch) {
      if (current.text.trim()) sections.push({ ...current });
      current = {
        heading: headingMatch[2].trim(),
        text: '',
        level: headingMatch[1].length,
      };
    } else {
      current.text += line + '\n';
    }
  }
  if (current.text.trim()) sections.push(current);
  return sections;
}

// ── Word-based chunking with overlap ──────────────────────────────────────────
function chunkSection(section) {
  const words = section.text.trim().split(/\s+/);
  if (words.length <= CHUNK_WORDS) {
    // Section fits in one chunk
    return words.length >= MIN_CHUNK_WORDS
      ? [{ ...section, text: section.text.trim() }]
      : [];
  }

  const chunks = [];
  let start = 0;
  while (start < words.length) {
    const end = Math.min(start + CHUNK_WORDS, words.length);
    const chunkWords = words.slice(start, end);
    if (chunkWords.length >= MIN_CHUNK_WORDS) {
      chunks.push({
        heading: section.heading,
        level: section.level,
        text: chunkWords.join(' '),
      });
    }
    start += CHUNK_WORDS - CHUNK_OVERLAP;
    if (end >= words.length) break;
  }
  return chunks;
}

// ── Batch Embedding via Ollama /api/embed ────────────────────────────────────
async function embedBatchTexts(texts) {
  const res = await fetch(`${OLLAMA_URL}/api/embed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'embeddinggemma:latest', input: texts }),
  });
  if (!res.ok) throw new Error(`Embed API ${res.status}: ${await res.text()}`);
  const data = await res.json();
  if (!data.embeddings || data.embeddings.length !== texts.length) {
    throw new Error(`Expected ${texts.length} embeddings, got ${data.embeddings?.length ?? 0}`);
  }
  for (const emb of data.embeddings) {
    if (emb.length !== EXPECTED_DIMENSION) throw new Error(`Bad dim: ${emb.length}`);
  }
  return data.embeddings;
}

// ── Parallel embedding with batch API + fallback ─────────────────────────────
async function embedBatch(chunks) {
  const results = [];
  for (let i = 0; i < chunks.length; i += EMBED_CONCURRENCY) {
    const batch = chunks.slice(i, i + EMBED_CONCURRENCY);
    try {
      const embeddings = await embedBatchTexts(batch.map(c => c.text.slice(0, 8000)));
      for (let j = 0; j < embeddings.length; j++) {
        results.push({ chunk: batch[j], embedding: embeddings[j] });
        stats.embeddingsOK++;
      }
    } catch {
      // Fallback: one-by-one
      for (const chunk of batch) {
        try {
          const [emb] = await embedBatchTexts([chunk.text.slice(0, 8000)]);
          results.push({ chunk, embedding: emb });
          stats.embeddingsOK++;
        } catch (e) {
          console.log(`    SKIP: ${chunk.heading.slice(0, 40)} — ${e.message}`);
          stats.embeddingsFailed++;
        }
      }
    }
  }
  return results;
}

// ── Qdrant batch upsert ──────────────────────────────────────────────────────
async function upsertQdrant(points) {
  if (points.length === 0) return;
  const res = await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points?wait=true`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ points }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Qdrant upsert failed (${res.status}): ${text}`);
  }
  stats.qdrantUpsertsOK += points.length;
}

// ── Postgres insert (matches knowledge-base-setup.mjs schema) ────────────────
async function insertPostgres(docName, chunkIdx, chunkId, content, sourceFile, metadata, embedding, wordCount) {
  try {
    await sql`
      INSERT INTO knowledge_base (doc_name, chunk_idx, chunk_id, content, source, source_file, metadata, chunk_type, file_hash, word_count, embedding)
      VALUES (
        ${docName},
        ${chunkIdx},
        ${chunkId},
        ${content},
        ${'local'},
        ${sourceFile},
        ${JSON.stringify(metadata)},
        ${'markdown'},
        ${metadata.file_hash || ''},
        ${wordCount},
        ${sql.unsafe(`'[${embedding.join(',')}]'::vector`)}
      )
      ON CONFLICT (chunk_id) DO UPDATE SET
        content = EXCLUDED.content,
        metadata = EXCLUDED.metadata::jsonb,
        word_count = EXCLUDED.word_count,
        updated_at = CURRENT_TIMESTAMP
    `;
    stats.pgInserts++;
  } catch (e) {
    if (!e.message.includes('duplicate')) {
      console.log(`    PG warning: ${e.message.slice(0, 80)}`);
    }
  }
}

// ── Ensure collection exists with BM42 sparse vectors ────────────────────────
async function ensureCollection() {
  const res = await fetch(`${QDRANT_URL}/collections/${COLLECTION}`);
  if (res.ok) {
    const data = await res.json();
    const dim = data.result.config.params.vectors.size;
    console.log(`Collection '${COLLECTION}': ${data.result.points_count} points, ${dim} dims`);
    if (dim !== EXPECTED_DIMENSION) {
      throw new Error(`Dimension mismatch: expected ${EXPECTED_DIMENSION}, got ${dim}`);
    }
    // Ensure sparse vectors are configured
    try {
      await fetch(`${QDRANT_URL}/collections/${COLLECTION}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sparse_vectors: { bm25: {} } }),
      });
    } catch { /* already configured */ }
    return;
  }

  // Create collection with dense + BM42 sparse
  console.log(`Creating collection '${COLLECTION}' (${EXPECTED_DIMENSION} dims, Cosine + BM42)...`);
  const createRes = await fetch(`${QDRANT_URL}/collections/${COLLECTION}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      vectors: { size: EXPECTED_DIMENSION, distance: 'Cosine' },
      sparse_vectors: { bm25: {} },
      quantization_config: { scalar: { type: 'int8', always_ram: true } },
    }),
  });
  if (!createRes.ok) throw new Error(`Create failed: ${await createRes.text()}`);
  console.log('Collection created (dense + BM42 sparse)');
}

// ── Check if file already indexed with same hash ─────────────────────────────
async function isFileUnchanged(relPath, hash) {
  try {
    const res = await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points/scroll`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        filter: {
          must: [
            { key: 'filePath', match: { value: relPath } },
            { key: 'file_hash', match: { value: hash } },
          ],
        },
        limit: 1,
        with_payload: false,
        with_vector: false,
      }),
    });
    if (!res.ok) return false;
    const data = await res.json();
    return data.result.points.length > 0;
  } catch {
    return false;
  }
}

// ── Delete old points for a file (before re-indexing) ────────────────────────
async function deleteFilePoints(relPath) {
  try {
    await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points/delete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        filter: { must: [{ key: 'filePath', match: { value: relPath } }] },
      }),
    });
  } catch { /* ignore */ }
}

// ── Recursively find files ────────────────────────────────────────────────────
async function findFiles(dir, exts = ['.md', '.txt', '.markdown']) {
  const results = [];
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return results;
  }
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...await findFiles(fullPath, exts));
    } else if (exts.some(ext => entry.name.toLowerCase().endsWith(ext))) {
      results.push(fullPath);
    }
  }
  return results;
}

// ── Index a single file ──────────────────────────────────────────────────────
async function indexFile(filePath) {
  const content = await fs.readFile(filePath, 'utf-8');
  const relPath = path.relative(rootDir, filePath).replace(/\\/g, '/');
  const fileName = path.basename(filePath, path.extname(filePath));
  const hash = fileHash(content);
  const docId = crypto.randomUUID();

  // Skip if file hash unchanged
  if (await isFileUnchanged(relPath, hash)) {
    console.log(`  SKIP (unchanged): ${relPath}`);
    stats.filesSkipped++;
    return;
  }

  // Delete old points for this file before re-indexing
  await deleteFilePoints(relPath);

  // Parse frontmatter + split by headings
  const { meta, body } = parseFrontmatter(content);
  const title = meta.title || fileName;
  const tags = Array.isArray(meta.tags) ? meta.tags : [];
  const category = meta.category || '';

  // Also extract inline #tags from content
  const inlineTags = (body.match(/#[a-zA-Z]\w+/g) || [])
    .map(t => t.toLowerCase())
    .filter((t, i, a) => a.indexOf(t) === i);
  const allTags = [...new Set([...tags, ...inlineTags])];

  const sections = splitByHeadings(body);

  // Chunk all sections
  const allChunks = [];
  for (const section of sections) {
    const chunks = chunkSection(section);
    allChunks.push(...chunks);
  }

  if (allChunks.length === 0) {
    console.log(`  SKIP (too short): ${relPath}`);
    stats.filesSkipped++;
    return;
  }

  console.log(`  Indexing: ${relPath} — ${allChunks.length} chunks`);
  stats.chunksCreated += allChunks.length;

  // Embed all chunks (with batch API)
  const embedded = await embedBatch(allChunks);

  // Build Qdrant points with dense + BM42 sparse vectors
  const points = [];
  for (let i = 0; i < embedded.length; i++) {
    const { chunk, embedding } = embedded[i];
    const pointKey = `kb:${relPath}:${i}`;
    const chunkId = `kb-${hash.slice(0, 12)}-${i}`;
    const wordCount = chunk.text.split(/\s+/).length;

    // Generate BM42 sparse vector for hybrid search
    const sparse = generateSparseVector(chunk.text);
    stats.sparseVectorsGenerated++;

    points.push({
      id: deterministicPointId(pointKey),
      vector: {
        '': embedding,           // unnamed = dense vector
        'bm25': sparse,          // named sparse vector
      },
      payload: {
        doc_id: docId,
        file: fileName,
        section: chunk.heading,
        content: chunk.text.slice(0, 2000),
        text: chunk.text.slice(0, 500),  // for BM42 backfill queries
        level: chunk.level,
        tags: allTags,
        source: 'local',
        filePath: relPath,
        file_hash: hash,
        chunk_index: i,
        word_count: wordCount,
        title,
        category,
      },
    });

    // Postgres dual storage
    await insertPostgres(title, i, chunkId, chunk.text, relPath, {
      doc_id: docId,
      section: chunk.heading,
      level: chunk.level,
      tags: allTags,
      title,
      file_hash: hash,
    }, embedding, wordCount);
  }

  // Batch upsert to Qdrant
  for (let i = 0; i < points.length; i += BATCH_SIZE) {
    const batch = points.slice(i, i + BATCH_SIZE);
    await upsertQdrant(batch);
  }

  stats.filesIndexed++;
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log('=== Knowledge Base Indexer (Enhanced + BM42) ===\n');
  console.log(`Source:     ${KNOWLEDGE_DIR}`);
  console.log(`Collection: ${COLLECTION}`);
  console.log(`Chunking:  ${CHUNK_WORDS} words / ${CHUNK_OVERLAP} overlap / ${MIN_CHUNK_WORDS} min`);
  console.log(`Embedding: embeddinggemma:latest (${EXPECTED_DIMENSION} dims)`);
  console.log(`Sparse:    BM42 (FNV-1a, legal boost, L2-normalized)`);
  console.log(`Batch:     /api/embed x${EMBED_CONCURRENCY} concurrent\n`);

  // Ensure collection exists
  await ensureCollection();

  // Find all files
  const files = await findFiles(KNOWLEDGE_DIR);
  stats.filesFound = files.length;

  if (files.length === 0) {
    console.log(`No .md/.txt files found in ${KNOWLEDGE_DIR}`);
    await sql.end();
    return;
  }

  console.log(`Found ${files.length} files\n`);

  // Index each file
  for (const filePath of files.sort()) {
    try {
      await indexFile(filePath);
    } catch (err) {
      console.error(`  ERROR: ${path.basename(filePath)} — ${err.message}`);
    }
  }

  // Summary
  console.log('\n' + '='.repeat(50));
  console.log('SUMMARY');
  console.log('='.repeat(50));
  console.log(`Files found:       ${stats.filesFound}`);
  console.log(`Files indexed:     ${stats.filesIndexed}`);
  console.log(`Files skipped:     ${stats.filesSkipped}`);
  console.log(`Chunks created:    ${stats.chunksCreated}`);
  console.log(`Embeddings OK:     ${stats.embeddingsOK}`);
  console.log(`Embeddings failed: ${stats.embeddingsFailed}`);
  console.log(`Sparse vectors:    ${stats.sparseVectorsGenerated}`);
  console.log(`Qdrant upserts:    ${stats.qdrantUpsertsOK}`);
  console.log(`Postgres inserts:  ${stats.pgInserts}`);

  // Final collection status
  try {
    const res = await fetch(`${QDRANT_URL}/collections/${COLLECTION}`);
    if (res.ok) {
      const data = await res.json();
      console.log(`\nCollection '${COLLECTION}': ${data.result.points_count} total points`);
    }
  } catch { /* ignore */ }

  await sql.end();
}

main().catch(err => {
  console.error('Fatal:', err);
  sql.end().then(() => process.exit(1));
});