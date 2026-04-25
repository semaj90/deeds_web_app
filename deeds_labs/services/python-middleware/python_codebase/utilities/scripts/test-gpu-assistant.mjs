#!/usr/bin/env node
import fs from 'node:fs/promises';
import fetch from 'node-fetch';

const ports = [5173, 5174, 5175, 5176, 5177];

async function isOk(url, opts = {}) {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 5000);
    const res = await fetch(url, { method: 'GET', signal: ctrl.signal });
    clearTimeout(t);
    return res.ok;
  } catch {
    return false;
  }
}

async function detectPort() {
  for (const p of ports) {
    if (await isOk(`http://localhost:${p}/api/ai/vector-search`)) return p;
    if (await isOk(`http://localhost:${p}/`)) return p;
  }
  return null;
}

async function postJson(url, body, timeoutMs = 15000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body ?? {}),
    signal: ctrl.signal
  });
  clearTimeout(t);
  const text = await res.text();
  try {
    return { status: res.status, json: JSON.parse(text), raw: text };
  } catch {
    return { status: res.status, json: null, raw: text };
  }
}

async function main() {
  const port = await detectPort();
  if (!port) {
    console.error('No frontend detected on', ports.join(','));
    process.exit(2);
  }

  const base = `http://localhost:${port}/demo/gpu-assistant`;
  const results = { port, timestamps: { start: new Date().toISOString() } };

  // Create session
  const sess = await postJson(`${base}/session`, {});
  results.session = sess;
  const sessionId = sess?.json?.sessionId;

  // Send a message
  if (sessionId) {
    const message = await postJson(`${base}/message`, {
      sessionId,
      content: 'Briefly summarize indemnification clauses in commercial contracts.',
      model: 'gemma3-legal'
    }, 30000);
    results.message = message;
  } else {
    results.message = { error: 'No sessionId returned' };
  }

  results.timestamps.end = new Date().toISOString();

  await fs.mkdir('logs', { recursive: true });
  await fs.writeFile('logs/gpu-assistant-test.json', JSON.stringify(results, null, 2));
  console.log(JSON.stringify({ ok: true, port, out: 'logs/gpu-assistant-test.json' }));
}

main().catch(async (e) => {
  const err = { error: e?.message || String(e), stack: e?.stack };
  await fs.mkdir('logs', { recursive: true });
  await fs.writeFile('logs/gpu-assistant-test.json', JSON.stringify(err, null, 2));
  console.error(err);
  process.exit(1);
});
