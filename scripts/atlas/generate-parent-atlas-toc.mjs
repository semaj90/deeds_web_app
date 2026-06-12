#!/usr/bin/env node
/**
 * generate-parent-atlas-toc.mjs
 *
 * Offline graph compiler — Stage 4 (final).
 *
 * Reads atlas_feature_map (populated by stages 1-3) and generates:
 *   1. A US Code style Parent Atlas TOC in parent_atlas_index + atlas_toc_entries
 *   2. docs/graph/parent-atlas-toc.md  — human-readable markdown
 *   3. Redis key bifrost:atlas:toc      — JSON TOC for agent hot-path (24h TTL)
 *
 * Section structure (derived from community_id + feature_id prefix):
 *   1. Auth / Sessions / Identity
 *   2. Upload / Evidence / OCR
 *   3. RAG / Embeddings / Qdrant
 *   4. Graph / Neo4j / Features
 *   5. Agentic Workflow / Engram / Bifrost
 *   6. Infrastructure / Config / Observability
 *   7. UI / Components / Frontend
 *   8. Schema / Database / ORM
 *   9. Testing / Diagnostics
 *  10. General / Utilities
 *
 * Usage:
 *   node scripts/atlas/generate-parent-atlas-toc.mjs --dry-run
 *   node scripts/atlas/generate-parent-atlas-toc.mjs --apply
 */

import pg from 'pg';
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { Pool } = pg;
const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT  = join(__dir, '../..');

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';
const REDIS_HOST   = process.env.REDIS_HOST   || '127.0.0.1';
const REDIS_PORT   = parseInt(process.env.REDIS_PORT ?? '6379', 10);
const REDIS_PASS   = process.env.REDIS_PASSWORD || '';

const APPLY   = process.argv.includes('--apply');
const DRY_RUN = !APPLY;
const TTL_24H = 86400;

// ── Section classifier ────────────────────────────────────────────────────────
const SECTION_RULES = [
  { section: '1', title: 'Auth / Sessions / Identity',
    keywords: ['auth', 'lucia', 'session', 'login', 'user', 'password', 'token', 'jwt', 'cookie'] },
  { section: '2', title: 'Upload / Evidence / OCR',
    keywords: ['evidence', 'upload', 'ocr', 'file', 'document', 'pdf', 'chunk', 'ingest', 'seaweed', 'minio'] },
  { section: '3', title: 'RAG / Embeddings / Qdrant',
    keywords: ['rag', 'embed', 'vector', 'qdrant', 'retrieval', 'semantic', 'similarity', 'hnsw', 'ann'] },
  { section: '4', title: 'Graph / Neo4j / Features',
    keywords: ['graph', 'neo4j', 'topology', 'pagerank', 'community', 'cluster', 'edge', 'node', 'atlas', 'packet'] },
  { section: '5', title: 'Agentic Workflow / Engram / Bifrost',
    keywords: ['agent', 'engram', 'bifrost', 'mcp', 'trace', 'ace', 'rl', 'grpo', 'reward', 'plan', 'orchestrat'] },
  { section: '6', title: 'Infrastructure / Config / Observability',
    keywords: ['infra', 'config', 'docker', 'redis', 'rabbitmq', 'health', 'monitor', 'observ', 'log', 'metric'] },
  { section: '7', title: 'UI / Components / Frontend',
    keywords: ['ui', 'component', 'svelte', 'route', 'page', 'layout', 'modal', 'button', 'form', 'css'] },
  { section: '8', title: 'Schema / Database / ORM',
    keywords: ['schema', 'drizzle', 'postgres', 'migration', 'table', 'column', 'query', 'sql', 'db'] },
  { section: '9', title: 'Testing / Diagnostics',
    keywords: ['test', 'spec', 'e2e', 'playwright', 'vitest', 'diagnostic', 'audit', 'check'] },
];
const DEFAULT_SECTION = { section: '10', title: 'General / Utilities' };

function classify(featureId, summary) {
  const text = ((featureId ?? '') + ' ' + (summary ?? '')).toLowerCase();
  for (const rule of SECTION_RULES) {
    if (rule.keywords.some(kw => text.includes(kw))) return rule;
  }
  return DEFAULT_SECTION;
}

async function main() {
  console.log(`\n═══ Generate Parent Atlas TOC ${DRY_RUN ? '(dry-run)' : '(APPLY)'} ═══`);
  const pool = new Pool({ connectionString: DATABASE_URL });

  // ── Load atlas_feature_map ────────────────────────────────────────────────
  const { rows: features } = await pool.query(`
    SELECT feature_id, canonical_name, summary, pagerank, centrality,
           jsonb_array_length(COALESCE(source_refs, '[]')) AS source_ref_count,
           jsonb_array_length(COALESCE(packet_keys, '[]')) AS packet_count,
           cluster_id
    FROM atlas_feature_map
    WHERE feature_id IS NOT NULL
    ORDER BY COALESCE(pagerank, 0) DESC, feature_id
  `);
  console.log(`Features loaded: ${features.length}`);

  // ── Group by section ──────────────────────────────────────────────────────
  const sections = new Map(); // section → { title, entries[] }
  for (const f of features) {
    const rule = classify(f.feature_id, f.summary);
    if (!sections.has(rule.section)) {
      sections.set(rule.section, { title: rule.title, entries: [] });
    }
    sections.get(rule.section).entries.push(f);
  }

  // Sort sections
  const sortedSections = [...sections.entries()].sort((a, b) =>
    a[0].localeCompare(b[0], undefined, { numeric: true }));

  // ── Build markdown TOC ────────────────────────────────────────────────────
  const lines = [
    '# Parent Atlas — Master Table of Contents',
    '',
    `Generated: ${new Date().toISOString()}`,
    `Features: ${features.length}`,
    '',
    '---',
    '',
  ];

  const tocEntries = []; // for DB insert

  for (const [sectionNum, { title, entries }] of sortedSections) {
    lines.push(`## ${sectionNum}. ${title}  (${entries.length} features)`);
    lines.push('');

    for (let i = 0; i < entries.length; i++) {
      const f = entries[i];
      const subsection = `${sectionNum}.${i + 1}`;
      const pr = f.pagerank ? ` [PR: ${Number(f.pagerank).toFixed(3)}]` : '';
      const pkts = f.packet_count ? ` | ${f.packet_count} packets` : '';
      const srcs = f.source_ref_count ? ` | ${f.source_ref_count} files` : '';
      lines.push(`  ${subsection}. \`${f.feature_id}\`${pr}${pkts}${srcs}`);
      if (f.summary) lines.push(`       > ${f.summary}`);

      tocEntries.push({
        section_path: subsection,
        parent_path:  sectionNum,
        title:        f.canonical_name ?? f.feature_id,
        feature_id:   f.feature_id,
        community_id: f.cluster_id ? parseInt(f.cluster_id, 10) : null,
        summary:      f.summary,
        rank_score:   f.pagerank ?? 0,
        depth:        2,
      });
    }
    lines.push('');
  }

  const markdown = lines.join('\n');
  const tocPath = join(ROOT, 'docs', 'graph', 'parent-atlas-toc.md');

  if (DRY_RUN) {
    console.log('\nDry-run TOC preview (first 40 lines):');
    console.log(lines.slice(0, 40).join('\n'));
    console.log(`\n... (${lines.length} total lines, ${tocEntries.length} entries)`);
    console.log('\n(dry-run — no writes; run with --apply to commit)');
    await pool.end();
    return;
  }

  // ── Write markdown ────────────────────────────────────────────────────────
  mkdirSync(join(ROOT, 'docs', 'graph'), { recursive: true });
  writeFileSync(tocPath, markdown, 'utf8');
  console.log(`Wrote: ${tocPath}`);

  // ── Insert into parent_atlas_index ────────────────────────────────────────
  const { rows: [atlas] } = await pool.query(`
    INSERT INTO parent_atlas_index (title, version, section_count, status)
    VALUES ('Parent Atlas', '1.0', $1, 'active')
    RETURNING atlas_id
  `, [tocEntries.length]);
  const atlasId = atlas.atlas_id;
  console.log(`parent_atlas_index id: ${atlasId}`);

  // ── Insert toc_entries in batches ──────────────────────────────────────────
  const BATCH = 500;
  let inserted = 0;
  for (let i = 0; i < tocEntries.length; i += BATCH) {
    const batch = tocEntries.slice(i, i + BATCH);
    for (const e of batch) {
      await pool.query(`
        INSERT INTO atlas_toc_entries
          (atlas_id, section_path, parent_path, title, feature_id, community_id, summary, rank_score, depth)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      `, [atlasId, e.section_path, e.parent_path, e.title, e.feature_id,
          e.community_id, e.summary, e.rank_score, e.depth]);
      inserted++;
    }
    process.stdout.write(`\r  TOC entries: ${inserted}/${tocEntries.length}`);
  }
  process.stdout.write('\n');

  // ── Push to Redis ─────────────────────────────────────────────────────────
  let redisOk = false;
  try {
    const Redis = require('ioredis');
    const redis = new Redis({
      host: REDIS_HOST, port: REDIS_PORT,
      password: REDIS_PASS || undefined,
      lazyConnect: true, maxRetriesPerRequest: 1,
      enableOfflineQueue: false, retryStrategy: () => null,
    });
    redis.on('error', () => {});
    await redis.connect();
    await redis.ping();

    const tocJson = JSON.stringify({
      atlas_id: atlasId,
      generated_at: new Date().toISOString(),
      sections: sortedSections.map(([num, { title, entries }]) => ({
        section: num, title,
        feature_count: entries.length,
        top_features: entries.slice(0, 5).map(e => e.feature_id),
      })),
    });
    await redis.set('bifrost:atlas:toc', tocJson, 'EX', TTL_24H);
    await redis.quit();
    redisOk = true;
    console.log('Redis bifrost:atlas:toc written (TTL 24h)');
  } catch (err) {
    console.warn(`Redis unavailable (${err.message}) — skipping`);
  }

  await pool.end();

  console.log('\n══ Summary ══════════════════════════════════════');
  console.log(`  Sections:             ${sortedSections.length}`);
  console.log(`  TOC entries:          ${inserted}`);
  console.log(`  Markdown:             ${tocPath}`);
  console.log(`  Redis TOC:            ${redisOk ? '✅' : 'SKIPPED'}`);
  console.log(`  Atlas ID:             ${atlasId}`);
  console.log('\n  ✅ Parent Atlas compiled. Run Gemma LoRA training on atlas_toc_entries.summary');
}

main().catch(err => { console.error(err); process.exit(1); });
