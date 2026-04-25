import { QdrantClient } from '@qdrant/js-client-rest';
import crypto from 'crypto';
import 'dotenv/config';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const KNOWLEDGE_DIR = path.join(__dirname, '../knowledge');
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const OLLAMA_EMBED_MODEL = process.env.OLLAMA_EMBED_MODEL || 'embeddinggemma:latest';
const EMBED_DIM = Number(process.env.EMBED_DIM || 768);
const QDRANT_URL = process.env.QDRANT_URL || 'http://localhost:6333';
const COLLECTION_NAME = process.env.QDRANT_COLLECTION || 'knowledge_base';
const CHECKPOINT_DIR = process.env.CHECKPOINT_DIR || path.join(__dirname, '../data/phase76/checkpoints');
const CHECKPOINT_PATH = path.join(CHECKPOINT_DIR, 'index-knowledge-base.checkpoint.json');

if (!Number.isFinite(EMBED_DIM) || EMBED_DIM <= 0) throw new Error('Bad EMBED_DIM');

const qdrant = new QdrantClient({ url: QDRANT_URL });

// Stats tracking
const stats = {
  files_total: 0,
  sections_parsed: 0,
  emb_ok: 0,
  emb_fail: 0,
  upsert_ok: 0,
  upsert_fail: 0
};

console.log('🔧 Configuration:');
console.log(`   OLLAMA_URL: ${OLLAMA_URL}`);
console.log(`   EMBED_MODEL: ${OLLAMA_EMBED_MODEL}`);
console.log(`   EMBED_DIM: ${EMBED_DIM}`);
console.log(`   QDRANT_URL: ${QDRANT_URL}`);
console.log(`   COLLECTION: ${COLLECTION_NAME}`);
console.log(`   CHECKPOINT: ${CHECKPOINT_PATH}`);

async function saveCheckpoint(lastFile, lastSection) {
  try {
    await fs.mkdir(path.dirname(CHECKPOINT_PATH), { recursive: true });
    await fs.writeFile(CHECKPOINT_PATH, JSON.stringify({
      collection: COLLECTION_NAME,
      embed_model: OLLAMA_EMBED_MODEL,
      embed_dim: EMBED_DIM,
      lastFile,
      lastSection,
      stats,
      timestamp: new Date().toISOString()
    }, null, 2));
  } catch (e) {
    console.warn('⚠️ Failed to save checkpoint:', e.message);
  }
}

async function generateEmbedding(text) {
  try {
    const response = await fetch(`${OLLAMA_URL}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: OLLAMA_EMBED_MODEL,
        prompt: text
      })
    });
    if (!response.ok) {
      console.error(`❌ Embedding API Error: ${response.status} ${response.statusText}`);
      stats.emb_fail++;
      return null;
    }
    const data = await response.json();
    stats.emb_ok++;
    return data.embedding;
  } catch (e) {
    console.error('⚠️ Embedding failed:', e.message);
    stats.emb_fail++;
    return null;
  }
}

function parseFrontmatter(content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  if (!match) return { metadata: {}, body: content };

  const frontmatterRaw = match[1];
  const body = content.slice(match[0].length);
  const metadata = {};

  frontmatterRaw.split(/\r?\n/).forEach(line => {
    const [key, ...valueParts] = line.split(':');
    if (!key || !valueParts.length) return;

    const valueStr = valueParts.join(':').trim();
    let value;

    if (valueStr.startsWith('[') && valueStr.endsWith(']')) {
      try {
        value = JSON.parse(valueStr);
      } catch (e) {
        value = valueStr;
      }
    } else {
      value = valueStr.replace(/^"|"$/g, '');
    }

    metadata[key.trim()] = value;
  });

  return { metadata, body };
}async function ingestFile(filePath) {
  const rawContent = await fs.readFile(filePath, 'utf-8');
  const { metadata, body: content } = parseFrontmatter(rawContent);
  const filename = path.basename(filePath);
  console.log(`Processing ${filename}...`);
  stats.files_total++;

  // Split by headers
  const sections = content.split(/^## /gm);

  for (const section of sections) {
    if (!section.trim()) continue;
    stats.sections_parsed++;

    const lines = section.split('\n');
    const title = lines[0].trim();
    const body = lines.slice(1).join('\n').trim();

    if (!body) continue;

    const embedding = await generateEmbedding(body);
    if (!embedding) continue;

    const contentHash = crypto.createHash('md5').update(body).digest('hex');
    const docId = filename.replace(/\.[^/.]+$/, "").toLowerCase().replace(/\s+/g, '-');

    // Deterministic ID: sha256(doc_id + section + chunk_index + hash) -> uuid-like
    const idRaw = `${docId}|${title}|${stats.sections_parsed}|${contentHash}`;
    const idHash = crypto.createHash('sha256').update(idRaw).digest('hex');
    // Format as UUID (8-4-4-4-12)
    const deterministicId = `${idHash.slice(0,8)}-${idHash.slice(8,12)}-${idHash.slice(12,16)}-${idHash.slice(16,20)}-${idHash.slice(20,32)}`;

    const point = {
      id: deterministicId,
      vector: embedding,
      payload: {
        doc_id: docId,
        source: 'local',
        title: title,
        section: title,
        chunk_index: stats.sections_parsed,
        path: filePath,
        lang: 'md',
        tags: metadata.tags || ['manual', 'knowledge'],
        symbols: metadata.symbols || [],
        route_kind: metadata.route_kind || [],
        http_methods: metadata.http_methods || [],
        risk: metadata.risk || [],
        deps: [],
        hash: contentHash,
        content: body,
        file: filename,
        timestamp: new Date().toISOString(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }
    };

    try {
      const res = await qdrant.upsert(COLLECTION_NAME, {
        wait: true,
        points: [point]
      });
      stats.upsert_ok++;
      console.log(`  ✅ Ingested section: ${title}`);
      await saveCheckpoint(filename, title);
    } catch (e) {
      // Log detailed Qdrant error body if available
      const errorBody = e.response?.data || e.message;
      console.error(`❌ Upsert failed for ${title}:`, errorBody);
      stats.upsert_fail++;
    }
  }
}async function getFilesRecursively(dir) {
  let results = [];
  const list = await fs.readdir(dir, { withFileTypes: true });
  for (const file of list) {
    const filePath = path.join(dir, file.name);
    if (file.isDirectory()) {
      results = results.concat(await getFilesRecursively(filePath));
    } else if (file.name.endsWith('.md')) {
      results.push(filePath);
    }
  }
  return results;
}

async function main() {
  try {
    const files = await getFilesRecursively(KNOWLEDGE_DIR);
    for (const filePath of files) {
      await ingestFile(filePath);
    }
    console.log('🎉 Ingestion complete!');
  } catch (e) {
    console.error('❌ Error:', e);
  }
}

main();
