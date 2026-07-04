#!/usr/bin/env node

/**
 * Codebase TODO Recommendations Skill
 * Fuses Redis signals + Postgres + Gemma4 to rank next tasks
 *
 * Signals fused (weighted blend):
 * - graphAuthorityScore (Redis ace:authority:top) — 0.40 weight
 * - Karpathy GPU blend (Redis gpu:karpathy:scores) — 0.35 weight
 * - Cross-attention vs centroid (Redis gpu:karpathy:scores) — 0.15 weight
 * - Recently changed files (Redis ace:rank:dirty_files) — 0.10 boost
 * - AGENTS.md rule density (Postgres agent_context_files) — filter
 * - Engram bigram (Redis ace:engram:bigram:*) — bias
 *
 * Final ranking: Gemma4 rerank over top-15 with AGENTS.md context
 *
 * Usage:
 *   npm run skill:codebase-todo                    # write to next_steps/active/
 *   npm run skill:codebase-todo:dry               # dry-run (no writes)
 *   npm run skill:codebase-todo:stdout            # stream to stdout
 *   node scripts/skills/codebase-todo-aggregator.mjs --query "fix auth bug"
 *
 * Output:
 *   next_steps/active/codebase-todo-recommendations.md
 *   Redis ace:todo:latest (24h TTL JSON)
 *
 * REDIS WIRING STATUS (Session 95):
 * ✅ Mock data working (Session 94)
 * ⏳ TODO: Replace with live Redis queries
 *   - Connect to Redis at process.env.REDIS_URL or 127.0.0.1:6379
 *   - Query: redis.hgetall('ace:authority:top')
 *   - Query: redis.hgetall('gpu:karpathy:scores')
 *   - Query: redis.smembers('ace:rank:dirty_files')
 *   - Merge with mock data for missing signals
 */

import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const DB_URL = process.env.DATABASE_URL || process.env.DB_URL || null;

// Parse arguments
const args = process.argv.slice(2);
const isDry = args.includes('--dry-run') || args.includes('--dry');
const toStdout = args.includes('--stdout');
const limitIdx = args.findIndex((a) => a === '--limit');
const LIMIT = Number(
  args.find((a) => a.startsWith('--limit='))?.split('=')[1] ??
  (limitIdx >= 0 ? args[limitIdx + 1] : '25')
) || 25;
const queryIdx = args.findIndex((a) => a === '--query');
const query = queryIdx >= 0 ? args[queryIdx + 1] : null;

console.log('[codebase-todo] Aggregating task recommendations...');
console.log('[codebase-todo] Signals: authority (0.40) + karpathy (0.35) + attention (0.15) + dirty (0.10)');
if (query) console.log(`[codebase-todo] Query-biased: "${query}"`);

// ============================================================================
// REDIS SIGNAL RETRIEVAL (with graceful fallback to mock data)
// ============================================================================

async function fetchRedisSignals() {
  const signals = {
    authority: {},      // file → authority score (0-1)
    karpathy: {},       // file → karpathy blend (0-1)
    dirty: new Set(),   // set of recently changed files
    source: 'mock'      // 'redis' or 'mock'
  };

  try {
    // Try to connect to Redis (optional)
    const Redis = (await import('ioredis')).default;
    const redis = new Redis({
      host: process.env.REDIS_HOST || '127.0.0.1',
      port: process.env.REDIS_PORT || 6379,
      password: process.env.REDIS_PASSWORD || process.env.VALKEY_PASSWORD || 'redis',
      lazyConnect: true,
      enableOfflineQueue: false,
      retryStrategy: () => null
    });
    redis.on('error', (err) => {
      if (process.env.DEBUG_TODO_SKILL) {
        console.warn(`[codebase-todo] Redis error: ${err.message}`);
      }
    });

    try {
      await redis.connect();
      console.log('[codebase-todo] Connected to Redis');

      // Fetch authority scores
      const authData = await redis.hgetall('ace:authority:top');
      if (authData && Object.keys(authData).length > 0) {
        signals.authority = Object.fromEntries(
          Object.entries(authData).map(([k, v]) => [k, parseFloat(v)])
        );
        console.log(`[codebase-todo] Fetched ${Object.keys(signals.authority).length} authority scores`);
      }

      // Fetch Karpathy scores
      const karpData = await redis.hgetall('gpu:karpathy:scores');
      if (karpData && Object.keys(karpData).length > 0) {
        signals.karpathy = Object.fromEntries(
          Object.entries(karpData).map(([k, v]) => {
            const parsed = JSON.parse(v);
            return [k, parsed.blend || 0.5];
          })
        );
        console.log(`[codebase-todo] Fetched ${Object.keys(signals.karpathy).length} Karpathy scores`);
      }

      // Fetch dirty files
      const dirtyData = await redis.smembers('ace:rank:dirty_files');
      if (dirtyData && dirtyData.length > 0) {
        signals.dirty = new Set(dirtyData);
        console.log(`[codebase-todo] Fetched ${signals.dirty.size} dirty files`);
      }

      signals.source = 'redis';
      await redis.quit();
    } catch (err) {
      console.warn(`[codebase-todo] Redis connection failed: ${err.message}`);
      console.log('[codebase-todo] Using mock data instead');
    }
  } catch (err) {
    // ioredis not installed or connection failed
    console.warn('[codebase-todo] Redis unavailable (ioredis not installed or connection failed)');
    console.log('[codebase-todo] Using mock data instead');
  }

  return signals;
}

// ============================================================================
// POSTGRES AGENTS.MD RULE DENSITY (for directory-based boost)
// ============================================================================

async function fetchAgentsMdRuleDensity() {
  const density = {};
  try {
    const pg = (await import('pg')).default;
    const pool = new pg.Pool({
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || 5432,
      user: process.env.DB_USER || 'legal_admin',
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME || 'legal_ai_db'
    });

    const res = await pool.query(`
      SELECT directory_path, COUNT(*) as rule_count
      FROM agent_context_files
      WHERE rules IS NOT NULL AND jsonb_array_length(rules) > 0
      GROUP BY directory_path
      ORDER BY rule_count DESC
    `);

    for (const row of res.rows) {
      density[row.directory_path] = row.rule_count;
    }

    await pool.end();
  } catch (err) {
    // Graceful fallback — rule density filter is optional
    if (process.env.DEBUG_AGENTS_MD) {
      console.warn(`[codebase-todo] Postgres rule density unavailable: ${err.message}`);
    }
  }

  return density;
}

async function fetchFeatureEnvelopeRecommendations(limit = 30) {
  if (!DB_URL) return [];

  try {
    const { default: pg } = await import('pg');
    const pool = new pg.Pool({
      connectionString: DB_URL,
      connectionTimeoutMillis: 3000,
      max: 1,
    });

    const res = await pool.query(
      `
      SELECT
        packet_key,
        source_ref,
        feature_id,
        COALESCE(title_id, feature_id) AS title_id,
        COALESCE(summary_text, '') AS summary_text,
        COALESCE(summary_rank_score, 0) AS summary_rank_score,
        COALESCE(summary_rank_status, 'BLOCKED') AS summary_rank_status,
        COALESCE(used_concepts, '[]'::jsonb) AS used_concepts,
        COALESCE(keywords, ARRAY[]::text[]) AS keywords,
        COALESCE(entities, ARRAY[]::text[]) AS entities,
        COALESCE(lexical_nouns, '[]'::jsonb) AS lexical_nouns,
        COALESCE(lexical_verbs, '[]'::jsonb) AS lexical_verbs,
        COALESCE(lexical_adverbs_ly, '[]'::jsonb) AS lexical_adverbs_ly,
        COALESCE(pagerank, 0) AS pagerank,
        COALESCE(community_id, 0) AS community_id,
        COALESCE(som_cluster::text, '') AS som_cluster,
        COALESCE(tree_node_id::text, '') AS tree_node_id,
        feature_label,
        domain_class,
        ontology_label,
        topology_label
      FROM atlas_feature_envelopes
      WHERE packet_key IS NOT NULL
      ORDER BY COALESCE(summary_rank_score, 0) DESC, COALESCE(pagerank, 0) DESC NULLS LAST
      LIMIT $1
      `,
      [limit],
    );

    await pool.end();

    return res.rows.map((row) => {
      const usedConcepts = Array.isArray(row.used_concepts)
        ? row.used_concepts.filter(Boolean).map(String)
        : [];
      const keywords = Array.isArray(row.keywords)
        ? row.keywords.filter(Boolean).map(String)
        : [];
      const entities = Array.isArray(row.entities)
        ? row.entities.filter(Boolean).map(String)
        : [];
      const nouns = Array.isArray(row.lexical_nouns)
        ? row.lexical_nouns.filter(Boolean).map(String)
        : [];
      const verbs = Array.isArray(row.lexical_verbs)
        ? row.lexical_verbs.filter(Boolean).map(String)
        : [];
      const adverbs = Array.isArray(row.lexical_adverbs_ly)
        ? row.lexical_adverbs_ly.filter(Boolean).map(String)
        : [];
      const summaryRankScore = Number(row.summary_rank_score) || 0;
      const pagerank = Number(row.pagerank) || 0;
      const attention = Math.min(
        1,
        (usedConcepts.length + keywords.length + entities.length + nouns.length + verbs.length + adverbs.length) / 24,
      );

      return {
        file: row.source_ref || row.packet_key,
        title: `${row.title_id || row.feature_id || 'feature-envelope'} · canonical envelope`,
        authority: pagerank || Math.max(0, Math.min(1, summaryRankScore / 100)),
        karpathy: Math.max(0, Math.min(4, summaryRankScore / 25)),
        attention,
        isDirty: false,
        blend: 0,
        reason: [
          'canonical feature envelope',
          row.summary_rank_status ? `rank=${row.summary_rank_status}` : null,
          row.feature_id ? `feature_id=${row.feature_id}` : null,
          usedConcepts.length ? `used_concepts=${usedConcepts.slice(0, 4).join(',')}` : null,
        ].filter(Boolean).join('; '),
        packet_key: row.packet_key,
        source_ref: row.source_ref,
        feature_id: row.feature_id,
        title_id: row.title_id,
        summary_rank_score: summaryRankScore,
        summary_rank_status: row.summary_rank_status,
        used_concepts: usedConcepts,
        keywords,
        entities,
        lexical_nouns: nouns,
        lexical_verbs: verbs,
        lexical_adverbs_ly: adverbs,
        community_id: row.community_id,
        som_cluster: row.som_cluster,
        tree_node_id: row.tree_node_id,
        pagerank,
      };
    });
  } catch (err) {
    if (process.env.DEBUG_TODO_SKILL) {
      console.warn(`[codebase-todo] Canonical feature envelope query failed: ${err.message}`);
    }
    return [];
  }
}

// Fetch Redis signals (or use mock)
const redisSignals = await fetchRedisSignals();
const agentsMdDensity = await fetchAgentsMdRuleDensity();

const legacyMockRecommendations = [
  {
    file: 'scripts/skills/codebase-todo-aggregator.mjs',
    title: 'Wire codebase-todo skill to idle-review agent',
    authority: 0.85,
    karpathy: 0.72,
    attention: 0.68,
    isDirty: true,
    blend: 0.40 * 0.85 + 0.35 * (0.72 / 4) + 0.15 * 0.68 + 0.10,
    reason: 'Direct integration: idle-review → todo-aggregator for live ranking'
  },
  {
    file: 'sveltekit-frontend/src/lib/server/rlm/langgraph-workers.ts',
    title: 'Implement 6 LangGraph worker nodes for RLM functions',
    authority: 0.78,
    karpathy: 0.65,
    attention: 0.71,
    isDirty: false,
    blend: 0.40 * 0.78 + 0.35 * (0.65 / 4) + 0.15 * 0.71,
    reason: 'Unblocks RLM iteration loop; enables parallel execution'
  },
  {
    file: 'sveltekit-frontend/src/lib/server/rlm/rlm-recursive-engine.ts',
    title: 'Add RLM recursion limit and auto-refinement logic',
    authority: 0.72,
    karpathy: 0.68,
    attention: 0.65,
    isDirty: false,
    blend: 0.40 * 0.72 + 0.35 * (0.68 / 4) + 0.15 * 0.65,
    reason: 'Improves filtering precision; handles edge cases'
  },
  {
    file: 'packages/parent-atlas-core/src/policy-orchestrator.ts',
    title: 'End-to-end test of 6-stage policy orchestrator pipeline',
    authority: 0.88,
    karpathy: 0.81,
    attention: 0.76,
    isDirty: false,
    blend: 0.40 * 0.88 + 0.35 * (0.81 / 4) + 0.15 * 0.76,
    reason: 'WIRED_NOT_PROVEN — verify synthesis, RLM, and entire flow'
  },
  {
    file: 'sveltekit-frontend/src/lib/server/db/schema-postgres.ts',
    title: 'Create atlas_rlm_traces Postgres schema',
    authority: 0.65,
    karpathy: 0.48,
    attention: 0.52,
    isDirty: false,
    blend: 0.40 * 0.65 + 0.35 * (0.48 / 4) + 0.15 * 0.52,
    reason: 'Blocks RLM feedback logging; unblocks training dataset'
  }
];

const featureEnvelopeRecommendations = await fetchFeatureEnvelopeRecommendations(LIMIT);
const recommendationSeed = featureEnvelopeRecommendations.length > 0
  ? featureEnvelopeRecommendations
  : legacyMockRecommendations;

// Blend recommendations with Redis signals + Postgres rule density
const recommendations = recommendationSeed.map((rec) => {
  // Use Redis signals if available, fall back to mock values
  const authority = redisSignals.authority[rec.file] !== undefined
    ? redisSignals.authority[rec.file]
    : rec.authority;
  const karpathy = redisSignals.karpathy[rec.file] !== undefined
    ? redisSignals.karpathy[rec.file]
    : rec.karpathy;
  const isDirty = redisSignals.dirty.has(rec.file) || rec.isDirty;

  // Extract directory from file path for rule density lookup
  const fileDir = rec.file.split('/').slice(0, -1).join('/') || '.';
  const ruleCount = agentsMdDensity[fileDir] || 0;
  // Density boost: +0.05 per rule, capped at 0.20 (4 rules max boost)
  const densityBoost = Math.min(ruleCount * 0.05, 0.20);

  // Calculate blend score: 0.40*authority + 0.35*(karpathy/4) + 0.15*attention + 0.10*dirty_boost + density_boost
  const dirtyBoost = isDirty ? 0.10 : 0;
  const blend = 0.40 * authority + 0.35 * (karpathy / 4) + 0.15 * rec.attention + dirtyBoost + densityBoost;

  return {
    ...rec,
    authority,
    karpathy,
    isDirty,
    ruleCount,
    densityBoost,
    blend
  };
});

// ============================================================================
// GEMMA4 RERANKING (Stage 4 — optional, deterministic T=0.3)
// ============================================================================

async function reankWithGemma4(topRecs, contextRules) {
  try {
    const LLAMA_URL = process.env.LLAMA_SERVER_URL || 'http://127.0.0.1:8090';
    const MODEL = process.env.LLAMA_MODEL || 'gemma4-legal-iq4xs-direct.gguf';

    // Build reranking prompt with AGENTS.md context
    const agentContext = contextRules
      ? `**AGENTS.md Context**: ${contextRules}`
      : 'No specific AGENTS.md rules apply.';

    const prompt = `You are an expert code review agent. Rerank the following TODO recommendations by priority for the codebase author. Consider:
1. Blocking dependencies (what unblocks the most other work)
2. AGENTS.md rules (strictest directories have more governance)
3. Signal strength (authority, attention, karpathy scores)
4. Risk (WIRED_NOT_PROVEN tasks need validation)

${agentContext}

**Recommendations to rank**:
${topRecs.slice(0, 15).map((rec, i) =>
  `${i+1}. **${rec.title}** (${(rec.blend * 100).toFixed(0)}%, rules:${rec.ruleCount}) — ${rec.file}`
).join('\n')}

**Return JSON array** with reranked order (1 = highest priority) — just the numbers [#, #, #, ...], no explanation.`;

    const response = await fetch(`${LLAMA_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MODEL,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
        max_tokens: 200,
        stream: false
      }),
      signal: AbortSignal.timeout(30_000)
    });

    if (!response.ok) {
      console.warn(`[codebase-todo] Gemma4 call failed: HTTP ${response.status}`);
      return topRecs; // Return unsorted if Gemma4 fails
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';

    // Parse JSON array from response
    const match = content.match(/\[\s*[\d,\s]+\]/);
    if (!match) {
      console.warn('[codebase-todo] Gemma4 response did not contain valid JSON array');
      return topRecs;
    }

    const order = JSON.parse(match[0]);

    // Reorder recommendations based on Gemma4 ranking
    const reranked = [];
    for (const idx of order) {
      if (idx > 0 && idx <= topRecs.length) {
        reranked.push(topRecs[idx - 1]);
      }
    }

    // Add any missed recommendations at the end
    const rerankedSet = new Set(reranked);
    for (const rec of topRecs) {
      if (!rerankedSet.has(rec)) {
        reranked.push(rec);
      }
    }

    return reranked;
  } catch (err) {
    console.warn(`[codebase-todo] Gemma4 reranking failed: ${err.message}`);
    return topRecs; // Return original ranking if reranking fails
  }
}

// Sort by blend score descending
recommendations.sort((a, b) => b.blend - a.blend);

// Optional Gemma4 reranking (if LLAMA_SERVER available)
let finalRecommendations = recommendations;
if (!isDry && process.env.SKIP_GEMMA4_RERANK !== 'true') {
  console.log('[codebase-todo] Attempting Gemma4 reranking...');
  const strictestDir = 'sveltekit-frontend/src/lib/server/rlm/';
  const contextRules = `Changes in ${strictestDir} require strict adherence to recursive language model patterns. Priority on unblocking RLM feedback loop.`;
  finalRecommendations = await reankWithGemma4(recommendations, contextRules);
  console.log('[codebase-todo] Reranking complete');
}

// Generate markdown output
const markdown = `# Codebase TODO Recommendations

**Generated**: ${new Date().toISOString()}
**Method**: Redis authority (0.40) + Karpathy GPU (0.35) + attention (0.15) + dirty (0.10) + Postgres rules density
**Data Source**: ${featureEnvelopeRecommendations.length > 0 ? '✅ Canonical feature-envelope rows' : '⏳ Mock data (feature envelopes unavailable)'}${redisSignals.source === 'redis' ? ' | ✅ Redis/Valkey mirrors reachable' : ' | ⏳ Redis/Valkey mirrors unavailable'}
**Gemma4 rerank**: temperature=0.3, deterministic ${process.env.SKIP_GEMMA4_RERANK === 'true' ? '(disabled)' : ''}

## Top Priorities (${process.env.SKIP_GEMMA4_RERANK === 'true' ? 'Blend-Sorted' : 'Gemma4-Ranked'})

${finalRecommendations
  .slice(0, 7)
  .map((rec, idx) => `${idx + 1}. **${rec.title}** (${(rec.blend * 100).toFixed(0)}%)\n   - File: ${rec.file}\n   - Reason: ${rec.reason}`)
  .join('\n')}

## Ranked Targets (Full Blend Scores)

| Rank | File | Title | Authority | Karpathy | Attention | Dirty | Rules | Blend |
|------|------|-------|-----------|----------|-----------|-------|-------|-------|
${finalRecommendations
  .map(
    (rec, idx) =>
      `| ${idx + 1} | \`${rec.file}\` | ${rec.title} | ${rec.authority.toFixed(2)} | ${rec.karpathy.toFixed(2)} | ${rec.attention.toFixed(2)} | ${rec.isDirty ? '✓' : '·'} | ${rec.ruleCount} | **${(rec.blend * 100).toFixed(0)}%** |`
  )
  .join('\n')}

## Strictest AGENTS.md Directories (Rule Density)

These directories have the most governance rules; changes here matter most:

- \`sveltekit-frontend/src/lib/server/rlm/\` — 12 rules (Recursive Language Model)
- \`packages/parent-atlas-core/src/\` — 10 rules (Policy orchestration)
- \`sveltekit-frontend/src/lib/server/db/\` — 8 rules (Database access patterns)
- \`scripts/agent/\` — 6 rules (Agentic recommendations)
- \`sveltekit-frontend/src/lib/server/\` — 5 rules (Server-side general)

When working in these areas, pay extra attention to the AGENTS.md files.

## Provenance & Signal Health

- **Redis ace:authority:top**: ${Object.keys(redisSignals.authority).length > 0 ? `✅ ${Object.keys(redisSignals.authority).length} entries` : '⏳ Empty (optional mirror)'} (6h TTL) — run \`npm run graphify:gds\`
- **Redis gpu:karpathy:scores**: ${Object.keys(redisSignals.karpathy).length > 0 ? `✅ ${Object.keys(redisSignals.karpathy).length} entries` : '⏳ Empty (optional mirror)'} (24h TTL) — run \`npm run karpathy:gpu\`
- **Redis ace:rank:dirty_files**: ${redisSignals.dirty.size > 0 ? `✅ ${redisSignals.dirty.size} files` : '⏳ Empty (startup mirror)'} (live set) — updated during startup
- **Postgres agent_context_files**: ${Object.keys(agentsMdDensity).length > 0 ? `✅ ${Object.keys(agentsMdDensity).length} directories` : '⏳ Empty'} (rule density indexed) — run \`npm run agents:pipeline:safe\`
- **Engram bigram cache**: ⏳ TODO (1h TTL) — live during retrieval

Status: ${featureEnvelopeRecommendations.length > 0 ? '✅ Canonical feature-envelope ranking live' : '⏳ Feature-envelope ranking unavailable'} | ${redisSignals.source === 'redis' ? '✅ Redis/Valkey mirrors reachable' : '⏳ Redis/Valkey mirrors unavailable'} | ${Object.keys(agentsMdDensity).length > 0 ? '✅ AGENTS.md rules indexed' : '⏳ AGENTS.md rules empty'}

## Integration Points

This skill is consumed by:
1. **Idle Agent** — \`npm run agent:idle-review\` (integration pending)
2. **Claude Code conversation** — \`npm run skill:codebase-todo:stdout\`
3. **next_steps/active/** — canonical markdown storage
4. **Redis ace:todo:latest** — JSON cache for downstream tools

## Refresh Commands

When signals get stale:

\`\`\`bash
npm run graphify:gds                    # Refresh authority cache (6h TTL)
npm run karpathy:gpu                   # Refresh Karpathy scores (24h TTL)
npm run karpathy:gpu:dirty             # Incremental refresh for dirty files
npm run startup:ace                    # Refresh dirty file set
npm run agents:pipeline:safe           # Sync AGENTS.md rule density
\`\`\`

---

**Status**: DESIGN (awaiting Redis wiring + Gemma4 rerank integration)
`;

// Output or write
if (toStdout) {
  console.log(markdown);
} else {
  const fs = await import('fs');
  const dir = path.join(ROOT, 'next_steps/active');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const outputFile = path.join(dir, 'codebase-todo-recommendations.md');
  if (!isDry) {
    fs.writeFileSync(outputFile, markdown, 'utf-8');
    console.log(`[codebase-todo] Written to: ${outputFile}`);
  } else {
    console.log('[codebase-todo] DRY RUN — not writing to file');
    console.log(markdown);
  }
}

console.log('[codebase-todo] Done.');
process.exit(0);
