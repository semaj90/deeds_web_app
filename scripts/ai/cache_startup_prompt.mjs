#!/usr/bin/env node
import fs from 'fs';
import path from 'path';

const BOOT_FILE = path.resolve(process.cwd(), '.tmp', 'opencode-bootstrap.json');
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
  if (!fs.existsSync(BOOT_FILE)) {
    console.error('Bootstrap file not found:', BOOT_FILE);
    process.exit(1);
  }
  const data = JSON.parse(fs.readFileSync(BOOT_FILE, 'utf8'));
  const sys = data?.startupTruth?.systemPrompt || data?.startup_truth?.systemPrompt || data?.systemPrompt;
  if (!sys) {
    console.error('No system prompt found in bootstrap file');
    process.exit(1);
  }
  const scenario = {
    source_ref: 'startup:system_prompt',
    content_hash: `startup-system-prompt:${new Date().toISOString()}`,
    name: 'startup system prompt',
    description: 'Latest startup system prompt captured at bootstrap',
    metadata: { injected: true },
    embedding: null,
    response: sys
  };
  const r = await postScenario(scenario);
  console.log('cached', r);
}

run().catch(e => { console.error(e); process.exit(2); });
