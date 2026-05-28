#!/usr/bin/env node
import fs from 'fs';
import path from 'path';

const DEFAULT_FILE = process.argv[2] || path.resolve(process.cwd(), '.tmp', 'scenarios.jsonl');
const BASE_URL = process.env.SCENARIO_API_URL || 'http://localhost:5173';

async function postScenario(obj) {
  const res = await fetch(`${BASE_URL}/api/ai/scenario`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(obj),
  });
  return res.json();
}

async function run() {
  if (!fs.existsSync(DEFAULT_FILE)) {
    console.error('File not found:', DEFAULT_FILE);
    process.exit(1);
  }
  const rl = fs.readFileSync(DEFAULT_FILE, 'utf8').split(/\r?\n/).filter(Boolean);
  console.log(`Indexing ${rl.length} scenarios to ${BASE_URL}/api/ai/scenario`);
  let ok = 0;
  for (const line of rl) {
    try {
      const obj = JSON.parse(line);
      const r = await postScenario(obj);
      if (r?.ok) ok++;
      else console.warn('Upsert failed:', r);
    } catch (err) {
      console.warn('skip line error', err);
    }
  }
  console.log(`Indexed ${ok}/${rl.length}`);
}

run().catch(e => { console.error(e); process.exit(2); });
