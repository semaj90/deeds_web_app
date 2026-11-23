#!/usr/bin/env node
// Read-only Deep Agents probe for OKF + OpenWiki awareness.
// Canonical authority: none. Writes: one new receipt file only (no overwrite).
// Tools are read-only and confined to .okf/ and openwiki/ under the repo root.
// Model: llama-server :8090 (OpenAI-compatible), resolved from /v1/models.

import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const ORCH_PKG = path.join(ROOT, 'packages', 'atlas-orchestrator', 'package.json');
const FRONT_PKG = path.join(ROOT, 'sveltekit-frontend', 'package.json');
const LLAMA_URL = process.env.LLAMA_SERVER_URL || 'http://127.0.0.1:8090';
const MAX_READ_BYTES = 12_000;
const RECURSION_LIMIT = 12;
const RECEIPT_PATH = path.join(
  ROOT, 'docs', 'reports',
  `okf-openwiki-deep-agent-probe-v1.${new Date().toISOString().replace(/[:.]/g, '-')}.json`,
);

const requireOrch = createRequire(ORCH_PKG);
const requireFront = createRequire(FRONT_PKG);
const { createDeepAgent } = requireOrch('deepagents');
const { tool } = requireOrch('@langchain/core/tools');
const { z } = requireOrch('zod');
const { ChatOpenAI } = requireFront('@langchain/openai');

const ALLOWED_ROOTS = [path.join(ROOT, '.okf'), path.join(ROOT, 'openwiki')];

function within(abs, root) {
  return abs === root || abs.startsWith(root + path.sep);
}

// Resolve symlinks before the containment check so a link cannot escape the allowed roots.
function safeResolve(rel, roots = ALLOWED_ROOTS) {
  const abs = path.resolve(ROOT, rel);
  if (!roots.some((r) => within(abs, r))) throw new Error(`PATH_OUTSIDE_ALLOWED_ROOTS: ${rel}`);
  const real = fs.realpathSync(abs);
  const realRoots = roots.map((r) => fs.realpathSync(r));
  if (!realRoots.some((r) => within(real, r))) throw new Error(`PATH_RESOLVES_OUTSIDE_ROOTS: ${rel}`);
  return real;
}

const OKF_ROOT = [path.join(ROOT, '.okf')];
const WIKI_ROOT = [path.join(ROOT, 'openwiki')];

function listTree(dir, depth = 0, out = []) {
  if (depth > 3) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) listTree(p, depth + 1, out);
    else if (/\.(md|ya?ml|json)$/i.test(e.name)) out.push(path.relative(ROOT, p).split(path.sep).join('/'));
  }
  return out;
}

const okfListFiles = tool(
  async () => JSON.stringify(listTree(path.join(ROOT, '.okf')).slice(0, 200)),
  { name: 'okf_list_files', description: 'List OKF manifest, schema, index and pipeline files (repo-relative paths).', schema: z.object({}) },
);

const okfReadFile = tool(
  async ({ path: rel }) => {
    const abs = safeResolve(rel, OKF_ROOT);
    const text = fs.readFileSync(abs, 'utf8');
    return text.length > MAX_READ_BYTES ? text.slice(0, MAX_READ_BYTES) + '\n[TRUNCATED]' : text;
  },
  {
    name: 'okf_read_file',
    description: 'Read one OKF file under .okf/ (repo-relative path, e.g. ".okf/manifest.yaml"). Bounded to 12 KB.',
    schema: z.object({ path: z.string().min(1) }),
  },
);

const wikiListPages = tool(
  async () => JSON.stringify(listTree(path.join(ROOT, 'openwiki')).slice(0, 200)),
  { name: 'openwiki_list_pages', description: 'List OpenWiki markdown pages (repo-relative paths).', schema: z.object({}) },
);

const wikiReadPage = tool(
  async ({ path: rel }) => {
    const abs = safeResolve(rel, WIKI_ROOT);
    const text = fs.readFileSync(abs, 'utf8');
    return text.length > MAX_READ_BYTES ? text.slice(0, MAX_READ_BYTES) + '\n[TRUNCATED]' : text;
  },
  {
    name: 'openwiki_read_page',
    description: 'Read one OpenWiki page under openwiki/ (repo-relative path). Bounded to 12 KB. Read-only.',
    schema: z.object({ path: z.string().min(1) }),
  },
);

async function resolveModelId() {
  const res = await fetch(`${LLAMA_URL}/v1/models`, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`MODEL_LIST_HTTP_${res.status}`);
  const body = await res.json();
  const id = body?.data?.[0]?.id ?? body?.models?.[0]?.model;
  if (!id) throw new Error('MODEL_ID_UNRESOLVED');
  return id;
}

const SYSTEM_PROMPT = [
  'You answer questions about this repository using only the OKF and OpenWiki files you can read.',
  'Use the tools to list and read files. Cite every claim with a repo-relative path.',
  'Never claim a file exists unless a tool listed it. Say "not found" when it is missing.',
  'You cannot write, modify or delete anything. Keep the final answer under 250 words.',
].join(' ');

async function main() {
  const question = process.argv.slice(2).join(' ').trim() ||
    'Which OKF registries does the manifest declare, and which OpenWiki sections exist? Cite paths.';
  const modelId = await resolveModelId();
  const model = new ChatOpenAI({
    model: modelId,
    apiKey: 'not-needed',
    temperature: 0,
    maxRetries: 0,
    configuration: { baseURL: `${LLAMA_URL}/v1` },
  });
  const agent = createDeepAgent({
    model,
    tools: [okfListFiles, okfReadFile, wikiListPages, wikiReadPage],
    systemPrompt: SYSTEM_PROMPT,
  });

  const started = Date.now();
  let status = 'COMPLETED';
  let answer = null;
  let failure = null;
  let toolCalls = [];
  try {
    const result = await agent.invoke(
      { messages: [{ role: 'user', content: question }] },
      { recursionLimit: RECURSION_LIMIT },
    );
    const msgs = result?.messages ?? [];
    const last = msgs[msgs.length - 1];
    answer = typeof last?.content === 'string' ? last.content : JSON.stringify(last?.content ?? null);
    toolCalls = msgs
      .flatMap((m) => (Array.isArray(m?.tool_calls) ? m.tool_calls : []))
      .map((c) => c?.name)
      .filter(Boolean);
  } catch (err) {
    status = 'FAILED';
    failure = String(err?.message ?? err).slice(0, 500);
  }

  const receipt = {
    schema: 'atlas.okf-openwiki-deep-agent-probe.v1',
    generatedAt: new Date().toISOString(),
    status,
    failure,
    question,
    model: { id: modelId, endpoint: LLAMA_URL },
    durationMs: Date.now() - started,
    toolCallsObserved: toolCalls,
    answer,
    recursionLimit: RECURSION_LIMIT,
    canonicalAuthority: false,
    writesPerformed: false,
    readScopes: ['.okf/', 'openwiki/'],
  };

  if (fs.existsSync(RECEIPT_PATH)) {
    throw new Error(`RECEIPT_EXISTS_REFUSING_OVERWRITE: ${path.relative(ROOT, RECEIPT_PATH)}`);
  }
  fs.writeFileSync(RECEIPT_PATH, JSON.stringify(receipt, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify({ status, failure, toolCallsObserved: toolCalls, receipt: path.relative(ROOT, RECEIPT_PATH) }, null, 2));
  if (status !== 'COMPLETED') process.exitCode = 1;
}

main().catch((err) => {
  console.error(String(err?.stack ?? err));
  process.exitCode = 1;
});
