#!/usr/bin/env node
/**
 * prompt-generator.mjs — Phase 11H
 * intent → structured Gemma4 system prompt with ACE context + tool manifest.
 *
 * Fallback chain (local first, never skips steps):
 *   1. ACE Redis cache (ace:packet:latest / intent:{hash})
 *   2. .opencode/ace-packet.json (disk fallback)
 *   3. feature-labels.ndjson (static domain classification)
 *
 * Output:
 *   .tmp/generated-prompt.json   { intentHash, systemPrompt, tools, contextChunks, sourceRefs, domain }
 *   Redis: prompt:{intentHash}   TTL 7d stable / 1d volatile
 *
 * Usage:
 *   node scripts/agent/prompt-generator.mjs "ACE context retrieval"
 *   node scripts/agent/prompt-generator.mjs --dry-run "legal evidence"
 */

import fs from 'fs/promises';
import { existsSync, createReadStream } from 'fs';
import path from 'path';
import crypto from 'crypto';
import readline from 'readline';
import { loadRepoEnv, resolveRedisUrl } from '../atlas/connection-config.mjs';

const ROOT    = process.cwd();
const TMP_DIR = path.join(ROOT, '.tmp');
const DRY_RUN = process.argv.includes('--dry-run');

const intentArg = process.argv
  .slice(2)
  .filter(a => !a.startsWith('--'))
  .join(' ')
  .trim() || 'ACE context retrieval';

// Domains that are stable (7d TTL) vs volatile (1d TTL)
const STABLE_DOMAINS = new Set(['Legal', 'Graph', 'Infra']);

// Gemma4 tool manifest — ordered by priority (cheap first)
const TOOLS = [
  {
    name: 'rg',
    description: 'ripgrep full-text search in the local codebase. Always try first.',
    parameters: { pattern: 'string', path: 'string (optional, default: src/)' },
    example: 'rg "TurboVec" scripts/ingest/',
  },
  {
    name: 'ace_search',
    description: 'Search the ACE packet (Redis hot cache). Sub-second, no network.',
    parameters: { query: 'string', top_k: 'number (default: 5)' },
    example: 'ace_search("ACE packet compression", 5)',
  },
  {
    name: 'qdrant_search',
    description: 'Semantic vector search in Qdrant (codebase_chunks_768). Use when rg/ace miss.',
    parameters: { query: 'string', collection: 'string (default: codebase_chunks_768)', top_k: 'number' },
    example: 'qdrant_search("evidence pipeline chunking", "codebase_chunks_768", 10)',
  },
  {
    name: 'searxng_search',
    description: 'Web search via SearXNG (http://localhost:8889). Last resort only.',
    parameters: { query: 'string', engines: 'string (optional, e.g. "google,bing")' },
    example: 'searxng_search("TurboVec Python API quantization")',
  },
];

function intentHash(query) {
  return crypto.createHash('sha256').update(query.toLowerCase().trim()).digest('hex').slice(0, 16);
}

async function loadRedis() {
  const env = loadRepoEnv(process.env);
  const redisUrl = resolveRedisUrl(env);
  const candidates = [
    path.join(ROOT, 'sveltekit-frontend', 'node_modules', 'ioredis'),
    path.join(ROOT, 'node_modules', 'ioredis'),
  ];
  for (const p of candidates) {
    if (existsSync(p)) {
      const { default: Redis } = await import(p + '/built/index.js').catch(() => import(p));
      const redis = new Redis(redisUrl, {
        lazyConnect: true,
        maxRetriesPerRequest: 1,
        enableOfflineQueue: false,
        retryStrategy: () => null,
      });
      redis.on('error', () => {});
      try {
        await redis.connect();
        await redis.ping();
        return redis;
      } catch { redis.disconnect(); }
    }
  }
  return null;
}

async function readAcePacketFromRedis(redis) {
  if (!redis) return null;
  try {
    const raw = await redis.get('ace:packet:latest');
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

async function readAcePacketFromDisk() {
  const p = path.join(ROOT, '.opencode', 'ace-packet.json');
  if (!existsSync(p)) return null;
  try { return JSON.parse(await fs.readFile(p, 'utf8')); } catch { return null; }
}

async function readFeatureLabels() {
  const p = path.join(TMP_DIR, 'feature-labels.ndjson');
  const labels = [];
  if (!existsSync(p)) return labels;
  const rl = readline.createInterface({ input: createReadStream(p), crlfDelay: Infinity });
  for await (const line of rl) {
    if (!line.trim()) continue;
    try { labels.push(JSON.parse(line)); } catch { /* skip */ }
  }
  return labels;
}

function pickContextChunks(acePacket, intent, maxChunks = 6) {
  if (!acePacket?.cards) return [];
  const q = intent.toLowerCase();
  const scored = acePacket.cards.map(c => {
    const text = ((c.title || '') + ' ' + (c.summary || '') + ' ' + (c.sourceRef || '')).toLowerCase();
    const hits = q.split(/\s+/).filter(w => w.length > 2 && text.includes(w)).length;
    return { ...c, _matchScore: hits };
  });
  return scored
    .sort((a, b) => (b._matchScore - a._matchScore) || (b.score || 0) - (a.score || 0))
    .slice(0, maxChunks)
    .map(({ _matchScore, ...c }) => c);
}

function pickDomain(chunks, featureLabels) {
  // Vote on domain from matched chunks' sourceRefs
  const srSet = new Set(chunks.map(c => c.sourceRef).filter(Boolean));
  const counts = {};
  for (const lbl of featureLabels) {
    if (srSet.has(lbl.sourceRef)) {
      counts[lbl.domain] = (counts[lbl.domain] || 0) + 1;
    }
  }
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  return sorted[0]?.[0] || 'General';
}

function buildSystemPrompt(intent, chunks, domain, tools) {
  const chunkSection = chunks.length
    ? chunks.map((c, i) =>
        `[${i + 1}] ${c.title || c.id}\n    source: ${c.sourceRef || 'unknown'}\n    ${(c.summary || '').slice(0, 200)}`
      ).join('\n\n')
    : '(no context chunks loaded — use rg or ace_search to find relevant files)';

  const toolSection = tools.map(t =>
    `- **${t.name}**: ${t.description}\n  params: ${JSON.stringify(t.parameters)}\n  example: \`${t.example}\``
  ).join('\n\n');

  return `You are a legal-domain AI assistant with access to a local codebase and knowledge base.

## Current Task
${intent}

## Domain Context
Active domain: **${domain}**
Research discipline: local-first (rg → ace_search → qdrant_search → searxng_search)

## Relevant Context (${chunks.length} chunks)
${chunkSection}

## Available Tools
${toolSection}

## Operational Rules
1. Always try **rg** first — it's free and instant.
2. If rg misses, use **ace_search** (Redis hot cache, sub-second).
3. Only escalate to **qdrant_search** if the first two miss.
4. Use **searxng_search** only when local sources are insufficient AND you've exhausted ace+qdrant.
5. Never hallucinate sourceRefs — anchor every claim to a tool result.
6. If unsure, output a repair plan with \`patch_targets\` rather than guessing.
7. Keep responses concise; use bullet lists for action items.`;
}

async function main() {
  console.log('\n── Prompt Generator (Phase 11H) ──────────────────────────');
  console.log(`  intent   : "${intentArg}"`);

  const ih = intentHash(intentArg);
  console.log(`  hash     : ${ih}`);

  // Load Redis + ACE packet in parallel
  const [redis, featureLabels] = await Promise.all([
    loadRedis(),
    readFeatureLabels(),
  ]);
  console.log(`  redis    : ${redis ? '✅ connected' : '⚠️  offline'}`);
  console.log(`  labels   : ${featureLabels.length}`);

  // Check if prompt already cached
  if (redis && !DRY_RUN) {
    const cached = await redis.get(`prompt:${ih}`).catch(() => null);
    if (cached) {
      console.log(`  cache    : HIT prompt:${ih} — skipping rebuild`);
      console.log('──────────────────────────────────────────────────────────\n');
      if (redis) redis.disconnect();
      return;
    }
  }

  // Load ACE packet
  let acePacket = await readAcePacketFromRedis(redis);
  const aceSource = acePacket ? 'redis' : 'disk';
  if (!acePacket) acePacket = await readAcePacketFromDisk();
  console.log(`  ace      : ${acePacket ? `${acePacket.totalCards || acePacket.cards?.length || 0} cards (${aceSource})` : '⚠️  not found'}`);

  // Pick context chunks + domain
  const chunks = pickContextChunks(acePacket, intentArg);
  const domain = pickDomain(chunks, featureLabels);
  console.log(`  domain   : ${domain}`);
  console.log(`  chunks   : ${chunks.length}`);

  // Build prompt
  const systemPrompt = buildSystemPrompt(intentArg, chunks, domain, TOOLS);
  const ttlSecs = STABLE_DOMAINS.has(domain) ? 7 * 24 * 3600 : 24 * 3600;

  const result = {
    intentHash:    ih,
    intent:        intentArg,
    domain,
    systemPrompt,
    tools:         TOOLS.map(t => t.name),
    contextChunks: chunks.length,
    sourceRefs:    [...new Set(chunks.map(c => c.sourceRef).filter(Boolean))],
    ttlSecs,
    generatedAt:   new Date().toISOString(),
  };

  if (DRY_RUN) {
    console.log(`\n  dry-run: would SET prompt:${ih} TTL ${ttlSecs}s`);
    console.log(`  prompt preview (first 200 chars):`);
    console.log('    ' + systemPrompt.slice(0, 200).replace(/\n/g, '\n    '));
    console.log('\n──────────────────────────────────────────────────────────\n');
    if (redis) redis.disconnect();
    return;
  }

  // Write to disk
  await fs.mkdir(TMP_DIR, { recursive: true });
  await fs.writeFile(path.join(TMP_DIR, 'generated-prompt.json'), JSON.stringify(result, null, 2), 'utf8');
  console.log(`  ✅ wrote .tmp/generated-prompt.json`);

  // Write to Redis
  if (redis) {
    await redis.setex(`prompt:${ih}`, ttlSecs, JSON.stringify(result));
    console.log(`  ✅ SET prompt:${ih}  TTL ${ttlSecs}s (${domain} domain)`);
  }

  console.log('\n  Top sourceRefs:');
  for (const sr of result.sourceRefs.slice(0, 5)) {
    console.log(`    ${sr}`);
  }
  console.log('──────────────────────────────────────────────────────────\n');

  if (redis) redis.disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
