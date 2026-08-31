#!/usr/bin/env node
/**
 * atlas-ldr-mcp.mjs
 *
 * Bounded Local Deep Research (LDR) MCP facade for Parent Atlas.
 *
 * Authority boundary:
 *   Ornith proposes follow-up subqueries only.
 *   AtlasTaskKernel owns retrieval capabilities.
 *   This server never writes canonical stores and never authorizes mutation.
 *
 * Flow:
 *   query -> atlas_context/atlas_inspect -> evidence coverage
 *         -> optional Ornith subquery proposal -> validated follow-up rounds
 *         -> deterministic card dedupe/order/token packing -> research receipt.
 */

import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const TASK_KERNEL = path.join(ROOT, 'sveltekit-frontend/scripts/mcp/atlas-task-kernel-mcp.mjs');
const PROTOCOL_VERSION = '2024-11-05';
const SERVER_INFO = { name: 'atlas-ldr', version: '1.0.0' };

const DEFAULTS = Object.freeze({
  maxRounds: 3,
  maxSubqueriesPerRound: 4,
  maxCards: 32,
  tokenBudget: 6000,
  model: process.env.ATLAS_LDR_MODEL || process.env.EXPECTED_LLAMA_MODEL || 'ornith-1.5-9b',
  openaiBaseUrl: (process.env.ATLAS_LDR_OPENAI_BASE_URL || process.env.LOCAL_OPENAI_BASE_URL || 'http://127.0.0.1:8090/v1').replace(/\/$/, ''),
  apiKey: process.env.ATLAS_LDR_OPENAI_API_KEY || process.env.LOCAL_OPENAI_API_KEY || 'local',
});

const TOOLS = [
  {
    name: 'atlas_deep_research',
    description: 'Run bounded read-only Parent Atlas research. Uses AtlasTaskKernel retrieval, optionally asks Ornith only for follow-up subqueries, and returns a deterministic non-authoritative context receipt.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', minLength: 1 },
        domainFilter: { type: 'string' },
        maxRounds: { type: 'integer', minimum: 1, maximum: 3 },
        maxSubqueriesPerRound: { type: 'integer', minimum: 1, maximum: 4 },
        maxCards: { type: 'integer', minimum: 1, maximum: 50 },
        tokenBudget: { type: 'integer', minimum: 256, maximum: 24000 },
        useOrnithPlanner: { type: 'boolean' },
      },
      required: ['query'],
      additionalProperties: false,
    },
  },
  {
    name: 'atlas_research_health',
    description: 'Return the bounded LDR configuration and verify the AtlasTaskKernel facade is callable without running a research task.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
];

function sha256(value) {
  return createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${canonicalJson(value[k])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function clampInt(value, fallback, min, max) {
  const n = Number(value);
  return Number.isInteger(n) ? Math.min(max, Math.max(min, n)) : fallback;
}

function validateResearchQuery(value) {
  const q = String(value ?? '').trim().replace(/\s+/g, ' ');
  if (!q || q.length > 500) return null;
  if (/\r|\n|\u0000/.test(q)) return null;
  return q;
}

function estimateTokens(card) {
  const text = [card.title, card.summary, card.sourceRef, ...(card.evidenceRefs || [])].filter(Boolean).join('\n');
  return Math.max(1, Math.ceil(text.length / 4));
}

function parseToolText(result) {
  const text = (result?.content || []).filter((x) => x?.type === 'text').map((x) => x.text).join('\n').trim();
  if (!text) return { raw: '', parsed: null };
  try { return { raw: text, parsed: JSON.parse(text) }; } catch { return { raw: text, parsed: null }; }
}

function normalizeCard(raw, lane, query, ordinal) {
  const sourceRef = String(raw?.sourceRef ?? raw?.source_ref ?? raw?.path ?? '').trim() || null;
  const title = String(raw?.title ?? raw?.name ?? sourceRef ?? `${lane} evidence`).trim();
  const summary = String(raw?.summary ?? raw?.description ?? '').trim();
  const evidenceRefs = Array.from(new Set([
    ...(Array.isArray(raw?.evidenceRefs) ? raw.evidenceRefs : []),
    ...(Array.isArray(raw?.sourceRefs) ? raw.sourceRefs : []),
    ...(sourceRef ? [sourceRef] : []),
  ].filter((v) => typeof v === 'string' && v.trim()).map((v) => v.trim()))).sort();
  const baseScore = Number.isFinite(Number(raw?.score)) ? Number(raw.score) : 0;
  const identity = { lane, sourceRef, title, summary, evidenceRefs };
  const cardId = `ldr:${sha256(canonicalJson(identity)).slice(0, 24)}`;
  const card = {
    schema: 'atlas.ace-card.v2',
    cardId,
    cardKind: lane === 'atlas_context' ? 'SUMMARY' : 'SOURCE',
    lane,
    sourceRef,
    evidenceRefs,
    title,
    summary,
    query,
    score: baseScore,
    laneOrdinal: ordinal,
    tokenEstimate: 0,
    canonicalAuthority: false,
    revisionQualified: false,
  };
  card.tokenEstimate = estimateTokens(card);
  card.cardChecksum = sha256(canonicalJson({ ...card, cardChecksum: undefined }));
  return card;
}

function cardsFromToolResult(result, lane, query) {
  const { parsed } = parseToolText(result);
  const cards = [];
  if (Array.isArray(parsed?.cards)) {
    parsed.cards.forEach((card, i) => cards.push(normalizeCard(card, lane, query, i)));
  }
  const refs = Array.from(new Set([
    ...(Array.isArray(parsed?.sourceRefs) ? parsed.sourceRefs : []),
    ...(Array.isArray(parsed?.source_refs) ? parsed.source_refs : []),
  ].filter((x) => typeof x === 'string' && x.trim()))).sort();
  refs.forEach((sourceRef, i) => cards.push(normalizeCard({ sourceRef, title: sourceRef, summary: '' }, lane, query, cards.length + i)));
  return cards;
}

function dedupeAndPack(cards, maxCards, tokenBudget) {
  const byId = new Map();
  for (const card of cards) {
    const previous = byId.get(card.cardId);
    if (!previous || card.score > previous.score) byId.set(card.cardId, card);
  }

  const ordered = [...byId.values()].sort((a, b) =>
    (b.score - a.score)
    || String(a.sourceRef ?? '').localeCompare(String(b.sourceRef ?? ''))
    || a.title.localeCompare(b.title)
    || a.cardId.localeCompare(b.cardId)
  );

  const selected = [];
  let usedTokens = 0;
  for (const card of ordered) {
    if (selected.length >= maxCards) break;
    if (usedTokens + card.tokenEstimate > tokenBudget) continue;
    selected.push(card);
    usedTokens += card.tokenEstimate;
  }
  return { cards: selected, usedTokens, totalUniqueCards: ordered.length };
}

class TaskKernelClient {
  constructor() {
    this.nextId = 1;
    this.pending = new Map();
    this.child = null;
    this.ready = false;
  }

  async start() {
    if (this.child) return;
    this.child = spawn(process.execPath, [TASK_KERNEL], {
      cwd: ROOT,
      stdio: ['pipe', 'pipe', 'inherit'],
      env: { ...process.env },
    });
    createInterface({ input: this.child.stdout }).on('line', (line) => {
      try {
        const msg = JSON.parse(line);
        const waiter = this.pending.get(msg.id);
        if (!waiter) return;
        this.pending.delete(msg.id);
        msg.error ? waiter.reject(new Error(msg.error.message || 'AtlasTaskKernel error')) : waiter.resolve(msg.result);
      } catch { /* ignore non-protocol output */ }
    });
    await this.call('initialize', { protocolVersion: PROTOCOL_VERSION, capabilities: {}, clientInfo: { name: 'atlas-ldr', version: '1.0.0' } });
    this.child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} }) + '\n');
    this.ready = true;
  }

  call(method, params) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
    });
  }

  async tool(name, args) {
    await this.start();
    return this.call('tools/call', { name, arguments: args });
  }

  close() {
    if (this.child) this.child.kill();
    this.child = null;
  }
}

async function proposeSubqueries(query, evidenceSummary, maxSubqueries) {
  if (/^(1|true|yes)$/i.test(process.env.ATLAS_LDR_DISABLE_ORNITH ?? '')) return [];
  const body = {
    model: DEFAULTS.model,
    messages: [
      {
        role: 'system',
        content: 'You propose bounded read-only repository research subqueries. Return JSON only: {"subqueries":["..."]}. No shell commands, no edits, no URLs. Each subquery must be a short evidence question answerable by repository retrieval.',
      },
      {
        role: 'user',
        content: `Research goal: ${query}\nCurrent evidence summary: ${evidenceSummary || 'none'}\nReturn at most ${maxSubqueries} distinct follow-up subqueries.`,
      },
    ],
    temperature: 0,
    seed: 0,
    max_tokens: 256,
    response_format: { type: 'json_object' },
    chat_template_kwargs: { enable_thinking: false },
  };

  try {
    const response = await fetch(`${DEFAULTS.openaiBaseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${DEFAULTS.apiKey}` },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30000),
    });
    if (!response.ok) return [];
    const payload = await response.json();
    const content = payload?.choices?.[0]?.message?.content ?? '';
    const parsed = JSON.parse(content);
    const out = [];
    for (const value of Array.isArray(parsed?.subqueries) ? parsed.subqueries : []) {
      const q = validateResearchQuery(value);
      if (q && q !== query && !out.includes(q)) out.push(q);
      if (out.length >= maxSubqueries) break;
    }
    return out;
  } catch {
    return [];
  }
}

function evidenceSummary(cards) {
  return cards.slice(0, 8).map((c) => `${c.title}${c.sourceRef ? ` (${c.sourceRef})` : ''}`).join('; ').slice(0, 1600);
}

async function runResearch(args, kernel = new TaskKernelClient()) {
  const query = validateResearchQuery(args.query);
  if (!query) throw new Error('INVALID_RESEARCH_QUERY');
  const maxRounds = clampInt(args.maxRounds, DEFAULTS.maxRounds, 1, 3);
  const maxSubqueriesPerRound = clampInt(args.maxSubqueriesPerRound, DEFAULTS.maxSubqueriesPerRound, 1, 4);
  const maxCards = clampInt(args.maxCards, DEFAULTS.maxCards, 1, 50);
  const tokenBudget = clampInt(args.tokenBudget, DEFAULTS.tokenBudget, 256, 24000);
  const useOrnithPlanner = args.useOrnithPlanner !== false;
  const domainFilter = typeof args.domainFilter === 'string' && args.domainFilter.trim() ? args.domainFilter.trim() : undefined;

  const queue = [query];
  const visitedQueries = new Set();
  const allCards = [];
  const rounds = [];

  try {
    for (let round = 0; round < maxRounds && queue.length; round++) {
      const activeQueries = queue.splice(0, maxSubqueriesPerRound);
      const roundRecord = { round, queries: [], toolErrors: [] };

      for (const q of activeQueries) {
        if (visitedQueries.has(q)) continue;
        visitedQueries.add(q);
        roundRecord.queries.push(q);
        try {
          const context = await kernel.tool('atlas_context', { query: q, maxCards, ...(domainFilter ? { domainFilter } : {}) });
          allCards.push(...cardsFromToolResult(context, 'atlas_context', q));
        } catch (error) {
          roundRecord.toolErrors.push({ tool: 'atlas_context', query: q, error: error.message });
        }
        try {
          const inspect = await kernel.tool('atlas_inspect', { query: q });
          allCards.push(...cardsFromToolResult(inspect, 'atlas_inspect', q));
        } catch (error) {
          roundRecord.toolErrors.push({ tool: 'atlas_inspect', query: q, error: error.message });
        }
      }

      const packedNow = dedupeAndPack(allCards, maxCards, tokenBudget);
      roundRecord.uniqueCardCount = packedNow.totalUniqueCards;
      roundRecord.selectedCardCount = packedNow.cards.length;
      rounds.push(roundRecord);

      if (round + 1 >= maxRounds || packedNow.cards.length >= Math.min(maxCards, 8)) continue;
      if (useOrnithPlanner) {
        const subqueries = await proposeSubqueries(query, evidenceSummary(packedNow.cards), maxSubqueriesPerRound);
        for (const subquery of subqueries) if (!visitedQueries.has(subquery) && !queue.includes(subquery)) queue.push(subquery);
      }
    }

    const packed = dedupeAndPack(allCards, maxCards, tokenBudget);
    const receiptCore = {
      schema: 'atlas.local-deep-research.v1',
      query,
      domainFilter: domainFilter ?? null,
      policy: {
        maxRounds,
        maxSubqueriesPerRound,
        maxCards,
        tokenBudget,
        tokenizerRevision: 'approx-char4-v1',
        planner: useOrnithPlanner ? 'ornith-subquery-proposal' : 'disabled',
      },
      rounds,
      visitedQueries: [...visitedQueries],
      cards: packed.cards,
      selectedCardCount: packed.cards.length,
      uniqueCardCount: packed.totalUniqueCards,
      usedTokensApprox: packed.usedTokens,
      canonicalAuthority: false,
      mutationAuthority: false,
      writesPerformed: false,
    };
    const researchChecksum = sha256(canonicalJson(receiptCore));
    return {
      ...receiptCore,
      researchChecksum,
      status: packed.cards.length ? 'LDR_CONTEXT_COMPILED' : 'LDR_INSUFFICIENT_EVIDENCE',
    };
  } finally {
    kernel.close();
  }
}

async function health() {
  const kernel = new TaskKernelClient();
  try {
    await kernel.start();
    const listed = await kernel.call('tools/list', {});
    const names = (listed?.tools || []).map((t) => t.name).sort();
    return {
      schema: 'atlas.local-deep-research-health.v1',
      taskKernelReachable: true,
      requiredToolsPresent: ['atlas_context', 'atlas_inspect'].every((name) => names.includes(name)),
      taskKernelTools: names,
      openaiBaseUrl: DEFAULTS.openaiBaseUrl,
      model: DEFAULTS.model,
      canonicalAuthority: false,
    };
  } finally {
    kernel.close();
  }
}

async function dispatch(method, params) {
  if (method === 'initialize') return { protocolVersion: PROTOCOL_VERSION, serverInfo: SERVER_INFO, capabilities: { tools: {} } };
  if (method === 'notifications/initialized') return null;
  if (method === 'tools/list') return { tools: TOOLS };
  if (method !== 'tools/call') throw Object.assign(new Error(`Method not found: ${method}`), { code: -32601 });
  const name = params?.name;
  if (name === 'atlas_research_health') return { content: [{ type: 'text', text: JSON.stringify(await health()) }] };
  if (name === 'atlas_deep_research') return { content: [{ type: 'text', text: JSON.stringify(await runResearch(params?.arguments ?? {})) }] };
  throw new Error(`Unknown LDR capability: ${name}`);
}

async function selfTest() {
  const fakeKernel = {
    async tool(name, args) {
      if (name === 'atlas_context') return { content: [{ type: 'text', text: JSON.stringify({ cards: [{ title: 'CandidateOrdinalMapV1', summary: 'revision-bound candidate map', sourceRef: 'src/candidate.ts', score: 1 }] }) }] };
      if (name === 'atlas_inspect') return { content: [{ type: 'text', text: JSON.stringify({ sourceRefs: ['src/candidate.ts', 'src/context.ts'] }) }] };
      throw new Error(`unexpected ${name}`);
    },
    close() {},
  };
  const receipt = await runResearch({ query: 'find candidate ordinal context owner', maxRounds: 1, useOrnithPlanner: false }, fakeKernel);
  if (receipt.status !== 'LDR_CONTEXT_COMPILED') throw new Error('self-test status failed');
  if (receipt.cards.length !== 3) throw new Error(`self-test expected 3 cards, got ${receipt.cards.length}`);
  if (receipt.canonicalAuthority !== false || receipt.writesPerformed !== false) throw new Error('self-test authority failed');
  process.stdout.write(JSON.stringify({ ok: true, status: receipt.status, cards: receipt.cards.length, researchChecksum: receipt.researchChecksum }, null, 2) + '\n');
}

if (process.argv.includes('--self-test')) {
  selfTest().catch((error) => { console.error(error); process.exit(1); });
} else {
  const input = createInterface({ input: process.stdin });
  input.on('line', async (line) => {
    let request;
    try { request = JSON.parse(line); } catch { return; }
    try {
      const result = await dispatch(request.method, request.params);
      if (request.id !== undefined) process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: request.id, result }) + '\n');
    } catch (error) {
      if (request.id !== undefined) process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: request.id, error: { code: error.code ?? -32000, message: error.message } }) + '\n');
    }
  });
}
