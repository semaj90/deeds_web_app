#!/usr/bin/env node
/**
 * codebase-todo-aggregator.mjs
 *
 * Pulls together every codebase-intelligence signal we've built this stack
 * into a single ranked TODO list, then optionally has Gemma4 rerank/explain
 * the top entries. Output feeds the .claude/skills/codebase-todo skill.
 *
 *
 * Signals fused (weights tunable via flags):
 *
 *   ace:authority:top         (200 files)        Redis 6h     graphify:gds
 *   gpu:karpathy:scores       (top-50)           Redis 24h    karpathy:gpu
 *   ace:engram:bigram:*       (query memory)     Redis 1h     ACE retrieval
 *   ace:rank:dirty_files      (recent changes)   Redis        startup:ace
 *   agent_context_files       (AGENTS.md envel.) Postgres     agents:pipeline
 *   docs/agent_timeline_synthesis.md             FS           agents:synthesis
 *   docs/agents_recommendations.md               FS           agents:timeline
 *   next_steps/active/karpathy-gpu-rec.md        FS           karpathy:gpu
 *   MCP clusters.get_summary_lenses              :8788
 *
 * Output:
 *   next_steps/active/codebase-todo-recommendations.md
 *   Redis ace:todo:latest (24h TTL, JSON)
 *   stdout (when --stdout)
 *
 * Flags:
 *   --dry-run       skip Gemma4 + Redis writes
 *   --no-rerank     skip Gemma4 explanation pass
 *   --limit 30      top-N entries (default 25)
 *   --stdout        emit markdown to stdout (Claude Code skill consumption)
 *   --query "fix authentication"   bias scoring toward this query (engram lookup)
 */

import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
dotenv.config();

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT      = resolve(__dirname, '../..');

// ── CLI ───────────────────────────────────────────────────────────────────────
const args      = process.argv.slice(2);
const DRY_RUN   = args.includes('--dry-run');
const NO_RERANK = args.includes('--no-rerank');
const STDOUT    = args.includes('--stdout');
const LIMIT     = parseInt(
  args.find(a => a.startsWith('--limit='))?.split('=')[1] ??
  (args.includes('--limit') ? args[args.indexOf('--limit') + 1] : '25')
) || 25;
const QUERY     = (() => {
  const i = args.indexOf('--query');
  return i !== -1 ? args[i + 1] : null;
})();

const REDIS_URL  = process.env.REDIS_URL ?? 'redis://127.0.0.1:6379';
const OLLAMA_URL = process.env.OLLAMA_BASE_URL ?? 'http://127.0.0.1:11434';
const LLM_MODEL  = process.env.LLM_MODEL ?? 'gemma4-legal-vlm:latest';
const MCP_URL    = process.env.MCP_URL ?? 'http://127.0.0.1:8788';
const DB_URL     = process.env.DATABASE_URL;

if (!STDOUT) console.log(`\n📋 Codebase TODO aggregator${DRY_RUN ? ' [DRY RUN]' : ''}`);

// ── Signal pulls ──────────────────────────────────────────────────────────────
async function pullRedisSignals(redis) {
  const out = { authority: {}, karpathy: {}, dirty: [], bigramHits: [] };
  try {
    const auth = await redis.hgetall('ace:authority:top');
    for (const [file, raw] of Object.entries(auth ?? {})) {
      try { out.authority[file] = JSON.parse(raw); } catch { /* skip */ }
    }
  } catch { /* non-fatal */ }
  try {
    const kar = await redis.hgetall('gpu:karpathy:scores');
    for (const [file, raw] of Object.entries(kar ?? {})) {
      try { out.karpathy[file] = JSON.parse(raw); } catch { /* skip */ }
    }
  } catch { /* non-fatal */ }
  try {
    out.dirty = await redis.smembers('ace:rank:dirty_files') ?? [];
  } catch { /* non-fatal */ }
  if (QUERY) {
    try {
      const { createHash } = await import('node:crypto');
      const hash = createHash('sha1').update(QUERY.toLowerCase().trim()).digest('hex').slice(0, 12);
      const next = await redis.zrange(`ace:engram:bigram:${hash}`, 0, 9, 'REV', 'WITHSCORES');
      for (let i = 0; i < next.length; i += 2) {
        out.bigramHits.push({ nextHash: next[i], score: parseFloat(next[i + 1]) });
      }
    } catch { /* non-fatal */ }
  }
  return out;
}

async function pullPostgresSignals() {
  if (!DB_URL) return { agentsRules: [] };
  const { default: pg } = await import('pg');
  const c = new pg.Client({ connectionString: DB_URL, connectionTimeoutMillis: 3000 });
  try {
    await c.connect();
    const r = await c.query(`
      SELECT path, jsonb_array_length(rules) AS rule_count, indexed_at
      FROM agent_context_files
      WHERE jsonb_array_length(rules) > 0
      ORDER BY jsonb_array_length(rules) DESC, indexed_at DESC
      LIMIT 30
    `);
    return { agentsRules: r.rows };
  } catch { return { agentsRules: [] }; }
  finally { await c.end().catch(() => {}); }
}

function readDoc(rel) {
  const p = resolve(ROOT, rel);
  return existsSync(p) ? readFileSync(p, 'utf8') : null;
}

// ── Score fusion ─────────────────────────────────────────────────────────────
function fuseScores(redis, dirtySet) {
  const merged = new Map(); // filePath → entry
  // Authority pass (weight: 0.40)
  for (const [file, v] of Object.entries(redis.authority)) {
    merged.set(file, {
      file,
      authority: v.graphAuthorityScore ?? 0,
      pagerank:  v.pagerank ?? 0,
      community: v.communityId ?? null,
      cluster:   v.clusterKey ?? null,
      topo:      v.topoClass ?? null,
      attention: 0,
      blend:     0,
      isDirty:   dirtySet.has(file),
      reasons:   [],
    });
  }
  // Karpathy GPU pass (weight: 0.35) — autoencoder + attention blend
  for (const [file, v] of Object.entries(redis.karpathy)) {
    const cur = merged.get(file) ?? {
      file, authority: 0, pagerank: 0, community: null, cluster: null,
      topo: null, attention: 0, blend: 0, isDirty: dirtySet.has(file), reasons: [],
    };
    cur.attention = v.attention ?? 0;
    cur.pagerank  = v.pagerank ?? cur.pagerank;
    cur.karpBlend = v.blend ?? 0;
    merged.set(file, cur);
  }
  // Dirty-file boost (weight: 0.25) — recent changes get explicit attention
  for (const f of dirtySet) {
    const cur = merged.get(f);
    if (cur) {
      cur.isDirty = true;
      cur.reasons.push('dirty');
    }
  }
  // Final blend
  for (const e of merged.values()) {
    e.blend =
      0.40 * (e.authority ?? 0) +
      0.35 * (e.karpBlend ?? 0) / 4 +  // karpBlend ranges 0-4, normalize
      0.15 * (e.attention ?? 0) +
      (e.isDirty ? 0.10 : 0);
    if (e.authority > 0.4) e.reasons.push(`authority=${e.authority.toFixed(2)}`);
    if (e.attention > 0.95) e.reasons.push('high-attention');
    if (e.pagerank > 3) e.reasons.push(`PR=${e.pagerank.toFixed(1)}`);
  }
  return [...merged.values()].sort((a, b) => b.blend - a.blend);
}

// ── Gemma4 rerank pass ───────────────────────────────────────────────────────
async function gemma4Rerank(top, agentsRules, timelineMd) {
  if (NO_RERANK || DRY_RUN) return null;
  const fileLines = top.slice(0, 15).map((e, i) =>
    `${i + 1}. ${e.file}  blend=${e.blend.toFixed(3)}  authority=${(e.authority ?? 0).toFixed(2)}  reasons=[${e.reasons.join(', ')}]`
  ).join('\n');
  const rulesLines = agentsRules.slice(0, 8).map(r =>
    `- ${r.path}  rules=${r.rule_count}`
  ).join('\n');
  const timelineExcerpt = (timelineMd ?? '').split('\n').slice(0, 30).join('\n');
  const prompt = [
    'You are a codebase intelligence agent recommending TODOs for engineering attention.',
    '',
    '## Top files (by fused authority+attention+dirty score):',
    fileLines,
    '',
    '## Directories with strict AGENTS.md rules:',
    rulesLines,
    '',
    '## Recent timeline excerpt:',
    timelineExcerpt,
    '',
    '## Task',
    'Produce 5-7 prioritized TODO bullets. Each bullet: file path, one-sentence action, why now.',
    'Format as Markdown bullets. No preamble.',
  ].join('\n');

  try {
    const res = await fetch(`${OLLAMA_URL}/api/generate`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model:   LLM_MODEL,
        prompt,
        stream:  false,
        options: { temperature: 0.3, num_predict: 600 },
      }),
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) return null;
    const j = await res.json();
    return (j.response ?? '').trim();
  } catch { return null; }
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  // Redis pull
  let redis = null, redisSignals = { authority: {}, karpathy: {}, dirty: [], bigramHits: [] };
  try {
    const { default: Redis } = await import('ioredis');
    redis = new Redis(REDIS_URL, { lazyConnect: true, connectTimeout: 3000, enableReadyCheck: false });
    await redis.connect();
    redisSignals = await pullRedisSignals(redis);
  } catch (e) {
    if (!STDOUT) console.warn(`   ⚠ Redis: ${e.message}`);
  }

  // Postgres pull
  const { agentsRules } = await pullPostgresSignals();

  // Doc pulls
  const timelineMd = readDoc('docs/agent_timeline_synthesis.md');
  const recsMd     = readDoc('docs/agents_recommendations.md');
  const karMd      = readDoc('next_steps/active/karpathy-gpu-recommendations.md');

  if (!STDOUT) {
    console.log(`   authority entries: ${Object.keys(redisSignals.authority).length}`);
    console.log(`   karpathy entries:  ${Object.keys(redisSignals.karpathy).length}`);
    console.log(`   dirty files:       ${redisSignals.dirty.length}`);
    console.log(`   AGENTS rule rows:  ${agentsRules.length}`);
    console.log(`   timeline doc:      ${timelineMd ? '✓' : '✗'}`);
    console.log(`   karpathy doc:      ${karMd ? '✓' : '✗'}`);
    if (QUERY) console.log(`   bigram hits:       ${redisSignals.bigramHits.length}`);
  }

  // Fuse
  const dirtySet = new Set(redisSignals.dirty);
  const fused = fuseScores(redisSignals, dirtySet);
  const top = fused.slice(0, LIMIT);

  // Gemma4 rerank
  if (!STDOUT) console.log(`\n   Running Gemma4 rerank…`);
  const reranked = await gemma4Rerank(top, agentsRules, timelineMd);

  // Build markdown output
  const now = new Date().toISOString().slice(0, 19) + 'Z';
  const lines = [
    '# Codebase TODO Recommendations',
    '',
    `> Generated: ${now} | Top-${LIMIT} by fused authority + Karpathy GPU + dirty-file signal`,
    `> Sources: Redis ace:authority:top + gpu:karpathy:scores + ace:rank:dirty_files,`,
    `>          Postgres agent_context_files, MCP clusters.get_summary_lenses,`,
    `>          docs/agent_timeline_synthesis.md`,
    QUERY ? `> Query bias: "${QUERY}" (${redisSignals.bigramHits.length} engram hits)` : '',
    '',
    reranked ? '## Gemma4 Synthesis\n\n' + reranked + '\n' : '## (Gemma4 rerank skipped or unavailable)\n',
    '',
    '## Ranked Targets',
    '',
    '| # | File | Blend | PR | Authority | Attention | Dirty | Reasons |',
    '|---|------|-------|----|-----------|-----------|-------|---------|',
    ...top.map((e, i) => {
      const reasons = e.reasons.slice(0, 3).join(', ') || '—';
      return `| ${i + 1} | \`${e.file}\` | ${e.blend.toFixed(3)} | ${(e.pagerank ?? 0).toFixed(2)} | ${(e.authority ?? 0).toFixed(2)} | ${(e.attention ?? 0).toFixed(2)} | ${e.isDirty ? 'Y' : '·'} | ${reasons} |`;
    }),
    '',
    agentsRules.length ? '## Directories with the Strictest AGENTS.md Rules\n' : '',
    agentsRules.length ? '| Directory | Rule Count | Last Indexed |' : '',
    agentsRules.length ? '|-----------|-----------|--------------|' : '',
    ...agentsRules.slice(0, 10).map(r => `| \`${r.path}\` | ${r.rule_count} | ${r.indexed_at?.toISOString?.() ?? r.indexed_at} |`),
    '',
    '## Provenance',
    '',
    `- Redis authority: \`HLEN ace:authority:top\` = ${Object.keys(redisSignals.authority).length}`,
    `- Karpathy GPU:    \`HLEN gpu:karpathy:scores\` = ${Object.keys(redisSignals.karpathy).length}`,
    `- Dirty files:     \`SMEMBERS ace:rank:dirty_files\` = ${redisSignals.dirty.length}`,
    `- AGENTS mirror:   \`SELECT count(*) FROM agent_context_files\` = ${agentsRules.length}+ (top 30)`,
    `- Timeline doc:    \`docs/agent_timeline_synthesis.md\` ${timelineMd ? `(${timelineMd.length} chars)` : '(missing — run agents:synthesis)'}`,
    `- Karpathy doc:    \`next_steps/active/karpathy-gpu-recommendations.md\` ${karMd ? `(${karMd.length} chars)` : '(missing — run karpathy:gpu)'}`,
    '',
    '## Refresh Commands',
    '',
    '```bash',
    'npm run graphify:gds           # rebuild Redis ace:authority:top',
    'npm run karpathy:gpu           # rebuild gpu:karpathy:scores',
    'npm run agents:synthesis       # rebuild docs/agent_timeline_synthesis.md',
    'npm run agents:timeline:fast   # rebuild docs/agents_recommendations.md',
    'npm run startup:ace            # refresh ace:rank:dirty_files',
    '```',
    '',
  ].filter(Boolean).join('\n');

  if (STDOUT) {
    process.stdout.write(lines);
  } else {
    if (!DRY_RUN) {
      const outDir = resolve(ROOT, 'next_steps/active');
      mkdirSync(outDir, { recursive: true });
      const outPath = join(outDir, 'codebase-todo-recommendations.md');
      writeFileSync(outPath, lines, 'utf8');
      console.log(`\n   ✓ next_steps/active/codebase-todo-recommendations.md (${lines.length} chars)`);
      if (redis) {
        try {
          await redis.setex('ace:todo:latest', 24 * 3600, JSON.stringify({
            generatedAt: now,
            top:         top.slice(0, LIMIT),
            agentsRules: agentsRules.slice(0, 10),
            rerank:      reranked ?? null,
          }));
          console.log(`   ✓ Redis ace:todo:latest (24h TTL)`);
        } catch { /* non-fatal */ }
      }
    } else {
      console.log(`   [dry-run] Would write next_steps/active/codebase-todo-recommendations.md (${lines.length} chars)`);
    }
  }

  if (redis) {
    await redis.quit().catch(() => {});
    redis.disconnect();
  }
}

main()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('❌ aggregator failed:', err.message);
    process.exit(1);
  });
