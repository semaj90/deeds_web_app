#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const SERVICE_SCRIPT = path.join(ROOT, 'docker', 'langextract-optimized', 'langextract_service.py');
const REPORT_JSON = path.join(ROOT, 'docs', 'reports', 'langextract-gemma4-service-proof.json');
const REPORT_MD = path.join(ROOT, 'docs', 'reports', 'langextract-gemma4-service-proof.md');
const LOG_DIR = path.join(ROOT, 'logs', 'langextract-gemma4');

const argv = new Set(process.argv.slice(2));
const CHECK_ONLY = argv.has('--check');
const PORT = Number(process.env.LANGEXTRACT_PORT || 8095);
const BASE_URL = `http://127.0.0.1:${PORT}`;
const LLAMA_SERVER_URL = String(
  process.env.LLAMA_SERVER_URL ||
    process.env.TURBOQUANT_BASE_URL ||
    'http://127.0.0.1:8090/v1',
  ).replace(/\/+$/, '');
const LANGEXTRACT_MODEL = String(process.env.LANGEXTRACT_MODEL || 'gemma4-legal-iq4xs-direct');

function writeReport(report) {
  fs.mkdirSync(path.dirname(REPORT_JSON), { recursive: true });
  fs.writeFileSync(REPORT_JSON, JSON.stringify(report, null, 2), 'utf8');
  fs.writeFileSync(
    REPORT_MD,
    [
      '# LangExtract Gemma4 Service Proof',
      '',
      `Generated: ${report.generated_at}`,
      `Status: ${report.status}`,
      '',
      '## Runtime',
      '',
      `- langextract_url: ${report.langextract_url}`,
      `- llama_server_url: ${report.llama_server_url}`,
      `- model: ${report.model}`,
      `- pid: ${report.pid ?? 'n/a'}`,
      '',
      '## Health',
      '',
      `- HTTP status: ${report.health?.status ?? 'n/a'}`,
      `- llama_server_available: ${report.health?.body?.services?.llama_server_available === true ? 'PASS' : 'FAIL'}`,
      '',
      '## Notes',
      '',
      ...report.notes.map((note) => `- ${note}`),
      '',
    ].join('\n'),
    'utf8',
  );
}

async function getJson(url, timeoutMs = 8000) {
  const response = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { raw: text };
  }
  return { ok: response.ok, status: response.status, body };
}

async function health() {
  try {
    return await getJson(`${BASE_URL}/health`);
  } catch (error) {
    return {
      ok: false,
      status: 0,
      body: { error: error instanceof Error ? error.message : String(error) },
  };
}

async function probeBackendModels() {
  try {
    return await getJson(`${LLAMA_SERVER_URL}/models`);
  } catch (error) {
    return {
      ok: false,
      status: 0,
      body: { error: error instanceof Error ? error.message : String(error) },
    };
  }
}

async function probeBackendChat() {
  try {
    const response = await fetch(`${LLAMA_SERVER_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.LANGEXTRACT_API_KEY || 'local'}`,
      },
      body: JSON.stringify({
        model: process.env.LANGEXTRACT_MODEL_ID || LANGEXTRACT_MODEL,
        messages: [
          { role: 'system', content: 'Return valid JSON only.' },
          { role: 'user', content: 'Return {"ok":true}' },
        ],
        temperature: 0,
        max_tokens: 32,
        stream: false,
        response_format: { type: 'json_object' },
      }),
      signal: AbortSignal.timeout(8000),
    });

    const text = await response.text();
    let body = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = { raw: text };
    }
    return { ok: response.ok, status: response.status, body };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      body: { error: error instanceof Error ? error.message : String(error) },
    };
  }
}
}

function startService() {
  fs.mkdirSync(LOG_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const out = fs.openSync(path.join(LOG_DIR, `langextract-${stamp}.out.log`), 'a');
  const err = fs.openSync(path.join(LOG_DIR, `langextract-${stamp}.err.log`), 'a');
  const child = spawn('python', [SERVICE_SCRIPT], {
    cwd: ROOT,
    detached: true,
    windowsHide: true,
    stdio: ['ignore', out, err],
    env: {
      ...process.env,
      LANGEXTRACT_PORT: String(PORT),
      LANGEXTRACT_PROVIDER: process.env.LANGEXTRACT_PROVIDER || 'openai',
      LANGEXTRACT_MODEL_ID: process.env.LANGEXTRACT_MODEL_ID || LANGEXTRACT_MODEL,
      LANGEXTRACT_BASE_URL: process.env.LANGEXTRACT_BASE_URL || LLAMA_SERVER_URL,
      LANGEXTRACT_API_KEY: process.env.LANGEXTRACT_API_KEY || 'local',
      LLAMA_SERVER_URL,
      LANGEXTRACT_MODEL,
      ENABLE_SPACY: process.env.ENABLE_SPACY ?? 'false',
    },
  });
  child.unref();
  return child.pid;
}

async function main() {
  const notes = [
    'LangExtract uses Gemma4 on the llama-server OpenAI-compatible lane; Ollama is not part of this backend.',
    'Use explicit 127.0.0.1 instead of localhost to avoid IPv6 service collisions.',
  ];

  const backendModels = await probeBackendModels();
  const backendChat = await probeBackendChat();
  let current = await health();
  let pid = null;
  if (!current.ok && !CHECK_ONLY) {
    pid = startService();
    await new Promise((resolve) => setTimeout(resolve, 4500));
    current = await health();
  }

  const status = current.ok && current.body?.services?.llama_server_available === true ? 'LIVE_PASS' : 'FAIL';
  const report = {
    generated_at: new Date().toISOString(),
    status,
    langextract_url: BASE_URL,
    llama_server_url: LLAMA_SERVER_URL,
    model: LANGEXTRACT_MODEL,
    provider: process.env.LANGEXTRACT_PROVIDER || 'openai',
    backend_models: backendModels,
    backend_chat: backendChat,
    pid,
    health: current,
    notes,
  };
  writeReport(report);
  console.log(JSON.stringify(report, null, 2));
  process.exit(status === 'LIVE_PASS' ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
