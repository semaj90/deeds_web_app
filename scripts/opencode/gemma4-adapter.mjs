#!/usr/bin/env node
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import pg from 'pg';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const execFileP = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');

function loadWorkspaceEnv() {
  for (const envPath of [path.join(ROOT, '.env'), path.join(ROOT, '.env.local')]) {
    if (!fs.existsSync(envPath)) continue;
    const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#') || !trimmed.includes('=')) continue;
      const idx = trimmed.indexOf('=');
      const key = trimmed.slice(0, idx).trim();
      const value = trimmed.slice(idx + 1).trim().replace(/^["']|["']$/g, '');
      if (key && value && !process.env[key]) {
        process.env[key] = value;
      }
    }
  }
}

loadWorkspaceEnv();

const DEFAULT_BASE_URL =
  process.env.OPENCODE_GEMMA4_URL ??
  process.env.GEMMA4_URL ??
  process.env.TURBO_BASE ??
  process.env.LLAMA_SERVER_URL ??
  process.env.OLLAMA_BASE_URL ??
  'http://127.0.0.1:8090';

function resolveLlamaServerModelId() {
  const explicit = String(process.env.LLAMA_MODEL ?? process.env.TURBOQUANT_MODEL ?? '').trim();
  if (explicit) return explicit;

  const modelPath = String(
    process.env.ROTORQUANT_MODEL_PATH ??
    process.env.TURBO_MODEL_PATH ??
    process.env.TURBOQUANT_MODEL_PATH ??
    '',
  ).trim();
  if (modelPath) {
    const base = path.basename(modelPath).trim();
    if (base) return base;
  }

  const gemma4 = String(process.env.GEMMA4_MODEL ?? '').trim();
  if (gemma4 && !/^gemma4-rotorquant(?::latest)?$/i.test(gemma4)) return gemma4;

  return 'hforf.gguf';
}

const DEFAULT_MODEL = resolveLlamaServerModelId();

const DEFAULT_SYSTEM =
  process.env.GEMMA4_SYSTEM ??
  'You are Gemma4 on the repo-audit path. Stay grounded in provided repo evidence.';

function normalizeBaseUrl(value) {
  return String(value ?? '').replace(/\/+$/, '');
}

async function checkHealth(baseUrl = DEFAULT_BASE_URL) {
  const base = normalizeBaseUrl(baseUrl);
  try {
    const res = await fetch(`${base}/health`, { method: 'GET' });
    return res.ok;
  } catch {
    return false;
  }
}

async function callLlamaServer(prompt, options = {}) {
  const base = normalizeBaseUrl(options.baseUrl ?? DEFAULT_BASE_URL);
  const body = {
    model: options.model ?? DEFAULT_MODEL,
    messages: [
      { role: 'system', content: options.system ?? DEFAULT_SYSTEM },
      { role: 'user', content: prompt },
    ],
    temperature: options.temperature ?? 0,
    max_tokens: options.maxTokens ?? 1024,
    stream: false,
    stop:
      options.stop ??
      ['<|channel>', '<think>', '</think>', 'Thinking:', 'Self-Correction', '<execute_bash>', '<|tool_call>'],
  };

  const res = await fetch(`${base}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`llama-server ${res.status}: ${detail || res.statusText}`);
  }

  const json = await res.json();
  return (
    json?.choices?.[0]?.message?.content ??
    json?.choices?.[0]?.text ??
    json?.output ??
    json?.text ??
    JSON.stringify(json)
  );
}

async function callMcpPrompt(prompt) {
  const res = await fetch('http://localhost:8788/v1/llm/infer', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ prompt }),
  });
  if (!res.ok) {
    throw new Error(`mcp status ${res.status}`);
  }
  const json = await res.json();
  return json.output || json.text || JSON.stringify(json);
}

async function callLocalCli(prompt) {
  try {
    const { stdout } = await execFileP('gemma4', ['--prompt', prompt], { timeout: 20000 });
    return stdout.toString();
  } catch {
    return null;
  }
}

export async function isAvailable() {
  if (await checkHealth()) {
    return { available: true, via: 'llama-server', baseUrl: normalizeBaseUrl(DEFAULT_BASE_URL), model: DEFAULT_MODEL };
  }

  try {
    const res = await fetch('http://localhost:8788/health', { method: 'GET' });
    if (res.ok) {
      return { available: true, via: 'mcp' };
    }
  } catch {
    // ignore
  }

  try {
    await execFileP('gemma4', ['--version'], { timeout: 2000 });
    return { available: true, via: 'cli' };
  } catch {
    return { available: false };
  }
}

async function queryDbRegistry(queryText, limit = 5) {
  const env = {};
  const envPath = path.join(ROOT, 'sveltekit-frontend', '.env');
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
      const m = line.trimEnd().match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
      if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  }
  const dbUrl = env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';
  const pool = new pg.Pool({ connectionString: dbUrl });
  try {
    const cleanQuery = String(queryText ?? '').replace(/[^a-zA-Z0-9\s]/g, ' ').trim();
    const tokens = cleanQuery.toLowerCase().split(/\s+/).filter(t => t.length >= 3);
    
    let rows = [];
    if (tokens.length > 0) {
      const searchTerms = tokens.join(' | ');
      const res = await pool.query(
        `SELECT source_ref, file_path, symbol, kind, feature_id, feature_label, summary, copy_merge_use,
                ts_rank_cd(to_tsvector('english', coalesce(summary, '')), to_tsquery('english', $1)) as rank
         FROM repo_function_registry
         WHERE to_tsvector('english', coalesce(summary, '')) @@ to_tsquery('english', $1)
            OR source_ref ILIKE $2
            OR feature_id ILIKE $2
         ORDER BY rank DESC, feature_id ASC
         LIMIT $3`,
        [searchTerms, `%${cleanQuery}%`, limit]
      );
      rows = res.rows;
    } else {
      const res = await pool.query(
        `SELECT source_ref, file_path, symbol, kind, feature_id, feature_label, summary, copy_merge_use
         FROM repo_function_registry
         ORDER BY feature_id ASC
         LIMIT $1`,
        [limit]
      );
      rows = res.rows;
    }
    return rows;
  } catch (err) {
    console.warn(`[gemma4-adapter] Registry DB query failed: ${err.message}. Using empty fallback.`);
    return [];
  } finally {
    await pool.end();
  }
}

export async function generate(prompt, options = {}) {
  // Extract context from DB-backed registry
  console.log(`[gemma4-adapter] Querying DB-backed registry for context...`);
  const topKRows = await queryDbRegistry(prompt, 5);
  let contextBlock = '';
  if (topKRows && topKRows.length > 0) {
    contextBlock = '\n\n=== REPO FUNCTION REGISTRY CONTEXT ===\n' +
      topKRows.map((r, i) => `${i + 1}. [${r.kind}] ${r.feature_id} -> ${r.source_ref || r.symbol}\n   Summary: ${r.summary}\n   Usage: ${r.copy_merge_use}`).join('\n') +
      '\n======================================\n';
    console.log(`[gemma4-adapter] Injected ${topKRows.length} registry rows into prompt.`);
  }

  const finalPrompt = prompt + contextBlock;
  const attemptOrder = [
    async () => callLlamaServer(finalPrompt, options),
    async () => callMcpPrompt(finalPrompt),
    async () => callLocalCli(finalPrompt),
  ];

  for (const attempt of attemptOrder) {
    try {
      const result = await attempt();
      if (result) return result;
    } catch {
      // continue to the next transport
    }
  }

  throw new Error(
    `Gemma4 unavailable on llama-server ${normalizeBaseUrl(options.baseUrl ?? DEFAULT_BASE_URL)} and MCP fallback did not respond.`
  );
}
