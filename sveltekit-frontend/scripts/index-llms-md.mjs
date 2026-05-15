#!/usr/bin/env node
/**
 * index-llms-md.mjs
 *
 * Crawls every LLMS.md in the repo, parses a structured envelope, upserts
 * to agent_context_files + directory_context_bindings (Postgres), and writes
 * llms:dir:<relDir> / llms:root Redis keys.
 */

import { createHash }                                from 'node:crypto';
import { readFileSync, existsSync, readdirSync }     from 'node:fs';
import { resolve, relative, dirname, join }          from 'node:path';
import { fileURLToPath }                             from 'node:url';
import pg                                            from 'pg';
import dotenv                                        from 'dotenv';

dotenv.config();

const __dirname  = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT  = resolve(__dirname, '..');

const DRY_RUN    = process.argv.includes('--dry-run');
const REDIS_ONLY = process.argv.includes('--redis-only');
const VERBOSE    = process.argv.includes('--verbose');

const REDIS_URL  = process.env.REDIS_URL ?? 'redis://127.0.0.1:6379';
const DB_URL     = process.env.DATABASE_URL ?? 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';
const REDIS_TTL  = 86_400;

const SCHEMA_VERSION = 1;

function parseLLMSMd(body, filePath) {
  const lines = body.split(/\r?\n/);
  const h1 = lines.find(l => /^#\s+/.test(l));
  const title = h1 ? h1.replace(/^#\s+/, '').trim() : undefined;

  let summary = '';
  let pastH1 = !h1, inPara = false;
  for (const line of lines) {
    if (!pastH1) { if (/^#\s+/.test(line)) pastH1 = true; continue; }
    if (/^#/.test(line)) break;
    if (line.trim() === '') { if (inPara) break; continue; }
    summary += (summary ? ' ' : '') + line.trim();
    inPara = true;
    if (summary.length >= 2000) break;
  }

  const normPath = filePath.replace(/\\/g, '/');
  const dirPath  = normPath.split('/').slice(0, -1).join('/') || '.';

  return {
    kind: 'llms_md',
    stable_key:     `llms:${normPath}`,
    file_path:      normPath,
    directory_path: dirPath,
    content_hash:   createHash('sha256').update(body).digest('hex'),
    title,
    summary: summary.slice(0, 2000),
    rules: [], tools: [], constraints: [], semantic_tags: [], qdrant_tags: [],
    confidence: 0.8,
    schema_version: SCHEMA_VERSION,
  };
}

function* walkForLLMSMd(dir, maxDepth = 12, depth = 0) {
  if (depth > maxDepth) return;
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); }
  catch { return; }

  for (const e of entries) {
    if (e.name.startsWith('.') || e.name === 'node_modules' || e.name === 'deeds_labs') continue;
    const full = join(dir, e.name);
    if (e.isDirectory()) {
      yield* walkForLLMSMd(full, maxDepth, depth + 1);
    } else if (e.name === 'LLMS.md') {
      yield full;
    }
  }
}

async function main() {
  console.log(`\n🤖 LLMS.md indexer${DRY_RUN ? ' [DRY RUN]' : ''}`);
  const found = [...walkForLLMSMd(REPO_ROOT)];
  
  const repoRootLLMS = resolve(REPO_ROOT, '..', 'LLMS.md');
  if (existsSync(repoRootLLMS)) found.unshift(repoRootLLMS);

  console.log(`  Found ${found.length} LLMS.md files`);

  const envelopes = found.map(absPath => {
    const body    = readFileSync(absPath, 'utf8');
    const relPath = relative(REPO_ROOT, absPath).replace(/\\/g, '/');
    return { absPath, body, env: parseLLMSMd(body, relPath) };
  });

  if (DRY_RUN) return;

  try {
    const { default: Redis } = await import('ioredis');
    const redis = new Redis(REDIS_URL, { lazyConnect: true, connectTimeout: 3000 });
    await redis.connect();
    const pipe = redis.pipeline();

    for (const { body, env } of envelopes) {
      const relDir = env.directory_path === '.' ? '' : env.directory_path;
      const key    = relDir ? `llms:dir:${relDir}` : 'llms:root';
      pipe.setex(key, REDIS_TTL, body);
    }

    await pipe.exec();
    await redis.quit();
    console.log(`  Redis: set ${envelopes.length} key(s)`);
  } catch (e) {
    console.warn(`  ⚠ Redis unavailable`);
  }

  if (REDIS_ONLY) return;

  const pool = new pg.Pool({ connectionString: DB_URL });
  try {
    for (const { env } of envelopes) {
      await pool.query(
        `INSERT INTO agent_context_files
           (stable_key, file_path, directory_path, content_hash,
            title, summary, rules, tools, constraints,
            semantic_tags, qdrant_tags, confidence, schema_version,
            indexed_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,now(),now())
         ON CONFLICT (stable_key) DO UPDATE SET
            content_hash = EXCLUDED.content_hash,
            updated_at = now()`,
        [
          env.stable_key, env.file_path, env.directory_path, env.content_hash,
          env.title ?? null, env.summary,
          '[]', '[]', '[]', '{}', '{}',
          env.confidence, env.schema_version,
        ]
      );
    }
  } catch (e) {
    console.warn(`  ⚠ Postgres error`);
  } finally {
    await pool.end().catch(() => {});
  }
}

main().catch(e => { console.error(e); process.exit(1); });
