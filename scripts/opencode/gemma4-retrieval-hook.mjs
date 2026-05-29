#!/usr/bin/env node
// Gemma4 retrieval-loop writer hook (local append, dry-run safe)
// Usage examples:
// 1) From CLI args:
// node scripts/opencode/gemma4-retrieval-hook.mjs --query "fix tool schema" --selected '[".opencode/cards/000.json"]' --sourceRefs '["scripts/opencode/validate-tool-schema.mjs"]' --rerankScore 0.43 --tool classify_intent --outcome dry_run
// 2) Pipe a JSON object on stdin (preferred from orchestrator):
// echo '{"query":"...","selectedCardIds":[".."],"sourceRefs":[".."],"rerankScore":0.5,"tool":"classify_intent","outcome":"dry_run"}' | node scripts/opencode/gemma4-retrieval-hook.mjs

import fs from 'fs';
import path from 'path';

const argv = process.argv.slice(2);
const root = process.cwd();
const outPath = path.join(root, '.tmp', 'atlas-retrieval-loop.jsonl');

function parseArgJSON(val) {
  try { return JSON.parse(val); } catch (e) { return null; }
}

function parseArgs(args) {
  const res = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (!a.startsWith('--')) continue;
    const key = a.replace(/^--/, '');
    const next = args[i+1];
    if (!next || next.startsWith('--')) { res[key] = true; continue; }
    // if looks like JSON
    if (next.startsWith('{') || next.startsWith('[')) {
      res[key] = parseArgJSON(next) || next;
    } else {
      res[key] = next;
    }
    i++;
  }
  return res;
}

async function readStdin() {
  return new Promise((resolve) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', chunk => data += chunk);
    process.stdin.on('end', () => resolve(data.trim()));
    setTimeout(() => resolve(''), 10);
  });
}

async function main() {
  const argObj = parseArgs(argv);
  const stdin = await readStdin();
  let payload = null;
  if (stdin) {
    try { payload = JSON.parse(stdin); } catch (e) { /* ignore */ }
  }

  // build row from payload or args
  const now = new Date().toISOString();
  const row = {
    timestamp: now,
    query: (payload && payload.query) || argObj.query || 'unknown',
    intent: (payload && payload.intent) || argObj.intent || 'unknown',
    domain: (payload && payload.domain) || argObj.domain || 'agent-workflow',
    sourceRefs: (payload && payload.sourceRefs) || argObj.sourceRefs || [],
    selectedCardIds: (payload && payload.selectedCardIds) || argObj.selected || argObj.selectedCardIds || [],
    rerankScore: (payload && payload.rerankScore) || (argObj.rerankScore ? Number(argObj.rerankScore) : null) || null,
    tool: (payload && payload.tool) || argObj.tool || 'gemma4',
    outcome: (payload && payload.outcome) || argObj.outcome || 'dry_run',
    feedback: (payload && payload.feedback) || argObj.feedback || 'pending'
  };

  // normalize arrays
  if (!Array.isArray(row.sourceRefs)) row.sourceRefs = [row.sourceRefs].filter(Boolean);
  if (!Array.isArray(row.selectedCardIds)) row.selectedCardIds = [row.selectedCardIds].filter(Boolean);

  // ensure output dir
  try { fs.mkdirSync(path.dirname(outPath), { recursive: true }); } catch (e) {}

  const line = JSON.stringify(row) + '\n';
  try {
    // append atomically to legacy path
    fs.appendFileSync(outPath, line, { encoding: 'utf8' });
    console.log('Appended legacy retrieval-loop row to', outPath);
  } catch (e) {
    console.warn('Failed to append to legacy path (non-fatal):', e);
  }

  // Forward to new record-retrieval-outcome.mjs ledger
  try {
    const { execSync } = await import('child_process');
    const newOutcomePayload = {
      query: row.query,
      intent: row.intent,
      domain: row.domain,
      subdomain: 'legacy-hook',
      toolsUsed: [row.tool],
      sourceRefs: row.sourceRefs,
      graphNodes: row.selectedCardIds,
      cacheHit: false,
      recommendationAccepted: row.feedback === 'accepted' ? true : (row.feedback === 'rejected' ? false : null),
      outcome: row.outcome === 'dry_run' ? 'pending' : (row.outcome || 'pending'),
      reward: row.rerankScore,
      graphVersion: '2026-05-29',
      notes: `Legacy feedback: ${row.feedback}`
    };

    const recordScript = path.join(root, 'scripts/atlas/record-retrieval-outcome.mjs');
    execSync(`node "${recordScript}"`, {
      input: JSON.stringify(newOutcomePayload),
      encoding: 'utf-8'
    });
    console.log('Successfully forwarded to scripts/atlas/record-retrieval-outcome.mjs');
  } catch (e) {
    console.error('Failed to forward to record-retrieval-outcome.mjs:', e.message);
  }
}

main();
