#!/usr/bin/env npx tsx
/**
 * Codebase Semantic Indexer — Qdrant + Ollama + Redis
 *
 * Indexes the entire codebase into Qdrant `codebase_chunks_768` with:
 * - embeddinggemma:latest for 768-dim vectors
 * - gemma4-legal:latest for agentic tag extraction (function purpose, domain, complexity)
 * - Redis bifrost cache for deduplication (SHA-256 content hashing)
 * - Concurrent parallelism (configurable worker count)
 * - RTX GPU acceleration via Ollama GPU layers
 *
 * Usage:
 *   npx tsx scripts/codebase-semantic-indexer.ts                    # full index
 *   npx tsx scripts/codebase-semantic-indexer.ts --dry-run          # preview only
 *   npx tsx scripts/codebase-semantic-indexer.ts --dir src/lib/server  # specific dir
 *   npx tsx scripts/codebase-semantic-indexer.ts --concurrency 8    # parallel workers
 *   npx tsx scripts/codebase-semantic-indexer.ts --tags-only        # re-tag existing points
 *   npx tsx scripts/codebase-semantic-indexer.ts --query "auth middleware"  # search after index
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'fs';
import { join, relative, extname, basename } from 'path';
import { createHash } from 'crypto';
import { config as loadEnv } from 'dotenv';
import { resolve } from 'path';

// Load env
for (const envFile of ['.env', '.env.local', '.env.development', '.env.development.local']) {
  const envPath = resolve(process.cwd(), envFile);
  if (existsSync(envPath)) loadEnv({ path: envPath, override: false });
}

// ─── Config ──────────────────────────────────────────────────────────────────
const OLLAMA_URL = process.env.OLLAMA_BASE_URL ?? 'http://127.0.0.1:11434';
const QDRANT_URL = process.env.QDRANT_URL ?? 'http://127.0.0.1:6333';
const REDIS_URL = process.env.REDIS_URL ?? 'redis://127.0.0.1:6379';
const EMBEDDING_MODEL = process.env.OLLAMA_EMBED_MODEL ?? 'embeddinggemma:latest';
const TAG_MODEL = process.env.OLLAMA_MODEL ?? 'gemma4-legal:latest';
const COLLECTION = 'codebase_chunks_768';
const VECTOR_DIM = 768;

// ─── CLI Args ────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const tagsOnly = args.includes('--tags-only');
const dirIdx = args.indexOf('--dir');
const targetDir = dirIdx >= 0 ? args[dirIdx + 1] : 'src';
const concIdx = args.indexOf('--concurrency');
const concurrency = concIdx >= 0 ? parseInt(args[concIdx + 1]) : 4;
const queryIdx = args.indexOf('--query');
const searchQuery = queryIdx >= 0 ? args[queryIdx + 1] : null;

// ─── File Extensions ─────────────────────────────────────────────────────────
const CODE_EXTENSIONS = new Set([
  '.ts', '.svelte', '.js', '.mjs', '.mts', '.json', '.css',
  '.go', '.py', '.sql', '.proto', '.wgsl', '.md',
]);
const IGNORE_PATTERNS = [
  'node_modules', '.svelte-kit', 'build', 'dist', '.git',
  'deeds_labs', 'phase104-backups', 'scripts/tests/screenshots',
];
const MAX_FILE_SIZE = 100_000; // 100KB max per file
const CHUNK_SIZE = 800;
const CHUNK_OVERLAP = 100;

// ─── Types ───────────────────────────────────────────────────────────────────
interface CodeChunk {
  id: string;
  filePath: string;
  fileName: string;
  extension: string;
  chunkIndex: number;
  totalChunks: number;
  content: string;
  contentHash: string;
  tags?: string[];
  purpose?: string;
  domain?: string;
  complexity?: 'low' | 'medium' | 'high';
}

interface IndexStats {
  filesScanned: number;
  chunksCreated: number;
  chunksSkipped: number; // already in Redis cache
  chunksIndexed: number;
  chunksTagged: number;
  errors: number;
  startTime: number;
}

// ─── Redis Cache ─────────────────────────────────────────────────────────────
let redis: any = null;

async function initRedis(): Promise<void> {
  try {
    const { default: Redis } = await import('ioredis');
    redis = new Redis(REDIS_URL, { maxRetriesPerRequest: 2, lazyConnect: true });
    await redis.connect();
    console.log('  ✓ Redis bifrost cache connected');
  } catch {
    console.log('  ⚠ Redis unavailable — indexing without dedup cache');
    redis = null;
  }
}

async function isHashCached(hash: string): Promise<boolean> {
  if (!redis) return false;
  try {
    return (await redis.exists(`idx:${hash}`)) === 1;
  } catch { return false; }
}

async function cacheHash(hash: string, pointId: string): Promise<void> {
  if (!redis) return;
  try {
    await redis.set(`idx:${hash}`, pointId, 'EX', 86400 * 30); // 30 day TTL
  } catch {}
}

async function getCacheStats(): Promise<{ keys: number; memoryUsed: string }> {
  if (!redis) return { keys: 0, memoryUsed: '0B' };
  try {
    const info = await redis.info('memory');
    const match = info.match(/used_memory_human:(\S+)/);
    const keys = await redis.dbsize();
    return { keys, memoryUsed: match?.[1] ?? '?' };
  } catch { return { keys: 0, memoryUsed: '?' }; }
}

// ─── Qdrant ──────────────────────────────────────────────────────────────────
async function ensureCollection(): Promise<void> {
  const res = await fetch(`${QDRANT_URL}/collections/${COLLECTION}`);
  if (res.ok) {
    const data = await res.json();
    const points = data.result?.points_count ?? 0;
    console.log(`  ✓ Qdrant collection '${COLLECTION}' exists (${points} points)`);
    return;
  }
  // Create collection
  const createRes = await fetch(`${QDRANT_URL}/collections/${COLLECTION}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      vectors: { size: VECTOR_DIM, distance: 'Cosine' },
      optimizers_config: { indexing_threshold: 20000 },
      quantization_config: { scalar: { type: 'int8', always_ram: true } },
    }),
  });
  if (!createRes.ok) throw new Error(`Failed to create collection: ${await createRes.text()}`);
  console.log(`  ✓ Created Qdrant collection '${COLLECTION}'`);
}

async function upsertPoints(points: Array<{ id: string; vector: number[]; payload: Record<string, any> }>): Promise<void> {
  if (points.length === 0) return;
  const res = await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points?wait=true`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ points }),
  });
  if (!res.ok) throw new Error(`Qdrant upsert failed: ${await res.text()}`);
}

async function searchQdrant(query: string, limit = 10): Promise<any[]> {
  const embedding = await embed(query);
  const res = await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      vector: { name: 'content', vector: embedding },
      limit,
      with_payload: true,
    }),
  });
  if (!res.ok) throw new Error(`Search failed: ${await res.text()}`);
  const data = await res.json();
  return data.result ?? [];
}

// ─── Ollama Embedding ────────────────────────────────────────────────────────
async function embed(text: string): Promise<number[]> {
  const res = await fetch(`${OLLAMA_URL}/api/embed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: EMBEDDING_MODEL, input: text }),
  });
  if (!res.ok) throw new Error(`Embedding failed: ${res.status}`);
  const data = await res.json();
  const vec = data.embeddings?.[0] ?? data.embedding;
  if (!vec || vec.length !== VECTOR_DIM) {
    throw new Error(`Expected ${VECTOR_DIM}-dim embedding, got ${vec?.length ?? 0}`);
  }
  return vec;
}

// ─── Ollama Agentic Tagging via Gemma4 ───────────────────────────────────────
async function tagChunk(chunk: CodeChunk): Promise<{ tags: string[]; purpose: string; domain: string; complexity: string }> {
  const prompt = `Analyze this code chunk and return a JSON object with exactly these fields:
- "tags": array of 3-7 semantic tags (e.g., ["auth", "middleware", "session", "cookie"])
- "purpose": one-line description of what this code does (max 80 chars)
- "domain": one of: "auth", "database", "api", "ui", "ai-ml", "cache", "queue", "config", "test", "build", "gpu", "vector-search", "evidence", "legal", "chat", "admin", "utility"
- "complexity": one of: "low", "medium", "high"

File: ${chunk.filePath} (chunk ${chunk.chunkIndex + 1}/${chunk.totalChunks})

\`\`\`${chunk.extension.replace('.', '')}
${chunk.content.slice(0, 1500)}
\`\`\`

Return ONLY valid JSON, no explanation.`;

  try {
    const res = await fetch(`${OLLAMA_URL}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: TAG_MODEL,
        prompt,
        stream: false,
        options: { temperature: 0.1, num_predict: 300 },
      }),
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) return { tags: [], purpose: '', domain: 'utility', complexity: 'medium' };

    const data = await res.json();
    const text = data.response?.trim() ?? '';

    // Extract JSON from response (handle markdown code blocks)
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return { tags: [], purpose: '', domain: 'utility', complexity: 'medium' };

    const parsed = JSON.parse(jsonMatch[0]);
    return {
      tags: Array.isArray(parsed.tags) ? parsed.tags.slice(0, 10).map((t: any) => String(t).toLowerCase()) : [],
      purpose: String(parsed.purpose ?? '').slice(0, 120),
      domain: String(parsed.domain ?? 'utility'),
      complexity: String(parsed.complexity ?? 'medium'),
    };
  } catch {
    return { tags: [], purpose: '', domain: 'utility', complexity: 'medium' };
  }
}

// ─── File Discovery ──────────────────────────────────────────────────────────
function discoverFiles(dir: string): string[] {
  const files: string[] = [];

  function walk(d: string) {
    let entries: string[];
    try { entries = readdirSync(d); } catch { return; }

    for (const entry of entries) {
      const fullPath = join(d, entry);
      if (IGNORE_PATTERNS.some(p => fullPath.includes(p))) continue;

      let stat;
      try { stat = statSync(fullPath); } catch { continue; }

      if (stat.isDirectory()) {
        walk(fullPath);
      } else if (stat.isFile() && CODE_EXTENSIONS.has(extname(entry).toLowerCase())) {
        if (stat.size <= MAX_FILE_SIZE) files.push(fullPath);
      }
    }
  }

  walk(dir);
  return files;
}

// ─── Chunking ────────────────────────────────────────────────────────────────
function chunkFile(filePath: string, content: string): CodeChunk[] {
  const lines = content.split('\n');
  const chunks: CodeChunk[] = [];
  const ext = extname(filePath);
  const fileName = basename(filePath);
  const relPath = relative(process.cwd(), filePath).replace(/\\/g, '/');

  // Split by lines, respecting chunk size
  let currentChunk: string[] = [];
  let currentLen = 0;
  let chunkIdx = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (currentLen + line.length > CHUNK_SIZE && currentChunk.length > 0) {
      const text = currentChunk.join('\n');
      const hash = createHash('sha256').update(text).digest('hex').slice(0, 16);
      const id = createHash('sha256').update(`${relPath}:${chunkIdx}`).digest('hex').slice(0, 32);

      chunks.push({
        id,
        filePath: relPath,
        fileName,
        extension: ext,
        chunkIndex: chunkIdx,
        totalChunks: 0, // filled later
        content: text,
        contentHash: hash,
      });

      // Overlap: keep last few lines
      const overlapLines = Math.max(2, Math.floor(CHUNK_OVERLAP / 40));
      currentChunk = currentChunk.slice(-overlapLines);
      currentLen = currentChunk.join('\n').length;
      chunkIdx++;
    }
    currentChunk.push(line);
    currentLen += line.length + 1;
  }

  // Remaining content
  if (currentChunk.length > 0) {
    const text = currentChunk.join('\n');
    if (text.trim().length > 20) {
      const hash = createHash('sha256').update(text).digest('hex').slice(0, 16);
      const id = createHash('sha256').update(`${relPath}:${chunkIdx}`).digest('hex').slice(0, 32);
      chunks.push({ id, filePath: relPath, fileName, extension: ext, chunkIndex: chunkIdx, totalChunks: 0, content: text, contentHash: hash });
    }
  }

  // Fill totalChunks
  for (const c of chunks) c.totalChunks = chunks.length;
  return chunks;
}

// ─── Concurrent Worker Pool ──────────────────────────────────────────────────
async function processChunkBatch(
  chunks: CodeChunk[],
  stats: IndexStats,
  enableTags: boolean,
): Promise<void> {
  // Process in concurrent batches
  for (let i = 0; i < chunks.length; i += concurrency) {
    const batch = chunks.slice(i, i + concurrency);

    const results = await Promise.allSettled(
      batch.map(async (chunk) => {
        // Check Redis cache
        if (!dryRun && await isHashCached(chunk.contentHash)) {
          stats.chunksSkipped++;
          return null;
        }

        // In dry-run: skip embedding + tagging entirely — just count
        if (dryRun) {
          stats.chunksIndexed++;
          return null;
        }

        // Embed
        const vector = await embed(`${chunk.filePath}\n${chunk.content}`);

        // Tag with Gemma4 (optional — can be slow)
        let tagResult = { tags: [] as string[], purpose: '', domain: 'utility', complexity: 'medium' };
        if (enableTags) {
          tagResult = await tagChunk(chunk);
          stats.chunksTagged++;
        }

        // Build point — collection uses named vectors: content + signature
        const point = {
          id: chunk.id,
          vector: { content: vector, signature: vector },
          payload: {
            file_path: chunk.filePath,
            file_name: chunk.fileName,
            extension: chunk.extension,
            chunk_index: chunk.chunkIndex,
            total_chunks: chunk.totalChunks,
            content: chunk.content,
            content_hash: chunk.contentHash,
            tags: tagResult.tags,
            purpose: tagResult.purpose,
            domain: tagResult.domain,
            complexity: tagResult.complexity,
            indexed_at: new Date().toISOString(),
          },
        };

        return point;
      })
    );

    // Collect successful points
    const points: any[] = [];
    for (const r of results) {
      if (r.status === 'fulfilled' && r.value) {
        points.push(r.value);
      } else if (r.status === 'rejected') {
        stats.errors++;
      }
    }

    // Batch upsert to Qdrant
    if (points.length > 0 && !dryRun) {
      await upsertPoints(points);
      // Cache hashes in Redis
      for (const p of points) {
        await cacheHash(p.payload.content_hash, p.id);
      }
    }
    stats.chunksIndexed += points.length;

    // Progress
    const pct = Math.round(((i + batch.length) / chunks.length) * 100);
    process.stdout.write(`\r  Progress: ${pct}% (${stats.chunksIndexed} indexed, ${stats.chunksSkipped} cached, ${stats.errors} errors)`);
  }
  console.log(''); // newline after progress
}

// ─── Search Mode ─────────────────────────────────────────────────────────────
async function runSearch(query: string): Promise<void> {
  console.log(`\n  🔍 Searching: "${query}"\n`);
  const results = await searchQdrant(query, 10);

  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    const score = (r.score * 100).toFixed(1);
    const p = r.payload;
    console.log(`  ${i + 1}. [${score}%] ${p.file_path}:${p.chunk_index}`);
    if (p.purpose) console.log(`     Purpose: ${p.purpose}`);
    if (p.tags?.length) console.log(`     Tags: ${p.tags.join(', ')}`);
    if (p.domain) console.log(`     Domain: ${p.domain} | Complexity: ${p.complexity}`);
    console.log(`     ${p.content?.slice(0, 120).replace(/\n/g, ' ')}...`);
    console.log('');
  }
}

// ─── Main ────────────────────────────────────────────────────────────────────
async function main() {
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║  Codebase Semantic Indexer                                   ║');
  console.log('║  Ollama embeddinggemma + Gemma4 tags + Qdrant + Redis        ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  if (dryRun) console.log('  ⚡ DRY RUN — no writes to Qdrant or Redis\n');

  // Search mode
  if (searchQuery) {
    await runSearch(searchQuery);
    return;
  }

  // Init services (skip in dry-run — no network calls needed)
  if (!dryRun) {
    await initRedis();
    await ensureCollection();
  }

  // Discover files
  const baseDir = resolve(process.cwd(), targetDir);
  console.log(`  📁 Scanning: ${relative(process.cwd(), baseDir) || targetDir}`);
  const files = discoverFiles(baseDir);
  console.log(`  📄 Found ${files.length} indexable files`);

  // Chunk all files
  const allChunks: CodeChunk[] = [];
  for (const f of files) {
    try {
      const content = readFileSync(f, 'utf-8');
      const chunks = chunkFile(f, content);
      allChunks.push(...chunks);
    } catch {}
  }
  console.log(`  🧩 ${allChunks.length} chunks created from ${files.length} files`);

  const stats: IndexStats = {
    filesScanned: files.length,
    chunksCreated: allChunks.length,
    chunksSkipped: 0,
    chunksIndexed: 0,
    chunksTagged: 0,
    errors: 0,
    startTime: Date.now(),
  };

  // Enable tagging only when explicitly requested (it's slow per-chunk)
  const enableTags = args.includes('--tags') || tagsOnly;
  if (enableTags) {
    console.log(`  🏷️  Gemma4 agentic tagging ENABLED (${TAG_MODEL})`);
  } else {
    console.log('  🏷️  Tagging disabled (use --tags to enable Gemma4 classification)');
  }

  console.log(`  ⚡ Concurrency: ${concurrency} parallel workers\n`);

  // Process
  await processChunkBatch(allChunks, stats, enableTags);

  // Summary
  const elapsed = ((Date.now() - stats.startTime) / 1000).toFixed(1);
  const cacheInfo = dryRun ? { keys: 0, memoryUsed: 'n/a' } : await getCacheStats();

  console.log('\n  ╔════════════════════════════════════════╗');
  console.log('  ║  INDEX SUMMARY                         ║');
  console.log('  ╚════════════════════════════════════════╝');
  console.log(`  Files scanned:  ${stats.filesScanned}`);
  console.log(`  Chunks created: ${stats.chunksCreated}`);
  console.log(`  Chunks indexed: ${stats.chunksIndexed}`);
  console.log(`  Chunks cached:  ${stats.chunksSkipped} (skipped — already indexed)`);
  console.log(`  Chunks tagged:  ${stats.chunksTagged}`);
  console.log(`  Errors:         ${stats.errors}`);
  console.log(`  Duration:       ${elapsed}s`);
  console.log(`  Redis keys:     ${cacheInfo.keys} (${cacheInfo.memoryUsed})`);
  console.log('');

  if (redis) await redis.quit();
}

main().catch((err) => {
  console.error('\n  ✗ Fatal error:', err.message);
  process.exit(1);
});
