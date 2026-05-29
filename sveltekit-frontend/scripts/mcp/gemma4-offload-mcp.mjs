#!/usr/bin/env node
// Stdio MCP server: offload short-form generation work from Claude Code
// to local Gemma4 (TurboQuant llama-server :8090, Ollama :11434 fallback).
//
// Speaks raw newline-delimited JSON-RPC 2.0 (MCP stdio transport) so it
// avoids the @modelcontextprotocol/sdk + zod version mismatch that broke
// the existing trace MCP server's tools/list.
//
// Wire into Claude Code via .claude/mcp.json or .vscode/mcp.json:
//   {
//     "mcpServers": {
//       "gemma4-offload": {
//         "command": "node",
//         "args": ["sveltekit-frontend/scripts/mcp/gemma4-offload-mcp.mjs"]
//       }
//     }
//   }

import { createInterface } from 'node:readline';

const TURBO_BASE  = process.env.TURBO_BASE  ?? 'http://127.0.0.1:8090';
const OLLAMA_BASE = process.env.OLLAMA_BASE ?? 'http://127.0.0.1:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL ?? 'gemma4-rotorquant:latest';
const REQUEST_TIMEOUT_MS = Number(process.env.GEMMA4_TIMEOUT_MS ?? 60_000);

const PROTOCOL_VERSION = '2024-11-05';
const SERVER_INFO = { name: 'gemma4-offload', version: '0.1.0' };

const log = (...args) => process.stderr.write('[gemma4-offload] ' + args.join(' ') + '\n');

// ── routing ───────────────────────────────────────────────────────────

async function fetchTimeout(url, opts = {}, ms = REQUEST_TIMEOUT_MS) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try { return await fetch(url, { ...opts, signal: ctrl.signal }); }
  finally { clearTimeout(t); }
}

async function turboquantChat(messages, { maxTokens = 256, temperature = 0.2 } = {}) {
  const res = await fetchTimeout(`${TURBO_BASE}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model: 'gemma4', messages, max_tokens: maxTokens, temperature, stream: false,
    }),
  });
  if (!res.ok) throw new Error(`turboquant ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const j = await res.json();
  return {
    backend: 'turboquant',
    content: j?.choices?.[0]?.message?.content ?? '',
    usage: j?.usage ?? null,
  };
}

async function ollamaChat(messages, { maxTokens = 256, temperature = 0.2 } = {}) {
  const res = await fetchTimeout(`${OLLAMA_BASE}/api/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model: OLLAMA_MODEL, messages, stream: false,
      options: { temperature, num_predict: maxTokens },
    }),
  });
  if (!res.ok) throw new Error(`ollama ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const j = await res.json();
  return {
    backend: 'ollama',
    content: j?.message?.content ?? '',
    usage: { prompt_tokens: j?.prompt_eval_count, completion_tokens: j?.eval_count },
  };
}

async function chatCascade(messages, opts) {
  try { return await turboquantChat(messages, opts); }
  catch (err) {
    log('turboquant failed, falling back to ollama:', err.message);
    return await ollamaChat(messages, opts);
  }
}

// ── tool implementations ──────────────────────────────────────────────

const TOOLS = [
  {
    name: 'gemma4_chat',
    description:
      'Send a chat completion to local Gemma4 (TurboQuant :8090, Ollama fallback). ' +
      'Use to offload short-form generation from Claude Code: drafting commit messages, ' +
      'summarising tool output, classifying a chunk, paraphrasing — anything where ' +
      'a 2B local model is good enough and you want to save Claude tokens.',
    inputSchema: {
      type: 'object',
      properties: {
        prompt: { type: 'string', description: 'User prompt (single-turn).' },
        system: { type: 'string', description: 'Optional system prompt.' },
        max_tokens: { type: 'number', default: 256, description: 'Maximum tokens to generate. Default 256.' },
        temperature: { type: 'number', default: 0.2, description: 'Sampling temperature (0=deterministic, 1=creative). Default 0.2.' },
      },
      required: ['prompt'],
    },
    async run({ prompt, system, max_tokens, temperature }) {
      const messages = [];
      if (system) messages.push({ role: 'system', content: system });
      messages.push({ role: 'user', content: prompt });
      const out = await chatCascade(messages, { maxTokens: max_tokens, temperature });
      return `[${out.backend}] ${out.content}`;
    },
  },
  {
    name: 'gemma4_summarize',
    description:
      'Summarise arbitrary text into N words using local Gemma4. Cheap, deterministic.',
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'The text to summarise.' },
        target_words: { type: 'number', default: 80, description: 'Target summary length in words. Default 80.' },
      },
      required: ['text'],
    },
    async run({ text, target_words = 80 }) {
      const out = await chatCascade([
        { role: 'system', content: `Summarise the user's text in roughly ${target_words} words. Plain prose, no preamble.` },
        { role: 'user', content: text },
      ], { maxTokens: Math.max(64, Math.ceil(target_words * 2)), temperature: 0.1 });
      return `[${out.backend}] ${out.content}`;
    },
  },
  {
    name: 'gemma4_classify',
    description:
      'Classify text into exactly one of the supplied labels. Returns the label string only.',
    inputSchema: {
      type: 'object',
      properties: {
        text: { type: 'string', description: 'The text to classify.' },
        labels: { type: 'array', items: { type: 'string', description: 'A candidate label.' }, minItems: 2, description: 'List of candidate labels (minimum 2). The model picks exactly one.' },
      },
      required: ['text', 'labels'],
    },
    async run({ text, labels }) {
      if (!Array.isArray(labels) || labels.length < 2) throw new Error('need ≥2 labels');
      const out = await chatCascade([
        { role: 'system', content:
          `Classify the user's text into exactly one of these labels: ${labels.join(', ')}. ` +
          `Reply with the chosen label only, no punctuation, no explanation.` },
        { role: 'user', content: text },
      ], { maxTokens: 16, temperature: 0 });
      const raw = (out.content ?? '').trim().toLowerCase();
      const match = labels.find(l => raw.startsWith(l.toLowerCase())) ?? labels[0];
      return match;
    },
  },
  {
    name: 'gemma4_health',
    description: 'Probe TurboQuant + Ollama backends. Returns which routes are live.',
    inputSchema: { type: 'object', properties: {} },
    async run() {
      const probe = async (url) => {
        try { const r = await fetchTimeout(url, {}, 3000); return r.ok ? 'ok' : `http ${r.status}`; }
        catch (e) { return `down (${e.message.slice(0, 60)})`; }
      };
      const turbo  = await probe(`${TURBO_BASE}/health`);
      const ollama = await probe(`${OLLAMA_BASE}/api/tags`);
      return JSON.stringify({ turboquant: turbo, ollama, model: OLLAMA_MODEL }, null, 2);
    },
  },
];

const TOOL_BY_NAME = Object.fromEntries(TOOLS.map(t => [t.name, t]));

// ── JSON-RPC plumbing ─────────────────────────────────────────────────

function send(msg) {
  process.stdout.write(JSON.stringify(msg) + '\n');
}

function reply(id, result) { send({ jsonrpc: '2.0', id, result }); }
function replyErr(id, code, message, data) {
  send({ jsonrpc: '2.0', id, error: { code, message, data } });
}

async function handle(req) {
  const { id, method, params } = req;

  if (method === 'initialize') {
    return reply(id, {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: { tools: {} },
      serverInfo: SERVER_INFO,
    });
  }

  if (method === 'notifications/initialized' || method?.startsWith('notifications/')) {
    return; // notifications take no response
  }

  if (method === 'tools/list') {
    return reply(id, {
      tools: TOOLS.map(t => ({
        name: t.name,
        description: t.description,
        inputSchema: t.inputSchema,
      })),
    });
  }

  if (method === 'tools/call') {
    const name = params?.name;
    const args = params?.arguments ?? {};
    const tool = TOOL_BY_NAME[name];
    if (!tool) return replyErr(id, -32601, `unknown tool: ${name}`);
    try {
      const text = await tool.run(args);
      return reply(id, { content: [{ type: 'text', text: String(text) }] });
    } catch (err) {
      return reply(id, {
        isError: true,
        content: [{ type: 'text', text: `error: ${err.message}` }],
      });
    }
  }

  if (method === 'ping') return reply(id, {});

  if (id !== undefined) replyErr(id, -32601, `method not found: ${method}`);
}

// ── stdio loop ────────────────────────────────────────────────────────

const inflight = new Set();
const rl = createInterface({ input: process.stdin });
rl.on('line', (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;
  let req;
  try { req = JSON.parse(trimmed); }
  catch { return log('parse error:', trimmed.slice(0, 120)); }
  const p = Promise.resolve(handle(req)).catch(err => {
    log('handler crash:', err.stack ?? err.message);
    if (req?.id !== undefined) replyErr(req.id, -32000, err.message);
  });
  inflight.add(p);
  p.finally(() => inflight.delete(p));
});
rl.on('close', async () => {
  await Promise.allSettled([...inflight]);
  process.exit(0);
});

log(`ready — turbo=${TURBO_BASE} ollama=${OLLAMA_BASE} model=${OLLAMA_MODEL}`);
