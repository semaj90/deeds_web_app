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
const LLM_MODEL = process.env.LLM_MODEL ?? 'gemma4-rotorquant:latest';
// Inference cascade per CLAUDE.md "Inference Cascade" section:
//   TurboQuant llama-server :8090  (KV cache, cache_prompt:true, primary)
//   Bifrost :3040                  (L2 semantic cache wrapper)
//   Ollama :11434                  (last-resort fallback, reloads weights)
const TURBOQUANT_URL = process.env.TURBOQUANT_URL ?? 'http://127.0.0.1:8090';
const BIFROST_URL    = process.env.BIFROST_URL    ?? 'http://127.0.0.1:3040';
const MCP_URL    = process.env.MCP_URL ?? 'http://127.0.0.1:8788';
const DB_URL     = process.env.DATABASE_URL;

if (!STDOUT) console.log(`\n📋 Codebase TODO aggregator${DRY_RUN ? ' [DRY RUN]' : ''}`);

// ── Atlas path normalization ─────────────────────────────────────────────────
// karpathy:gpu writes keys like 'src/lib/server/db/client.ts' (with src/ prefix
// because it joins through Neo4j CodebaseFile.filePath which is workspace-relative).
// ace:authority:top writes keys like 'lib/server/db/client.ts' (no src/ prefix
// because graphify:gds normalizes through code_relations.source_file). Without
// normalization the two key spaces never match → authority always 0 on the
// karpathy-ranked entries, blend collapses to attention*0.15.
function normalizeAtlasPath(path) {
  return String(path)
    .replace(/\\/g, '/')
    .replace(/^sveltekit-frontend\//, '')
    .replace(/^src\//, '');
}

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
    // The AGENTS.md generator currently emits Audit Gates / TODO / Fix Timeline
    // sections instead of structured Rules JSONB (parser/generator mismatch
    // documented in next_steps/active/2026-05-08_schema-consolidation-production-ready.md
    // P0.2). Until Machine Envelope JSON lands, treat any indexed AGENTS.md
    // with a non-empty summary or constraints/tools array as a "rule-bearing"
    // directive — gives the rerank prompt useful context immediately.
    // Column is `file_path` (not `path`) — verified via information_schema.
    // Earlier query selecting `path` failed silently in the catch and returned
    // [], which is why the aggregator showed `agent_context_files = 0+`
    // despite 373 indexed rows. Use file_path; loosened predicate accepts
    // any envelope that has at least one structured field populated.
    const r = await c.query(`
      SELECT file_path AS path,
             COALESCE(jsonb_array_length(rules), 0)
               + COALESCE(jsonb_array_length(constraints), 0)
               + COALESCE(jsonb_array_length(tools), 0)
               + (CASE WHEN length(coalesce(summary, '')) > 50 THEN 1 ELSE 0 END) AS rule_count,
             indexed_at
      FROM agent_context_files
      WHERE (jsonb_typeof(rules)       = 'array' AND jsonb_array_length(rules) > 0)
         OR (jsonb_typeof(constraints) = 'array' AND jsonb_array_length(constraints) > 0)
         OR (jsonb_typeof(tools)       = 'array' AND jsonb_array_length(tools) > 0)
         OR length(coalesce(summary, '')) > 50
      ORDER BY rule_count DESC, indexed_at DESC
      LIMIT 30
    `);
    return { agentsRules: r.rows };
  } catch (err) {
    // Don't silent-swallow — surface the error so column drift / migration
    // mismatches don't masquerade as "0 rows" forever (this is exactly the
    // bug that hid `path` vs `file_path` for the whole session).
    if (!STDOUT) console.warn(`   ⚠ Postgres agentsRules query failed: ${err.message}`);
    return { agentsRules: [] };
  } finally { await c.end().catch(() => {}); }
}

function readDoc(rel) {
  const p = resolve(ROOT, rel);
  return existsSync(p) ? readFileSync(p, 'utf8') : null;
}

// ── Score fusion ─────────────────────────────────────────────────────────────
// Both Redis HSETs are merged on the normalized atlas path (no src/ prefix).
// `displayPath` keeps the most explicit form for the rendered table — prefer
// the src/-prefixed shape since that's what Claude Code / IDE links resolve.
function fuseScores(redis, dirtySet) {
  const merged = new Map(); // normalizedPath → entry
  const dirtyNorm = new Set([...dirtySet].map(normalizeAtlasPath));

  function entry(norm, displayPath) {
    let e = merged.get(norm);
    if (!e) {
      e = {
        file:        norm,
        displayPath: displayPath,
        authority:   0,
        pagerank:    0,
        community:   null,
        cluster:     null,
        topo:        null,
        attention:   0,
        karpBlend:   0,
        isDirty:     dirtyNorm.has(norm),
        reasons:     [],
      };
      merged.set(norm, e);
    } else if (displayPath?.startsWith('src/') && !e.displayPath?.startsWith('src/')) {
      e.displayPath = displayPath; // upgrade to src/-prefixed display when seen
    }
    return e;
  }

  // Authority pass — keys here are usually 'lib/server/...'
  for (const [file, v] of Object.entries(redis.authority)) {
    const e = entry(normalizeAtlasPath(file), file);
    e.authority = v.graphAuthorityScore ?? 0;
    e.pagerank  = v.pagerank ?? 0;
    e.community = v.communityId ?? null;
    e.cluster   = v.clusterKey ?? null;
    e.topo      = v.topoClass ?? null;
  }

  // Karpathy GPU pass — keys here are usually 'src/lib/server/...'
  // karpathy stores authority per-file from its own blend; only adopt if the
  // authority pass didn't already set it (rare overlap → prefer authority).
  // Field names: karpathy uses 'pr' / 'attn' (abbreviated for compact JSON).
  // Accept either form so the aggregator works no matter which writer
  // populated the row. Verified payload shape via redis-cli HGET:
  //   {"pr":7.061965,"attn":0.998511,"authority":0.5549,"blend":3.290809}
  for (const [file, v] of Object.entries(redis.karpathy)) {
    const e = entry(normalizeAtlasPath(file), file);
    const attn = v.attn ?? v.attention ?? 0;
    const pr   = v.pr   ?? v.pagerank  ?? 0;
    if (attn) e.attention = attn;
    e.karpBlend = v.blend ?? 0;
    if (!e.pagerank && pr)           e.pagerank  = pr;
    if (!e.authority && v.authority) e.authority = v.authority;
  }

  // Dirty-file boost (recent changes get explicit attention)
  for (const f of dirtyNorm) {
    const cur = merged.get(f);
    if (cur && !cur.reasons.includes('dirty')) cur.reasons.push('dirty');
  }

  // Final blend — weights:
  //   0.40 graphAuthorityScore  (graphify:gds composite)
  //   0.35 karpBlend / 4        (karpathy:gpu, normalize 0-4 → 0-1)
  //   0.15 attention            (Karpathy attention vs centroid)
  //   0.10 dirty boost
  for (const e of merged.values()) {
    e.blend =
      0.40 * (e.authority ?? 0) +
      0.35 * ((e.karpBlend ?? 0) / 4) +
      0.15 * (e.attention ?? 0) +
      (e.isDirty ? 0.10 : 0);
    if (e.authority > 0.4)   e.reasons.push(`authority=${e.authority.toFixed(2)}`);
    if (e.attention > 0.95)  e.reasons.push('high-attention');
    if (e.pagerank > 3)      e.reasons.push(`PR=${e.pagerank.toFixed(1)}`);
    if (e.cluster)           e.reasons.push(e.cluster);
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

  // Wrap the prompt in explicit Gemma turn markers. The fine-tuned
  // gemma4-rotorquant:latest breaks Ollama's auto-applied chat template AND
  // TurboQuant's /v1/chat/completions endpoint (both return empty when GPU
  // is under VRAM pressure). Raw /v1/completions with explicit
  // <start_of_turn>...<end_of_turn> tokens works reliably (~3s, 800+ chars
  // on the same hardware where /chat/completions returns 0 chars).
  const gemmaPrompt =
    `<start_of_turn>user\n${prompt}<end_of_turn>\n<start_of_turn>model\n`;

  // Tier 1: TurboQuant /v1/completions with cache_prompt for KV reuse.
  //   - Persistent KV cache (q8_0) means subsequent calls with the same
  //     system-prompt prefix hit the cache instead of re-tokenizing.
  //   - cache_prompt:true is the llama-server flag that enables this.
  async function callTurboQuant() {
    try {
      const res = await fetch(`${TURBOQUANT_URL}/v1/completions`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model:        LLM_MODEL,
          prompt:       gemmaPrompt,
          max_tokens:   600,
          temperature:  0.3,
          cache_prompt: true,
          stop:         ['<end_of_turn>', '<start_of_turn>'],
        }),
        signal: AbortSignal.timeout(45_000),
      });
      if (!res.ok) return null;
      const j = await res.json();
      const out = (j.choices?.[0]?.text ?? '').trim();
      return out || null;
    } catch { return null; }
  }

  // Tier 2: Ollama /api/chat (fallback — competes with TurboQuant for VRAM
  // but doesn't always need the same KV state).
  async function callOllama() {
    try {
      const res = await fetch(`${OLLAMA_URL}/api/chat`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model:    LLM_MODEL,
          messages: [{ role: 'user', content: prompt }],
          stream:   false,
          options:  { temperature: 0.3, num_predict: 600 },
        }),
        signal: AbortSignal.timeout(30_000),
      });
      if (!res.ok) return null;
      const j = await res.json();
      const out = (j.message?.content ?? j.response ?? '').trim();
      return out || null;
    } catch { return null; }
  }

  const tq = await callTurboQuant();
  if (tq) return tq;
  if (!STDOUT) console.warn('   ⚠ TurboQuant rerank empty — falling back to Ollama');
  const ol = await callOllama();
  if (ol) return ol;
  return null;
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

  // ── Adaptive guard: input-hash short-circuit ──────────────────────────────
  // Fingerprint the inputs that would change the markdown output: counts of
  // each signal source + the top-LIMIT file paths (sorted, with blend).
  // If unchanged from last run, skip the Gemma4 rerank AND the file write —
  // return the cached markdown from Redis ace:todo:latest unchanged. Bypass
  // with --force when you want to regenerate regardless.
  const force = args.includes('--force');
  let inputHash = null;
  if (!DRY_RUN && !force && redis) {
    const { createHash } = await import('node:crypto');
    const sig = top.map(e => `${e.file}:${e.blend.toFixed(3)}`).join('|');
    inputHash = createHash('sha1')
      .update(`v1:${Object.keys(redisSignals.authority).length}:${Object.keys(redisSignals.karpathy).length}:${redisSignals.dirty.length}:${agentsRules.length}:${LIMIT}:${sig}`)
      .digest('hex')
      .slice(0, 16);
    const lastHash = await redis.hget('ace:todo:meta', 'input_hash').catch(() => null);
    if (lastHash === inputHash) {
      const cached = await redis.get('ace:todo:latest').catch(() => null);
      if (cached) {
        if (STDOUT) {
          process.stdout.write(cached);
        } else {
          console.log(`   inputs unchanged (hash=${inputHash}) — returning cached ace:todo:latest`);
          console.log(`   Pass --force to regenerate. File at next_steps/active/codebase-todo-recommendations.md kept.`);
        }
        await redis.quit().catch(() => {});
        return;
      }
    }
  }

  // Gemma4 rerank
  if (!STDOUT) console.log(`\n   Running Gemma4 rerank…`);
  const reranked = await gemma4Rerank(top, agentsRules, timelineMd);

  // Build markdown output
  const now = new Date().toISOString().slice(0, 19) + 'Z';
  const lines = [
    '# Codebase TODO Recommendations',
    '',
    '> **This file is auto-generated** by `npm run skill:codebase-todo`.',
    '> For human-edited planning + commentary, see [`2026-05-08_pipeline-driven-next-actions.md`](./2026-05-08_pipeline-driven-next-actions.md).',
    '>',
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
      const path = e.displayPath || e.file;
      return `| ${i + 1} | \`${path}\` | ${e.blend.toFixed(3)} | ${(e.pagerank ?? 0).toFixed(2)} | ${(e.authority ?? 0).toFixed(2)} | ${(e.attention ?? 0).toFixed(2)} | ${e.isDirty ? 'Y' : '·'} | ${reasons} |`;
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
          // Cache the rendered markdown directly so the adaptive guard above
          // can return it byte-for-byte without re-rendering. Plus a JSON
          // metadata sidecar for callers that want the structured form.
          const pipe = redis.pipeline();
          pipe.setex('ace:todo:latest', 24 * 3600, lines);
          pipe.setex('ace:todo:meta:json', 24 * 3600, JSON.stringify({
            generatedAt: now,
            top:         top.slice(0, LIMIT),
            agentsRules: agentsRules.slice(0, 10),
            rerank:      reranked ?? null,
            inputHash:   inputHash ?? '',
          }));
          if (inputHash) {
            pipe.hset('ace:todo:meta', { input_hash: inputHash, generated_at: now });
            pipe.expire('ace:todo:meta', 24 * 3600);
          }
          await pipe.exec();
          console.log(`   ✓ Redis ace:todo:{latest,meta,meta:json} (24h TTL)`);
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
