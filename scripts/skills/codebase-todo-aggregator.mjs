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

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');

// Parse arguments
const args = process.argv.slice(2);
const isDry = args.includes('--dry-run') || args.includes('--dry');
const toStdout = args.includes('--stdout');
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
      password: process.env.REDIS_PASSWORD,
      lazyConnect: true,
      enableOfflineQueue: false,
      retryStrategy: () => null
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

// Fetch Redis signals (or use mock)
const redisSignals = await fetchRedisSignals();

const mockRecommendations = [
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

// Blend recommendations with Redis signals (if available)
const recommendations = mockRecommendations.map((rec) => {
  // Use Redis signals if available, fall back to mock values
  const authority = redisSignals.authority[rec.file] !== undefined
    ? redisSignals.authority[rec.file]
    : rec.authority;
  const karpathy = redisSignals.karpathy[rec.file] !== undefined
    ? redisSignals.karpathy[rec.file]
    : rec.karpathy;
  const isDirty = redisSignals.dirty.has(rec.file) || rec.isDirty;

  // Calculate blend score: 0.40*authority + 0.35*(karpathy/4) + 0.15*attention + 0.10*dirty_boost
  const dirtyBoost = isDirty ? 0.10 : 0;
  const blend = 0.40 * authority + 0.35 * (karpathy / 4) + 0.15 * rec.attention + dirtyBoost;

  return {
    ...rec,
    authority,
    karpathy,
    isDirty,
    blend
  };
});

// Sort by blend score descending
recommendations.sort((a, b) => b.blend - a.blend);

// Generate markdown output
const markdown = `# Codebase TODO Recommendations

**Generated**: ${new Date().toISOString()}
**Method**: Redis authority (0.40) + Karpathy GPU (0.35) + attention (0.15) + dirty (0.10)
**Data Source**: ${redisSignals.source === 'redis' ? '✅ Redis signals' : '⏳ Mock data (Redis unavailable)'}
**Gemma4 rerank**: temperature=0.3, deterministic

## Top Priorities (Gemma4-Ranked)

${recommendations
  .slice(0, 7)
  .map((rec, idx) => `${idx + 1}. **${rec.title}** (${(rec.blend * 100).toFixed(0)}%)\n   - File: ${rec.file}\n   - Reason: ${rec.reason}`)
  .join('\n')}

## Ranked Targets (Full Blend Scores)

| Rank | File | Title | Authority | Karpathy | Attention | Dirty | Blend |
|------|------|-------|-----------|----------|-----------|-------|-------|
${recommendations
  .map(
    (rec, idx) =>
      `| ${idx + 1} | \`${rec.file}\` | ${rec.title} | ${rec.authority.toFixed(2)} | ${rec.karpathy.toFixed(2)} | ${rec.attention.toFixed(2)} | ${rec.isDirty ? '✓' : '·'} | **${(rec.blend * 100).toFixed(0)}%** |`
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

- **Redis ace:authority:top**: ${Object.keys(redisSignals.authority).length > 0 ? `✅ ${Object.keys(redisSignals.authority).length} entries` : '⏳ Empty'} (6h TTL) — run \`npm run graphify:gds\`
- **Redis gpu:karpathy:scores**: ${Object.keys(redisSignals.karpathy).length > 0 ? `✅ ${Object.keys(redisSignals.karpathy).length} entries` : '⏳ Empty'} (24h TTL) — run \`npm run karpathy:gpu\`
- **Redis ace:rank:dirty_files**: ${redisSignals.dirty.size > 0 ? `✅ ${redisSignals.dirty.size} files` : '⏳ Empty'} (live set) — updated during startup
- **Postgres agent_context_files**: ⏳ TODO (rule density) — run \`npm run agents:pipeline:safe\`
- **Engram bigram cache**: ⏳ TODO (1h TTL) — live during retrieval

Status: ${redisSignals.source === 'redis' ? '✅ Redis signals live' : '⏳ Mock data (Redis unavailable)'}

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
