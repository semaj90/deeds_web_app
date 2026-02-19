#!/usr/bin/env node
import fetch from 'node-fetch';
import { spawnSync } from 'child_process';

function detectPort() {
  const r = spawnSync(process.execPath, ['scripts/detect-frontend-port.mjs'], { encoding: 'utf8' });
  if (r.status === 0) return parseInt(r.stdout.trim(), 10);
  return 5173;
}

const port = detectPort();

async function main() {
  const payload = { query: 'contract liability terms', model: 'claude', limit: 5 };
  try {
    const res = await fetch(`http://localhost:${port}/api/ai/vector-search`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
    });
    const txt = await res.text();
    console.log(`POST /api/ai/vector-search @ ${port} -> ${res.status}`);
    console.log(txt);
  } catch (e) {
    console.error('Vector test failed:', e.message);
    process.exit(1);
  }
}

main();
