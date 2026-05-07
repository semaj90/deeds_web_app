#!/usr/bin/env node
/**
 * index-agents-md.mjs
 *
 * Crawls every AGENTS.md in the repo, parses a structured envelope, upserts
 * to agent_context_files + directory_context_bindings (Postgres), and writes
 * agents:dir:<relDir> / agents:root Redis keys so the ACE walk-up resolver
 * gets immediate cache hits.
 *
 * Usage:
 *   node scripts/index-agents-md.mjs
 *   node scripts/index-agents-md.mjs --dry-run
 *   node scripts/index-agents-md.mjs --dry-run --verbose
 *   node scripts/index-agents-md.mjs --redis-only
 *
 * Redis TTL 86400s matches the ACE resolver expectation.
 */

import { createHash }                                from 'node:crypto';
import { readFileSync, existsSync, readdirSync }     from 'node:fs';
import { resolve, relative, dirname, join }          from 'node:path';
import { fileURLToPath }                             from 'node:url';
import pg                                            from 'pg';
import dotenv                                        from 'dotenv';

dotenv.config();

const __dirname  = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT  = resolve(__dirname, '..');           // sveltekit-frontend/

const DRY_RUN    = process.argv.includes('--dry-run');
const REDIS_ONLY = process.argv.includes('--redis-only');
const VERBOSE    = process.argv.includes('--verbose');

const REDIS_URL  = process.env.REDIS_URL ?? 'redis://127.0.0.1:6379';
const DB_URL     = process.env.DATABASE_URL ?? 'postgresql://legal_admin:123456@127.0.0.1:5432/legal_ai_db';
const REDIS_TTL  = 86_400;

const SCHEMA_VERSION = 1;

// ── Minimal inline parser ─────────────────────────────────────────────────────

function parseAgentsMd(body, filePath) {
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

  const sections = [];
  let cur = null;
  for (const line of lines) {
    const m = /^##\s+(.+?)\s*$/.exec(line);
    if (m) { if (cur) sections.push(cur); cur = { header: m[1].toLowerCase().trim(), body: [] }; continue; }
    if (cur) cur.body.push(line);
  }
  if (cur) sections.push(cur);

  const RULE_H       = ['rules', 'conventions', 'standards', 'guidelines'];
  const TAG_H        = ['tags', 'semantic tags', 'qdrant tags', 'topics'];
  const CONSTRAINT_H = ['constraints', 'forbidden', "don't", 'do not', 'limits'];

  const rules = [], semantic_tags = [], qdrant_tags = [], constraints = [];

  for (const sec of sections) {
    const h = sec.header;
    const bullets = sec.body
      .filter(l => /^\s*[-*]\s+/.test(l))
      .map(l => l.replace(/^\s*[-*]\s+/, '').trim())
      .filter(Boolean);

    if (RULE_H.some(k => h.includes(k))) {
      for (const b of bullets) {
        const sMatch = /\b(critical|high|important|medium|low|note|info)\b/i.exec(b);
        const sev = sMatch
          ? (['critical','high','important'].includes(sMatch[1].toLowerCase()) ? 'high'
            : sMatch[1].toLowerCase() === 'medium' ? 'medium' : 'low')
          : 'medium';
        const tagMatch = /\[([^\]]+)\]/.exec(b);
        const tags = tagMatch ? tagMatch[1].split(',').map(t => t.trim()) : [];
        rules.push({ rule: b.replace(/\[[^\]]*\]/, '').trim().slice(0, 500), severity: sev, tags });
      }
    } else if (TAG_H.some(k => h.includes(k))) {
      const isQdrant = h.includes('qdrant');
      for (const b of bullets) (isQdrant ? qdrant_tags : semantic_tags).push(b.slice(0, 100));
    } else if (CONSTRAINT_H.some(k => h.includes(k))) {
      for (const b of bullets) constraints.push({ constraint: b.slice(0, 500), applies_to: [] });
    }
  }

  let confidence = 0.5;
  if (title)              confidence += 0.10;
  if (summary.length > 50) confidence += 0.10;
  if (rules.length > 0)   confidence += 0.10;
  if (semantic_tags.length > 0) confidence += 0.10;
  if (constraints.length > 0)   confidence += 0.05;
  confidence = Math.min(confidence, 0.95);

  const normPath = filePath.replace(/\\/g, '/');
  const dirPath  = normPath.split('/').slice(0, -1).join('/') || '.';

  return {
    kind: 'agents_md',
    stable_key:     `agents:${normPath}`,
    file_path:      normPath,
    directory_path: dirPath,
    content_hash:   createHash('sha256').update(body).digest('hex'),
    title,
    summary: summary.slice(0, 2000),
    rules, tools: [], constraints, semantic_tags, qdrant_tags,
    confidence,
    schema_version: SCHEMA_VERSION,
  };
}

// ── Filesystem walk ───────────────────────────────────────────────────────────

function* walkForAgentsMd(dir, maxDepth = 12, depth = 0) {
  if (depth > maxDepth) return;
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); }
  catch { return; }

  for (const e of entries) {
    if (e.name.startsWith('.') || e.name === 'node_modules' || e.name === 'deeds_labs') continue;
    const full = join(dir, e.name);
    if (e.isDirectory()) {
      yield* walkForAgentsMd(full, maxDepth, depth + 1);
    } else if (e.name === 'AGENTS.md') {
      yield full;
    }
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n🤖 AGENTS.md indexer${DRY_RUN ? ' [DRY RUN]' : ''}${REDIS_ONLY ? ' [redis-only]' : ''}`);
  console.log(`   Root: ${REPO_ROOT}\n`);

  const found = [...walkForAgentsMd(REPO_ROOT)];

  // Also include repo-level AGENTS.md one level up
  const repoAgents = resolve(REPO_ROOT, '..', 'AGENTS.md');
  if (existsSync(repoAgents)) found.unshift(repoAgents);

  console.log(`  Found ${found.length} AGENTS.md files`);

  const envelopes = found.map(absPath => {
    const body    = readFileSync(absPath, 'utf8');
    const relPath = relative(REPO_ROOT, absPath).replace(/\\/g, '/');
    return { absPath, body, env: parseAgentsMd(body, relPath) };
  });

  if (VERBOSE) {
    for (const { env } of envelopes) {
      console.log(`  → ${env.file_path}  (conf=${env.confidence.toFixed(2)}, rules=${env.rules.length}, tags=[${env.semantic_tags.slice(0,3).join(', ')}])`);
    }
  }

  if (DRY_RUN) {
    console.log('\n✅ Dry run complete — no writes.\n');
    return;
  }

  // ── Redis ─────────────────────────────────────────────────────────────────────

  let redisOk = false;
  try {
    const { default: Redis } = await import('ioredis');
    const redis = new Redis(REDIS_URL, { lazyConnect: true, connectTimeout: 3000 });
    await redis.connect();
    const pipe = redis.pipeline();

    for (const { body, env } of envelopes) {
      const relDir = env.directory_path === '.' ? '' : env.directory_path;
      const key    = relDir ? `agents:dir:${relDir}` : 'agents:root';
      pipe.setex(key, REDIS_TTL, body);
    }

    await pipe.exec();
    await redis.quit();
    redisOk = true;
    console.log(`  Redis: set ${envelopes.length} key(s) (TTL=${REDIS_TTL}s)`);
  } catch (e) {
    console.warn(`  ⚠ Redis unavailable — ${String(e).slice(0, 80)}`);
  }

  if (REDIS_ONLY) {
    console.log(`\n✅ Done (redis-only).\n`);
    return;
  }

  // ── Postgres ──────────────────────────────────────────────────────────────────

  let pgOk = false;
  const pool = new pg.Pool({ connectionString: DB_URL });

  try {
    await pool.query('SELECT 1');

    for (const { env } of envelopes) {
      await pool.query(
        `INSERT INTO agent_context_files
           (stable_key, file_path, directory_path, content_hash,
            title, summary, rules, tools, constraints,
            semantic_tags, qdrant_tags, confidence, schema_version,
            indexed_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,now(),now())
         ON CONFLICT (stable_key) DO UPDATE SET
           content_hash   = EXCLUDED.content_hash,
           title          = EXCLUDED.title,
           summary        = EXCLUDED.summary,
           rules          = EXCLUDED.rules,
           tools          = EXCLUDED.tools,
           constraints    = EXCLUDED.constraints,
           semantic_tags  = EXCLUDED.semantic_tags,
           qdrant_tags    = EXCLUDED.qdrant_tags,
           confidence     = EXCLUDED.confidence,
           schema_version = EXCLUDED.schema_version,
           updated_at     = now()`,
        [
          env.stable_key, env.file_path, env.directory_path, env.content_hash,
          env.title ?? null, env.summary,
          JSON.stringify(env.rules), JSON.stringify(env.tools), JSON.stringify(env.constraints),
          env.semantic_tags, env.qdrant_tags,
          env.confidence, env.schema_version,
        ]
      );

      // directory_context_bindings: exact + inherited walk-up rows
      const parts = env.directory_path === '.' ? [] : env.directory_path.split('/');

      const bindRows = [
        { dir: parts.join('/') || '', depth: 0, type: 'exact', priority: 100, conf: env.confidence },
        ...parts.map((_, i) => {
          const parentDir = parts.slice(0, parts.length - i - 1).join('/');
          return {
            dir: parentDir,
            depth: i + 1,
            type: 'inherited',
            priority: Math.max(10, 100 - (i + 1) * 10),
            conf: Math.max(0.4, env.confidence - (i + 1) * 0.1),
          };
        }),
      ];

      for (const b of bindRows) {
        await pool.query(
          `INSERT INTO directory_context_bindings
             (agent_context_key, directory_path, binding_type, depth, priority, confidence)
           VALUES ($1,$2,$3,$4,$5,$6)
           ON CONFLICT (agent_context_key, directory_path, binding_type) DO UPDATE SET
             depth=EXCLUDED.depth, priority=EXCLUDED.priority, confidence=EXCLUDED.confidence`,
          [env.stable_key, b.dir, b.type, b.depth, b.priority, b.conf]
        );
      }
    }

    pgOk = true;
    console.log(`  Postgres: upserted ${envelopes.length} agent_context_files row(s)`);
  } catch (e) {
    console.warn(`  ⚠ Postgres unavailable — ${String(e).slice(0, 120)}`);
  } finally {
    await pool.end().catch(() => {});
  }

  console.log(`\n✅ AGENTS.md index complete — ${envelopes.length} files, Redis:${redisOk ? '✓' : '✗'}, Postgres:${pgOk ? '✓' : '✗'}\n`);
}

main().catch(e => { console.error(e); process.exit(1); });
