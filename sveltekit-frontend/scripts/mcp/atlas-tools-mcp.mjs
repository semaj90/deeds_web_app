#!/usr/bin/env node
/**
 * atlas-tools-mcp.mjs — Stdio MCP server exposing three Atlas agentic tools:
 *   classify_intent         — classify prompt → intent/domain/safeNextCommand
 *   build_agentic_rag_context — score ACE packet cards against query
 *   build_recommendation    — produce structured repair/research recommendation
 *
 * Raw newline-delimited JSON-RPC 2.0 (MCP stdio transport, no SDK dependency).
 *
 * Wire in opencode.json:
 *   "atlas-tools": {
 *     "type": "local",
 *     "command": ["node", "./sveltekit-frontend/scripts/mcp/atlas-tools-mcp.mjs"],
 *     "enabled": true,
 *     "timeout": 30000
 *   }
 */

import { createInterface } from 'node:readline';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const log = (...a) => process.stderr.write('[atlas-tools] ' + a.join(' ') + '\n');

const PROTOCOL_VERSION = '2024-11-05';
const SERVER_INFO = { name: 'atlas-tools', version: '0.2.0' };

// ── Tool definitions ───────────────────────────────────────────────────────────

const TOOLS = [
  {
    name: 'classify_intent',
    description:
      'Classify a user prompt into intent (repair/research/planning), domain ' +
      '(retrieval/graph/agent-workflow/general), subdomain, and produce a safe ' +
      'next shell command that gathers evidence without modifying any files.',
    inputSchema: {
      type: 'object',
      properties: {
        prompt: { type: 'string', description: 'The raw user prompt or error message to classify.' },
        context: { type: 'string', description: 'Optional extra context: file path, error type, or phase label.' },
      },
      required: ['prompt'],
      additionalProperties: false,
    },
  },
  {
    name: 'build_agentic_rag_context',
    description:
      'Build a compact RAG context packet from the ACE cache. Reads .opencode/ace-packet.json, ' +
      'scores cards against the query by keyword overlap, and returns the top-K cards with ' +
      'sourceRefs and a ready-to-inject prompt snippet. Use before sending a codebase question to Gemma4.',
    inputSchema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'The user query or repair goal used to score cards.' },
        maxCards: { type: 'number', description: 'Maximum number of cards to return (1-50). Default 20.' },
        domainFilter: { type: 'string', description: 'Optional domain to filter cards (e.g. "retrieval", "graph"). Omit for all.' },
      },
      required: ['query'],
      additionalProperties: false,
    },
  },
  {
    name: 'build_recommendation',
    description:
      'Produce a structured recommendation (likely_cause, evidence, patch_targets, ' +
      'safe_next_command, do_not_do) from classified intent and RAG context. ' +
      'Use after classify_intent and build_agentic_rag_context have run.',
    inputSchema: {
      type: 'object',
      properties: {
        intent: { type: 'string', description: 'Intent from classify_intent: "repair", "research", or "planning".' },
        domain: { type: 'string', description: 'Domain from classify_intent (e.g. "retrieval", "graph").' },
        errorSummary: { type: 'string', description: 'One-sentence description of the error or question.' },
        evidenceLines: {
          type: 'array',
          items: { type: 'string', description: 'One evidence item: a file:line ref, Redis key, rg match, or ACE card title.' },
          description: 'Evidence items: file:line refs, Redis keys, rg matches, or ACE card titles.',
        },
        patchTargets: {
          type: 'array',
          items: { type: 'string', description: 'Relative file path that needs to change.' },
          description: 'Relative file paths that need to change. Empty array if no patch needed.',
        },
        proposedFix: { type: 'string', description: 'Optional one-line description of the proposed code change.' },
      },
      required: ['intent', 'domain', 'errorSummary', 'evidenceLines', 'patchTargets'],
      additionalProperties: false,
    },
  },
];

// ── Tool implementations ────────────────────────────────────────────────────────

function classifyIntent({ prompt, context = '' }) {
  const text = (prompt + ' ' + context).toLowerCase();

  const domain =
    text.includes('qdrant') || text.includes('embedding') || text.includes('vector') || text.includes('ace') || text.includes('packet') || text.includes('card')
      ? 'retrieval'
      : text.includes('graph') || text.includes('topology') || text.includes('neo4j') || text.includes('cluster')
        ? 'graph'
        : text.includes('opencode') || text.includes('tool') || text.includes('skill') || text.includes('mcp')
          ? 'agent-workflow'
          : text.includes('svelte') || text.includes('route') || text.includes('component')
            ? 'frontend'
            : text.includes('drizzle') || text.includes('schema') || text.includes('postgres') || text.includes('migration')
              ? 'database'
              : 'general';

  const intent =
    text.includes('error') || text.includes('fix') || text.includes('fail') || text.includes('broken') || text.includes('missing')
      ? 'repair'
      : text.includes('search') || text.includes('find') || text.includes('why') || text.includes('what') || text.includes('how')
        ? 'research'
        : 'planning';

  const subdomain =
    text.includes('ace') || text.includes('rank') || text.includes('ingest')
      ? 'ace-pipeline'
      : text.includes('schema') || text.includes('zod') || text.includes('tool')
        ? 'tool-schema'
        : text.includes('redis') || text.includes('cache')
          ? 'cache'
          : text.includes('phase17') || text.includes('phase18') || text.includes('phase19') || text.includes('lane')
            ? 'atlas-lane'
            : 'unknown';

  const safeNextCommand =
    intent === 'repair'
      ? `rg -n "error|fail|undefined|null" scripts/ingest/ src/lib/server/ace/ --type ts`
      : domain === 'retrieval'
        ? 'node scripts/ingest/cache-ace-packet.mjs --audit'
        : domain === 'graph'
          ? 'rg -n "BELONGS_TO_CLUSTER|IMPORTS|topology" src/lib/server/graph/ --type ts'
          : domain === 'agent-workflow'
            ? 'npm run smoke:opencode'
            : `rg -rn "${prompt.split(' ').slice(0, 3).join('|')}" scripts/ src/ --type ts`;

  return { intent, domain, subdomain, confidence: subdomain !== 'unknown' ? 0.85 : 0.65, safeNextCommand };
}

function buildAgenticRagContext({ query, maxCards = 20, domainFilter }) {
  const root = process.cwd();
  const packetPath = path.join(root, '.opencode', 'ace-packet.json');

  if (!fs.existsSync(packetPath)) {
    return {
      ok: false,
      error: 'ACE packet not found. Run: npm run ingest:pipeline',
      safeNextCommand: 'npm run ingest:pipeline',
      cards: [],
      promptPacket: '',
      sourceRefs: [],
    };
  }

  let packet;
  try {
    packet = JSON.parse(fs.readFileSync(packetPath, 'utf8'));
  } catch (e) {
    return { ok: false, error: `Failed to parse ACE packet: ${e.message}`, cards: [], promptPacket: '', sourceRefs: [] };
  }

  let cards = (packet.cards ?? []).filter(c => c.score != null && isFinite(c.score));

  if (domainFilter) {
    cards = cards.filter(c => c.domain === domainFilter);
  }

  const cap = Math.max(1, Math.min(50, Number(maxCards) || 20));
  const queryTerms = query.toLowerCase().split(/\s+/).filter(t => t.length > 2);

  cards = cards
    .map(c => {
      const text = ((c.title ?? '') + ' ' + (c.summary ?? '')).toLowerCase();
      const overlap = queryTerms.filter(t => text.includes(t)).length;
      return { ...c, _qs: (c.score ?? 0) + overlap * 0.05 };
    })
    .sort((a, b) => (b._qs ?? 0) - (a._qs ?? 0))
    .slice(0, cap)
    .map(({ _qs, ...c }) => c);

  const sourceRefs = [...new Set(cards.map(c => c.sourceRef).filter(Boolean))];

  const promptPacket = [
    `[ACE CONTEXT — ${cards.length} cards, query: "${query}"]`,
    domainFilter ? `Domain filter: ${domainFilter}` : '',
    '',
    ...cards.slice(0, 10).map(
      (c, i) =>
        `${i + 1}. ${c.title ?? 'Untitled'} (score: ${c.score?.toFixed(3) ?? '?'})` +
        (c.summary ? `\n   ${c.summary.slice(0, 120)}` : '') +
        (c.sourceRef ? `\n   sourceRef: ${c.sourceRef}` : ''),
    ),
  ].filter(l => l !== '').join('\n');

  return {
    ok: true,
    query,
    totalCards: cards.length,
    packetAge: packet.generatedAt
      ? Math.round((Date.now() - new Date(packet.generatedAt).getTime()) / 60000) + 'min'
      : 'unknown',
    cards,
    sourceRefs,
    promptPacket,
    safeNextCommand: cards.length === 0 ? 'npm run ingest:pipeline' : 'node scripts/ingest/cache-ace-packet.mjs --audit',
  };
}

function buildRecommendation({ intent, domain, errorSummary, evidenceLines, patchTargets, proposedFix }) {
  const safeNextCommand =
    intent === 'repair' && patchTargets.length > 0
      ? `node --check ${patchTargets[0]}`
      : intent === 'repair'
        ? 'npm run svelte-check 2>&1 | head -30'
        : domain === 'retrieval'
          ? 'npm run ingest:pipeline'
          : domain === 'atlas-lane'
            ? 'npm run atlas:phase-lanes'
            : 'npm run smoke:opencode';

  const doNotDo = [];
  if (intent === 'repair') {
    doNotDo.push('Do not run drizzle-kit push without operator review');
    doNotDo.push('Do not delete or archive files without checking G1-G9 import gates');
  }
  if (domain === 'retrieval') {
    doNotDo.push('Do not clear Redis ace:packet:latest without running ingest:pipeline first');
  }
  doNotDo.push('Do not assume the fix succeeded — re-run the validator after patching');

  return {
    likely_cause: errorSummary,
    evidence: evidenceLines,
    patch_targets: patchTargets,
    proposed_fix: proposedFix ?? null,
    safe_next_command: safeNextCommand,
    do_not_do: doNotDo,
    intent,
    domain,
  };
}

// ── JSON-RPC dispatch ──────────────────────────────────────────────────────────

function dispatch(method, params, id) {
  if (method === 'initialize') {
    return { protocolVersion: PROTOCOL_VERSION, serverInfo: SERVER_INFO, capabilities: { tools: {} } };
  }
  if (method === 'notifications/initialized') return null;
  if (method === 'tools/list') {
    return { tools: TOOLS };
  }
  if (method === 'tools/call') {
    const { name, arguments: args = {} } = params ?? {};
    try {
      let result;
      if (name === 'classify_intent')           result = classifyIntent(args);
      else if (name === 'build_agentic_rag_context') result = buildAgenticRagContext(args);
      else if (name === 'build_recommendation') result = buildRecommendation(args);
      else throw new Error(`Unknown tool: ${name}`);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    } catch (e) {
      return { content: [{ type: 'text', text: JSON.stringify({ error: e.message }) }], isError: true };
    }
  }
  throw Object.assign(new Error(`Method not found: ${method}`), { code: -32601 });
}

// ── Stdio loop ─────────────────────────────────────────────────────────────────

const rl = createInterface({ input: process.stdin, terminal: false });

rl.on('line', line => {
  if (!line.trim()) return;
  let msg;
  try { msg = JSON.parse(line); } catch { return; }

  const { method, params, id } = msg;
  const isNotif = id === undefined || id === null;

  try {
    const result = dispatch(method, params, id);
    if (isNotif || result === null) return;
    process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, result }) + '\n');
  } catch (e) {
    if (isNotif) return;
    process.stdout.write(JSON.stringify({
      jsonrpc: '2.0', id,
      error: { code: e.code ?? -32603, message: e.message },
    }) + '\n');
  }
});

log('atlas-tools MCP ready (classify_intent, build_agentic_rag_context, build_recommendation)');