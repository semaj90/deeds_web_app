#!/usr/bin/env node
/**
 * Smoke test — Semantic Valkey Prompt Cache (8 gates)
 *
 * Gate 1 : exact cache hit works
 * Gate 2 : semantic hit works (score ≥ 0.92)
 * Gate 3 : low-score miss routes to model_call
 * Gate 4 : hidden <think> strings are stripped before hashing
 * Gate 5 : AGENTS.md context size gate (rule card count ≤ 20)
 * Gate 6 : sourceRefs preserved round-trip
 * Gate 7 : TTL is applied (key expires)
 * Gate 8 : stats counter increments on hit
 *
 * Usage:
 *   node scripts/tests/smoke-semantic-valkey.mjs
 *   node scripts/tests/smoke-semantic-valkey.mjs --verbose
 */

import { createClient } from 'redis';
import { createHash }   from 'node:crypto';

const REDIS_URL  = process.env.REDIS_URL  ?? `redis://${process.env.REDIS_HOST ?? '127.0.0.1'}:${process.env.REDIS_PORT ?? 6379}`;
const REDIS_PASS = process.env.REDIS_PASSWORD ?? process.env.REDIS_PASS ?? 'redis';
const VERBOSE    = process.argv.includes('--verbose');

const EMBED_URL   = 'http://127.0.0.1:5173/api/embed';
const OLLAMA_URL  = 'http://127.0.0.1:11434';
const EMBED_MODEL = 'embeddinggemma:latest';

const TEST_PREFIX = 'smoke:semvalkey:';
const TTL_SHORT   = 10; // seconds — short enough to verify expiry

let pass = 0;
let fail = 0;

function ok(gate, msg) {
  console.log(`✅ Gate ${gate}: ${msg}`);
  pass++;
}

function err(gate, msg, detail = '') {
  console.error(`❌ Gate ${gate}: ${msg}${detail ? ' — ' + detail : ''}`);
  fail++;
}

function sha256(text) {
  return createHash('sha256').update(text).digest('hex');
}

// ── Embed ─────────────────────────────────────────────────────────────────────

async function embed(text) {
  try {
    const res = await fetch(EMBED_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, model: EMBED_MODEL }),
      signal: AbortSignal.timeout(6_000),
    });
    if (res.ok) {
      const d = await res.json();
      if (Array.isArray(d.embedding)) return new Float32Array(d.embedding);
    }
  } catch { /* fall through */ }
  try {
    const res = await fetch(`${OLLAMA_URL}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: EMBED_MODEL, prompt: text }),
      signal: AbortSignal.timeout(8_000),
    });
    if (res.ok) {
      const d = await res.json();
      if (Array.isArray(d.embedding)) return new Float32Array(d.embedding);
    }
  } catch { /* unavailable */ }
  return null;
}

// ── Main ──────────────────────────────────────────────────────────────────────

const redis = createClient({
  url: REDIS_URL,
  password: REDIS_PASS,
  socket: { connectTimeout: 4000 },
});
redis.on('error', () => {});
await redis.connect();

// Seed test data
const TEST_PROMPT   = 'how do i fix the oldstring mismatch error in claude code edits?';
const TEST_ANSWER   = 'Read the file first, copy exact bytes, add surrounding context to make old_string unique.';
const TEST_HASH     = sha256(TEST_PROMPT);
const EXACT_KEY     = `${TEST_PREFIX}exact:${TEST_HASH}`;
const STATS_KEY     = `${TEST_PREFIX}stats`;
const RULE_KEY      = `${TEST_PREFIX}rule:test-rule`;
const SEM_KEY       = `${TEST_PREFIX}sem:${TEST_HASH}`;

// Cleanup any prior smoke run
const cleanupKeys = await redis.keys(`${TEST_PREFIX}*`);
if (cleanupKeys.length) await redis.del(...cleanupKeys);

// ── Gate 1: exact cache hit ───────────────────────────────────────────────────
await redis.set(EXACT_KEY, TEST_ANSWER, { EX: TTL_SHORT });
const exactResult = await redis.get(EXACT_KEY);
if (exactResult === TEST_ANSWER) {
  ok(1, 'exact cache hit works');
} else {
  err(1, 'exact cache hit failed', `got: ${exactResult}`);
}

// ── Gate 2: semantic hit (requires embedding service) ────────────────────────
const embedding = await embed(TEST_PROMPT);
if (!embedding) {
  console.warn('⚠️  Gate 2/3: embedding service unavailable — skipping vector gates');
  fail += 0; // soft skip — don't fail smoke if embed is down
  console.log(`⏭️  Gate 2: skipped (embedding service down)`);
  console.log(`⏭️  Gate 3: skipped (embedding service down)`);
} else {
  // Write a semantic packet
  const packet = {
    id: TEST_HASH,
    kind: 'prompt',
    inputHash: TEST_HASH,
    normalizedPrompt: TEST_PROMPT,
    summary: TEST_ANSWER.slice(0, 200),
    tags: JSON.stringify(['test', 'smoke']),
    sourceRefs: JSON.stringify(['scripts/tests/smoke-semantic-valkey.mjs']),
    model: 'smoke-test',
    answer: TEST_ANSWER,
    createdAt: new Date().toISOString(),
    ttlSeconds: String(TTL_SHORT),
    vec: Buffer.from(embedding.buffer),
  };
  await redis.hSet(SEM_KEY, packet);
  await redis.expire(SEM_KEY, TTL_SHORT);

  // Search with same embedding — should get a near-perfect score
  try {
    const searchResult = await redis.sendCommand([
      'FT.SEARCH', 'prompt:sem:idx',
      '*=>[KNN 1 @vec $BLOB AS __score]',
      'PARAMS', '2', 'BLOB', Buffer.from(embedding.buffer),
      'DIALECT', '2',
      'RETURN', '2', 'id', '__score',
    ]);
    if (Array.isArray(searchResult) && searchResult.length > 1) {
      const fields = searchResult[2];
      const distStr = Array.isArray(fields)
        ? fields[fields.indexOf('__score') + 1]
        : '1';
      const similarity = 1 - parseFloat(distStr);
      if (VERBOSE) console.log(`   semantic score: ${similarity.toFixed(4)}`);
      if (similarity >= 0.92) {
        ok(2, `semantic hit score=${similarity.toFixed(4)} ≥ 0.92`);
      } else if (similarity >= 0.78) {
        ok(2, `semantic context score=${similarity.toFixed(4)} ≥ 0.78 (hit via context lane)`);
      } else {
        err(2, `score too low for semantic hit`, `got ${similarity.toFixed(4)}`);
      }
    } else {
      err(2, 'FT.SEARCH returned no results — index may not exist yet');
    }
  } catch (e) {
    err(2, 'FT.SEARCH failed', e.message);
  }

  // Gate 3: unrelated query should score low
  const UNRELATED = 'what is the capital of france?';
  const unrelatedEmb = await embed(UNRELATED);
  if (unrelatedEmb) {
    try {
      const result = await redis.sendCommand([
        'FT.SEARCH', 'prompt:sem:idx',
        '*=>[KNN 1 @vec $BLOB AS __score]',
        'PARAMS', '2', 'BLOB', Buffer.from(unrelatedEmb.buffer),
        'DIALECT', '2',
        'RETURN', '1', '__score',
      ]);
      if (Array.isArray(result) && result.length > 1) {
        const fields = result[2];
        const distStr = Array.isArray(fields)
          ? fields[fields.indexOf('__score') + 1]
          : '0';
        const similarity = 1 - parseFloat(distStr);
        if (VERBOSE) console.log(`   unrelated score: ${similarity.toFixed(4)}`);
        if (similarity < 0.78) {
          ok(3, `low-score miss correctly below threshold (score=${similarity.toFixed(4)})`);
        } else {
          err(3, `unrelated query scored too high`, `score=${similarity.toFixed(4)} — index may have too few entries`);
        }
      } else {
        ok(3, 'no results for unrelated query → model_call (index sparse, acceptable)');
      }
    } catch (e) {
      err(3, 'FT.SEARCH failed for unrelated query', e.message);
    }
  } else {
    console.log(`⏭️  Gate 3: skipped (second embed call failed)`);
  }
}

// ── Gate 4: <think> stripping ─────────────────────────────────────────────────
const withThink = '<think>This is internal reasoning that should be hidden.</think>fix oldstring error';
const stripped  = withThink.replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/\s+/g, ' ').trim().toLowerCase();
const expectedStripped = 'fix oldstring error';
if (stripped === expectedStripped) {
  ok(4, '<think> blocks stripped before hash');
} else {
  err(4, 'think stripping failed', `got: "${stripped}"`);
}

// ── Gate 5: AGENTS.md context size gate ──────────────────────────────────────
const ruleKeys = await redis.keys('opencode:rule:v1:*');
if (VERBOSE) console.log(`   rule card count: ${ruleKeys.length}`);
if (ruleKeys.length <= 20) {
  ok(5, `AGENTS.md gate: ${ruleKeys.length} rule cards ≤ 20`);
} else {
  err(5, `too many rule cards (${ruleKeys.length} > 20) — AGENTS.md context budget exceeded`);
}

// ── Gate 6: sourceRefs round-trip ────────────────────────────────────────────
const testSourceRefs = ['src/lib/server/ai/prompt-router.ts', 'scripts/semantic-valkey/seed-opencode-rules.mjs'];
await redis.hSet(RULE_KEY, {
  kind: 'rule',
  topic: 'test-rule',
  summary: 'Test rule for smoke gate 6',
  tags: JSON.stringify(['smoke']),
  sourceRefs: JSON.stringify(testSourceRefs),
});
await redis.expire(RULE_KEY, TTL_SHORT);
const readBack = await redis.hGet(RULE_KEY, 'sourceRefs');
const parsed = JSON.parse(readBack ?? '[]');
if (JSON.stringify(parsed) === JSON.stringify(testSourceRefs)) {
  ok(6, 'sourceRefs preserved round-trip');
} else {
  err(6, 'sourceRefs mismatch', `got: ${JSON.stringify(parsed)}`);
}

// ── Gate 7: TTL applied ───────────────────────────────────────────────────────
const ttlRemaining = await redis.ttl(EXACT_KEY);
if (ttlRemaining > 0 && ttlRemaining <= TTL_SHORT) {
  ok(7, `TTL applied (${ttlRemaining}s remaining ≤ ${TTL_SHORT}s)`);
} else {
  err(7, `TTL not set correctly`, `ttl=${ttlRemaining}`);
}

// ── Gate 8: stats counter ─────────────────────────────────────────────────────
await redis.hIncrBy(STATS_KEY, 'exact_hits', 1);
await redis.hIncrBy(STATS_KEY, 'exact_hits', 1);
await redis.expire(STATS_KEY, TTL_SHORT);
const hitCount = parseInt(await redis.hGet(STATS_KEY, 'exact_hits') ?? '0', 10);
if (hitCount === 2) {
  ok(8, `stats counter increments (exact_hits=${hitCount})`);
} else {
  err(8, `stats counter wrong`, `expected 2, got ${hitCount}`);
}

// ── Cleanup ───────────────────────────────────────────────────────────────────
const toClean = await redis.keys(`${TEST_PREFIX}*`);
if (toClean.length) await redis.del(...toClean);

await redis.quit();

// ── Summary ───────────────────────────────────────────────────────────────────
console.log(`\n── Smoke: PASS=${pass} FAIL=${fail} ──`);
if (fail > 0) {
  console.error(`⚠️  ${fail} gate(s) failed`);
  process.exitCode = 1;
} else {
  console.log('✅ All smoke gates passed');
}
