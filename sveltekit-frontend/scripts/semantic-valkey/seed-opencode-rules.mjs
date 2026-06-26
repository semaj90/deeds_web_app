#!/usr/bin/env node
/**
 * Seed OpenCode rule/fix cards into Valkey.
 *
 * Cards are keyed as opencode:rule:v1:{topic} and opencode:fix:v1:{errorHash}.
 * These are plain HASH entries (no vector field) used for deterministic lookup
 * by topic name.  Semantic lookups go through the prompt:sem:v1:* index.
 *
 * Usage:
 *   node scripts/semantic-valkey/seed-opencode-rules.mjs
 *   node scripts/semantic-valkey/seed-opencode-rules.mjs --dry-run
 *   node scripts/semantic-valkey/seed-opencode-rules.mjs --embed   # also write vec entries
 */

import Redis from 'ioredis';
import { createHash } from 'node:crypto';

const REDIS_HOST = process.env.REDIS_HOST ?? '127.0.0.1';
const REDIS_PORT = process.env.REDIS_PORT ?? 6379;
const REDIS_PASS = process.env.REDIS_PASSWORD ?? process.env.REDIS_PASS ?? 'redis';
const DRY_RUN    = process.argv.includes('--dry-run');
const WITH_EMBED = process.argv.includes('--embed');
const TTL        = 86_400; // 24h

// ── Rule cards ────────────────────────────────────────────────────────────────
// Keep summaries ≤200 chars — they are injected directly into prompts.

const RULES = [
  {
    topic: 'tool-failure-proof',
    summary: 'Before editing, read the file. Use old_string large enough to be unique. Never guess content — verify with Read first.',
    tags: ['tool', 'edit', 'write', 'oldstring'],
  },
  {
    topic: 'no-file-unless-necessary',
    summary: 'Never create new files unless absolutely required. Prefer editing existing files. Never create *.md docs unless asked.',
    tags: ['files', 'docs', 'create'],
  },
  {
    topic: 'svelte5-runes-only',
    summary: 'Use Svelte 5 runes only: $state, $derived, $derived.by, $effect, $props, $bindable. No export let, $:, on:event, createEventDispatcher.',
    tags: ['svelte', 'runes', 'svelte5'],
  },
  {
    topic: 'hidden-thought-leak-guard',
    summary: 'Strip <think>…</think> blocks from any prompt before hashing or caching. Never surface reasoning tokens in user responses.',
    tags: ['gemma4', 'thinking', 'cache', 'security'],
  },
  {
    topic: 'unocss-no-dynamic-classes',
    summary: 'UnoCSS can only extract statically visible class strings. Never build class names from template literals or ternaries — use scoped <style> blocks instead.',
    tags: ['unocss', 'css', 'svelte'],
  },
  {
    topic: 'degraded-response-contract',
    summary: 'GET API routes must return the same JSON shape on error as on success. Use empty arrays/zeroes, not { error: "..." }, so clients never get undefined on top-level keys.',
    tags: ['api', 'error', 'json', 'contract'],
  },
  {
    topic: 'drizzle-safety-no-push',
    summary: 'Never run drizzle-kit push or apply DROP migrations without reviewing generated SQL. Use tablesFilter to protect DB-only tables.',
    tags: ['drizzle', 'migration', 'database', 'safety'],
  },
  {
    topic: 'ioredis-cold-start',
    summary: 'Standalone scripts need lazyConnect:true + retryStrategy:()=>null + offlineQueue:false + explicit connect() before ping. Never reuse a closed client.',
    tags: ['redis', 'ioredis', 'startup', 'scripts'],
  },
  {
    topic: 'gemma4-stream-true',
    summary: 'llama-server :8090 requires stream:true for Gemma4 — thinking block exhausts max_tokens before content appears with stream:false.',
    tags: ['gemma4', 'llm', 'streaming', 'llama-server'],
  },
  {
    topic: 'gemma4-think-false',
    summary: 'Ollama :11434 — always set think:false and num_predict:200 for Gemma4. Use data.message.content, not data.response.',
    tags: ['gemma4', 'ollama', 'think'],
  },
  {
    topic: 'docker-exec-not-node',
    summary: 'Use docker exec directly via Bash tool for DB/Redis ops. Never wrap in Node.js Docker SDK or child_process — causes OOM errors.',
    tags: ['docker', 'node', 'oom', 'database'],
  },
  {
    topic: 'agents-md-small',
    summary: 'Keep AGENTS.md under 80 lines. Route large context (rules, fixes, sourceRefs) through Semantic Valkey instead of stuffing into AGENTS.md.',
    tags: ['agents-md', 'opencode', 'context'],
  },
  {
    topic: 'git-diff-before-claiming-success',
    summary: 'Never claim implementation success without running git diff and verifying the actual change. Read files after Edit to confirm linter did not revert.',
    tags: ['git', 'verification', 'edit'],
  },
];

// ── Fix cards ─────────────────────────────────────────────────────────────────

const FIXES = [
  {
    errorHash: 'oldstring-mismatch',
    summary: 'old_string not found: read the file first, copy the exact bytes including whitespace, make old_string unique by adding surrounding context lines.',
    tags: ['edit', 'tool', 'oldstring'],
    sourceRefs: [],
  },
  {
    errorHash: 'linter-revert',
    summary: 'Linter reverted Edit — use Write tool with the full file content instead. Re-read after Write to verify changes survived.',
    tags: ['linter', 'edit', 'write'],
    sourceRefs: ['memory/ide-linter-workarounds.md'],
  },
  {
    errorHash: 'eaddrinuse-mcp',
    summary: 'EADDRINUSE on MCP port: old process still holds the port. Kill by PID, wait 1s, restart. Use type:http in mcp.json — never spawn a second server instance.',
    tags: ['mcp', 'port', 'startup'],
    sourceRefs: ['.vscode/mcp.json'],
  },
  {
    errorHash: 'python-port-theft-8791',
    summary: 'Port 8791 held by Python (turbovec-sidecar.py). Kill Python PID, start Node.js sidecar: node scripts/mcp/turbovec-sidecar-mcp.mjs',
    tags: ['turbovec', 'mcp', 'port', 'python'],
    sourceRefs: ['scripts/mcp/turbovec-sidecar-mcp.mjs'],
  },
  {
    errorHash: 'svelte4-export-let',
    summary: 'Replace export let x with let { x } = $props(). Replace $: doubled = x*2 with let doubled = $derived(x*2). No on:click — use onclick.',
    tags: ['svelte', 'svelte5', 'runes', 'migration'],
    sourceRefs: [],
  },
  {
    errorHash: 'drizzle-drop-warning',
    summary: 'Drizzle WARNING about dropping table with data: answer NO immediately. Add table to tablesFilter in drizzle.config.ts or declare it in schema.',
    tags: ['drizzle', 'database', 'migration', 'safety'],
    sourceRefs: ['sveltekit-frontend/drizzle.config.ts'],
  },
  {
    errorHash: 'ioredis-econnrefused',
    summary: 'ECONNREFUSED from ioredis in startup script: add lazyConnect:true, retryStrategy:()=>null, offlineQueue:false, then await redis.connect() before first command.',
    tags: ['ioredis', 'redis', 'startup', 'econnrefused'],
    sourceRefs: [],
  },
  {
    errorHash: 'uuid-integer-user-id',
    summary: 'user_id column is integer (post-2026-05-30 migration). Use Number(locals.user.id) in Drizzle eq() calls. String() only when passing to Lucia API.',
    tags: ['drizzle', 'user', 'uuid', 'integer', 'auth'],
    sourceRefs: [],
  },
];

// ── Embed helper (optional) ───────────────────────────────────────────────────

async function embedText(text) {
  try {
    const res = await fetch('http://127.0.0.1:5173/api/embed', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, model: 'embeddinggemma:latest' }),
      signal: AbortSignal.timeout(6_000),
    });
    if (res.ok) {
      const d = await res.json();
      if (Array.isArray(d.embedding)) return new Float32Array(d.embedding);
    }
  } catch { /* fall through */ }
  try {
    const res = await fetch('http://127.0.0.1:11434/api/embeddings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'embeddinggemma:latest', prompt: text }),
      signal: AbortSignal.timeout(8_000),
    });
    if (res.ok) {
      const d = await res.json();
      if (Array.isArray(d.embedding)) return new Float32Array(d.embedding);
    }
  } catch { /* embedding unavailable */ }
  return null;
}

// ── Seed ──────────────────────────────────────────────────────────────────────

const redis = new Redis({
  host: REDIS_HOST,
  port: REDIS_PORT,
  password: REDIS_PASS,
  connectTimeout: 4000,
  maxRetriesPerRequest: 1,
  enableOfflineQueue: false,
  retryStrategy: () => null,
  lazyConnect: true,
});
redis.on('error', () => {});
await redis.connect();

let written = 0;
let skipped = 0;

async function writeCard(key, fields) {
  if (DRY_RUN) {
    console.log(`[dry-run] HSET ${key} → ${fields.summary.slice(0, 60)}…`);
    skipped++;
    return;
  }
  await redis.hset(key, fields);
  await redis.expire(key, TTL);
  written++;
}

// Write rule cards
console.log('── Rule cards ──');
for (const rule of RULES) {
  const key = `opencode:rule:v1:${rule.topic}`;
  const fields = {
    kind: 'rule',
    topic: rule.topic,
    summary: rule.summary,
    tags: JSON.stringify(rule.tags),
    sourceRefs: JSON.stringify([]),
  };
  await writeCard(key, fields);

  // Optionally write semantic packet for vector search
  if (WITH_EMBED && !DRY_RUN) {
    const emb = await embedText(rule.summary);
    if (emb) {
      const id = `rule:${rule.topic}`;
      const semKey = `prompt:sem:v1:${id}`;
      const inputHash = createHash('sha256').update(rule.summary.toLowerCase()).digest('hex');
      await redis.hset(semKey, {
        id,
        kind: 'rule',
        inputHash,
        normalizedPrompt: rule.summary.toLowerCase(),
        summary: rule.summary.slice(0, 200),
        tags: rule.tags.join(','),
        sourceRefs: JSON.stringify([]),
        model: 'opencode',
        answer: '',
        createdAt: new Date().toISOString(),
        ttlSeconds: String(TTL),
        vec: Buffer.from(emb.buffer),
      });
      await redis.expire(semKey, TTL);
      console.log(`  ↳ vec written for rule:${rule.topic}`);
    }
  }
  console.log(`  ${DRY_RUN ? '[dry]' : '✅'} rule:${rule.topic}`);
}

// Write fix cards
console.log('── Fix cards ──');
for (const fix of FIXES) {
  const key = `opencode:fix:v1:${fix.errorHash}`;
  const fields = {
    kind: 'fix',
    topic: fix.errorHash,
    summary: fix.summary,
    tags: JSON.stringify(fix.tags),
    sourceRefs: JSON.stringify(fix.sourceRefs),
  };
  await writeCard(key, fields);

  if (WITH_EMBED && !DRY_RUN) {
    const emb = await embedText(fix.summary);
    if (emb) {
      const id = `fix:${fix.errorHash}`;
      const semKey = `prompt:sem:v1:${id}`;
      const inputHash = createHash('sha256').update(fix.summary.toLowerCase()).digest('hex');
      await redis.hset(semKey, {
        id,
        kind: 'fix',
        inputHash,
        normalizedPrompt: fix.summary.toLowerCase(),
        summary: fix.summary.slice(0, 200),
        tags: fix.tags.join(','),
        sourceRefs: JSON.stringify(fix.sourceRefs),
        model: 'opencode',
        answer: '',
        createdAt: new Date().toISOString(),
        ttlSeconds: String(TTL),
        vec: Buffer.from(emb.buffer),
      });
      await redis.expire(semKey, TTL);
      console.log(`  ↳ vec written for fix:${fix.errorHash}`);
    }
  }
  console.log(`  ${DRY_RUN ? '[dry]' : '✅'} fix:${fix.errorHash}`);
}

await redis.disconnect();
console.log(`\n── Done: ${written} written, ${skipped} dry-run skipped`);
console.log('   Lookup: redis-cli HGETALL opencode:rule:v1:tool-failure-proof');
if (WITH_EMBED) console.log('   Vectors indexed under prompt:sem:v1:rule:* and prompt:sem:v1:fix:*');