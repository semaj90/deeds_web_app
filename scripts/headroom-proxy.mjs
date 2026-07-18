#!/usr/bin/env node
/**
 * headroom-proxy.mjs — Atlas Headroom Memory Proxy
 *
 * Sits between Cline/OpenCode and llama-server :8090.
 * Provides an OpenAI-compatible endpoint on :8795.
 *
 * Responsibilities:
 *   1. Compact memory tail injection — inserts remembered facts before user message
 *   2. Conversation compression — trims old turns when total tokens near budget
 *   3. Memory capture — stores agent corrections and operational facts
 *   4. Claim validation stub — validates important claims against Atlas MCP
 *
 * Authority boundary (HARD RULES):
 *   - Headroom stores: user preferences, corrections, operational facts, compressed context
 *   - Atlas/Postgres stores: task state, code identities, specs, evidence, proofs
 *   - Headroom NEVER rewrites ACE packet IDs, hashes, commands, or completion gates
 *   - Headroom NEVER makes itself the truth source for code identity claims
 *
 * Prompt injection order (enforced by this proxy):
 *   [stable system]         → passed through unchanged
 *   [conversation]          → compressed if needed
 *   [headroom memory tail]  → injected as system suffix before last user message
 *   [ACE task packet]       → detected and preserved verbatim (last user message)
 *   [current instruction]   → last user message (may contain ACE JSON)
 *
 * Usage:
 *   node scripts/headroom-proxy.mjs
 *   HEADROOM_PORT=8795 UPSTREAM_URL=http://127.0.0.1:8090 node scripts/headroom-proxy.mjs
 *
 * Test:
 *   curl http://127.0.0.1:8795/health
 *   curl http://127.0.0.1:8795/v1/models
 *   curl -X POST http://127.0.0.1:8795/v1/chat/completions \
 *     -H "Content-Type: application/json" \
 *     -d '{"model":"gemma4-legal","messages":[{"role":"user","content":"hello"}],"stream":false}'
 */

import http from 'node:http';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Configuration ───────────────────────────────────────────────────────────
const PORT         = parseInt(process.env.HEADROOM_PORT   ?? '8795', 10);
const UPSTREAM     = process.env.UPSTREAM_URL              ?? 'http://127.0.0.1:8090';
const MEMORY_FILE  = process.env.HEADROOM_MEMORY_FILE      ?? join(__dirname, '../.headroom-memory.json');
const MAX_MEMORY   = parseInt(process.env.HEADROOM_MAX_MEMORY ?? '20', 10);  // max facts to inject
const TOKEN_BUDGET = parseInt(process.env.HEADROOM_TOKEN_BUDGET ?? '12000', 10); // soft budget for compression
const COMPRESS_AT  = Math.floor(TOKEN_BUDGET * 0.8); // start compressing at 80% budget

// ── Memory store (file-backed, reloads on each request) ────────────────────
/** @typedef {{ fact: string, scope: string, source: string, confidence: number, recorded_at: string, stale?: boolean }} MemoryFact */

function loadMemory() {
  if (!existsSync(MEMORY_FILE)) return [];
  try {
    const raw = readFileSync(MEMORY_FILE, 'utf-8');
    return JSON.parse(raw);
  } catch { return []; }
}

function saveMemory(facts) {
  writeFileSync(MEMORY_FILE, JSON.stringify(facts, null, 2), 'utf-8');
}

function addFact(fact, scope = 'deeds-web-app', source = 'headroom', confidence = 0.8) {
  const facts = loadMemory();
  const entry = { fact, scope, source, confidence, recorded_at: new Date().toISOString() };
  // Deduplicate by fact text hash
  const hash = createHash('sha256').update(fact).digest('hex').slice(0, 12);
  const existing = facts.findIndex(f => createHash('sha256').update(f.fact).digest('hex').slice(0, 12) === hash);
  if (existing >= 0) {
    facts[existing] = { ...facts[existing], ...entry };
  } else {
    facts.push(entry);
  }
  // Keep only the most recent MAX_MEMORY * 5 facts (prune oldest low-confidence)
  if (facts.length > MAX_MEMORY * 5) {
    facts.sort((a, b) => b.confidence - a.confidence || new Date(b.recorded_at) - new Date(a.recorded_at));
    facts.splice(MAX_MEMORY * 5);
  }
  saveMemory(facts);
  return entry;
}

function getCompactMemoryTail(scope = 'deeds-web-app') {
  const facts = loadMemory()
    .filter(f => !f.stale && (!scope || f.scope === scope || f.scope === '*'))
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, MAX_MEMORY);

  if (facts.length === 0) return null;

  const lines = facts.map(f =>
    `[${f.source}|conf=${f.confidence.toFixed(2)}] ${f.fact}`
  ).join('\n');

  return `## Headroom Memory (validate important claims via atlas_get_known_proofs)\n${lines}`;
}

// ── Token estimation (rough: 1 token ≈ 4 chars for code-heavy content) ────
function estimateTokens(text) {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

function estimateMessagesTokens(messages) {
  return messages.reduce((sum, m) => sum + estimateTokens(m.content ?? '') + 4, 0);
}

// ── ACE packet detection — never compress or rewrite these ────────────────
function isAcePacket(text) {
  if (!text) return false;
  return (
    text.includes('"version": "atlas-ace-v1"') ||
    text.includes('"task_id":') && text.includes('"allowed_files":') ||
    text.includes('"required_validation":') && text.includes('"known_proofs":')
  );
}

// ── Conversation compression ───────────────────────────────────────────────
/**
 * Compresses middle turns when token count exceeds COMPRESS_AT.
 * Preserves: system messages, last 4 turns, and any message containing ACE packet.
 */
function compressMessages(messages) {
  const totalTokens = estimateMessagesTokens(messages);
  if (totalTokens < COMPRESS_AT) return { messages, compressed: false };

  const system = messages.filter(m => m.role === 'system');
  const nonSystem = messages.filter(m => m.role !== 'system');

  // Always keep last 4 messages (2 turns)
  const keepTail = Math.min(4, nonSystem.length);
  const tail = nonSystem.slice(-keepTail);
  const middle = nonSystem.slice(0, -keepTail);

  // Remove middle turns that aren't ACE packets, keeping every other pair
  const compressed = middle.filter((m, i) => {
    if (isAcePacket(m.content)) return true;
    // Keep every 3rd pair to preserve some context
    return i % 6 === 0;
  });

  const result = [...system, ...compressed, ...tail];
  const newTokens = estimateMessagesTokens(result);

  console.error(`[headroom] compressed ${totalTokens} → ${newTokens} est. tokens (removed ${messages.length - result.length} messages)`);
  return { messages: result, compressed: true };
}

// ── Memory tail injection ──────────────────────────────────────────────────
/**
 * Injects compact memory tail as a system message suffix (before last user message).
 * Never injects before ACE packet content.
 * Never modifies the last user message if it contains an ACE packet.
 */
function injectMemoryTail(messages) {
  const tail = getCompactMemoryTail();
  if (!tail) return messages;

  // Don't inject if last user message is an ACE packet
  const lastUser = [...messages].reverse().find(m => m.role === 'user');
  if (lastUser && isAcePacket(lastUser.content)) {
    console.error('[headroom] skipping memory injection: last message is ACE packet');
    return messages;
  }

  // Insert memory tail as system message just before last user message
  const lastUserIdx = messages.length - 1 - [...messages].reverse().findIndex(m => m.role === 'user');
  const injected = [
    ...messages.slice(0, lastUserIdx),
    { role: 'system', content: tail },
    ...messages.slice(lastUserIdx),
  ];

  console.error(`[headroom] injected ${tail.split('\n').length - 1} memory facts`);
  return injected;
}

// ── Upstream request forwarding ────────────────────────────────────────────
async function forwardToUpstream(path, method, body, headers) {
  const url = `${UPSTREAM}${path}`;
  const upstreamHeaders = {
    'Content-Type': 'application/json',
    Accept: headers.accept ?? 'application/json',
  };
  if (headers.authorization) upstreamHeaders.Authorization = headers.authorization;

  const bodyStr = body ? JSON.stringify(body) : undefined;

  const res = await fetch(url, {
    method,
    headers: upstreamHeaders,
    body: bodyStr,
    signal: AbortSignal.timeout(120_000),
  });

  return res;
}

// ── Extract corrections from model responses ───────────────────────────────
/**
 * Pattern-matches assistant responses for self-reported corrections.
 * Stores them as low-confidence headroom facts.
 * Examples caught: "I was wrong about X", "correction: X is Y", "actually, X"
 */
function extractCorrections(content, source) {
  if (!content) return;
  const correctionPatterns = [
    /(?:correction|correcting|i was wrong|actually)[:\s]+(.{20,200})/gi,
    /note:\s+(.{20,200})/gi,
  ];
  for (const pattern of correctionPatterns) {
    let m;
    while ((m = pattern.exec(content)) !== null) {
      addFact(m[1].trim(), 'deeds-web-app', source, 0.6);
    }
  }
}

// ── HTTP Server ────────────────────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  const { method, url, headers } = req;

  // Collect body
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const rawBody = Buffer.concat(chunks).toString('utf-8');

  // ── Health check ─────────────────────────────────────────────────────────
  if (url === '/health' || url === '/headroom/health') {
    const memCount = loadMemory().length;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'ok',
      service: 'headroom-proxy',
      upstream: UPSTREAM,
      port: PORT,
      memory_facts: memCount,
      token_budget: TOKEN_BUDGET,
      compress_at: COMPRESS_AT,
    }));
    return;
  }

  // ── Memory management endpoints ───────────────────────────────────────────
  if (url === '/headroom/memory' && method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ facts: loadMemory() }));
    return;
  }

  if (url === '/headroom/memory' && method === 'POST') {
    try {
      const { fact, scope, source, confidence } = JSON.parse(rawBody);
      if (!fact) { res.writeHead(400); res.end('{"error":"fact required"}'); return; }
      const entry = addFact(fact, scope, source, confidence);
      res.writeHead(201, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ stored: entry }));
    } catch (e) {
      res.writeHead(400); res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }

  if (url === '/headroom/memory' && method === 'DELETE') {
    saveMemory([]);
    res.writeHead(200); res.end('{"cleared":true}');
    return;
  }

  if (url === '/headroom/memory/tail' && method === 'GET') {
    const tail = getCompactMemoryTail();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ tail }));
    return;
  }

  // ── Pass-through: /v1/models ──────────────────────────────────────────────
  if (url === '/v1/models' && method === 'GET') {
    const upstream = await forwardToUpstream('/v1/models', 'GET', null, headers);
    res.writeHead(upstream.status, { 'Content-Type': 'application/json' });
    res.end(await upstream.text());
    return;
  }

  // ── Pass-through: /props, /slots, /metrics ────────────────────────────────
  if (['/props', '/slots', '/metrics', '/v1/completions'].some(p => url === p || url?.startsWith(p + '?'))) {
    const upstream = await forwardToUpstream(url, method, rawBody ? JSON.parse(rawBody) : null, headers);
    res.writeHead(upstream.status, { 'Content-Type': upstream.headers.get('content-type') ?? 'application/json' });
    res.end(await upstream.text());
    return;
  }

  // ── Chat completions: apply Headroom pipeline ─────────────────────────────
  if (url === '/v1/chat/completions' && method === 'POST') {
    let body;
    try { body = JSON.parse(rawBody); } catch {
      res.writeHead(400); res.end('{"error":"invalid JSON"}'); return;
    }

    const isStream = body.stream === true;
    let messages = body.messages ?? [];

    // Step 1: Compress if over budget
    const { messages: compressed } = compressMessages(messages);
    messages = compressed;

    // Step 2: Inject memory tail (before last user message, skip if ACE)
    messages = injectMemoryTail(messages);

    const upstreamBody = { ...body, messages };

    // Step 3: Forward to llama-server
    const upstreamRes = await forwardToUpstream('/v1/chat/completions', 'POST', upstreamBody, headers);

    if (isStream) {
      // Streaming: pipe through, capture content for correction extraction
      res.writeHead(upstreamRes.status, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      });

      let accumulated = '';
      const reader = upstreamRes.body;
      const decoder = new TextDecoder();

      for await (const chunk of reader) {
        const text = decoder.decode(chunk, { stream: true });
        res.write(text);
        accumulated += text;
      }
      res.end();

      // Extract corrections from streamed content
      const contentMatch = accumulated.match(/"content":"((?:[^"\\]|\\.)*)"/g);
      if (contentMatch) {
        const content = contentMatch.map(m => m.slice(11, -1).replace(/\\n/g, '\n')).join('');
        extractCorrections(content, 'stream-response');
      }

    } else {
      // Non-streaming: capture and optionally extract corrections
      const responseText = await upstreamRes.text();
      res.writeHead(upstreamRes.status, { 'Content-Type': 'application/json' });
      res.end(responseText);

      try {
        const parsed = JSON.parse(responseText);
        const content = parsed.choices?.[0]?.message?.content;
        if (content) extractCorrections(content, 'response');
      } catch { /* non-fatal */ }
    }

    return;
  }

  // ── Fallback: proxy everything else unchanged ─────────────────────────────
  const upstream = await forwardToUpstream(url, method, rawBody ? (() => { try { return JSON.parse(rawBody); } catch { return rawBody; } })() : null, headers);
  res.writeHead(upstream.status, { 'Content-Type': upstream.headers.get('content-type') ?? 'application/json' });
  res.end(await upstream.text());
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[headroom] proxy listening on http://127.0.0.1:${PORT}`);
  console.log(`[headroom] upstream: ${UPSTREAM}`);
  console.log(`[headroom] memory file: ${MEMORY_FILE}`);
  console.log(`[headroom] token budget: ${TOKEN_BUDGET} (compress at ${COMPRESS_AT})`);
  console.log(`[headroom] endpoints:`);
  console.log(`  GET  /health`);
  console.log(`  GET  /v1/models`);
  console.log(`  POST /v1/chat/completions  (with memory injection + compression)`);
  console.log(`  GET  /headroom/memory      (list facts)`);
  console.log(`  POST /headroom/memory      (add fact: {fact, scope, source, confidence})`);
  console.log(`  DELETE /headroom/memory    (clear all facts)`);
  console.log(`  GET  /headroom/memory/tail (preview injection)`);
});

server.on('error', (err) => {
  console.error('[headroom] server error:', err.message);
  process.exit(1);
});
