#!/usr/bin/env node
/**
 * scripts/atlas/record-retrieval-outcome.mjs
 *
 * Phase 7: Record retrieval/tool outcomes to the outcomes.jsonl ledger.
 * Matches training-data ready schema.
 *
 * Usage:
 *   node scripts/atlas/record-retrieval-outcome.mjs --query "..." --intent "..." ...
 */

import fs from 'fs';
import path from 'path';

const argv = process.argv.slice(2);
const root = process.cwd();
const ledgerDir = path.join(root, 'memory/retrieval');
const outPath = path.join(ledgerDir, 'outcomes.jsonl');

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
    const onData = chunk => data += chunk;
    const onEnd = () => {
      cleanup();
      resolve(data.trim());
    };
    
    const timer = setTimeout(() => {
      cleanup();
      resolve('');
    }, 15);

    function cleanup() {
      clearTimeout(timer);
      process.stdin.removeListener('data', onData);
      process.stdin.removeListener('end', onEnd);
      process.stdin.pause();
    }

    process.stdin.setEncoding('utf8');
    process.stdin.on('data', onData);
    process.stdin.on('end', onEnd);
  });
}

async function main() {
  const argObj = parseArgs(argv);
  const stdin = await readStdin();
  let payload = null;
  if (stdin) {
    try { payload = JSON.parse(stdin); } catch (e) { /* ignore */ }
  }

  const query = (payload && payload.query) || argObj.query || 'unknown';
  const intent = (payload && payload.intent) || argObj.intent || 'unknown';
  const domain = (payload && payload.domain) || argObj.domain || 'general';
  const subdomain = (payload && payload.subdomain) || argObj.subdomain || 'unknown';

  // Normalize toolsUsed
  let toolsUsed = (payload && (payload.toolsUsed ?? payload.tool)) || argObj.toolsUsed || argObj.tool || [];
  if (!Array.isArray(toolsUsed)) {
    toolsUsed = typeof toolsUsed === 'string' ? [toolsUsed] : [];
  }

  // Normalize sourceRefs
  let sourceRefs = (payload && (payload.sourceRefs ?? payload.sourceRef)) || argObj.sourceRefs || argObj.sourceRef || [];
  if (!Array.isArray(sourceRefs)) {
    sourceRefs = typeof sourceRefs === 'string' ? [sourceRefs] : [];
  }

  // Normalize graphNodes
  let graphNodes = (payload && (payload.graphNodes ?? payload.graphNode)) || argObj.graphNodes || argObj.graphNode || [];
  if (!Array.isArray(graphNodes)) {
    graphNodes = typeof graphNodes === 'string' ? [graphNodes] : [];
  }

  const cacheHit = (payload && payload.cacheHit !== undefined)
    ? !!payload.cacheHit
    : (argObj.cacheHit !== undefined ? argObj.cacheHit === 'true' || argObj.cacheHit === true : false);

  let recommendationAccepted = null;
  const rawRecAccepted = (payload && payload.recommendationAccepted !== undefined) ? payload.recommendationAccepted : argObj.recommendationAccepted;
  if (rawRecAccepted !== undefined && rawRecAccepted !== null) {
    recommendationAccepted = rawRecAccepted === 'true' || rawRecAccepted === true;
  }

  const outcome = (payload && payload.outcome) || argObj.outcome || 'pending';
  
  let reward = null;
  const rawReward = (payload && payload.reward !== undefined) ? payload.reward : argObj.reward;
  if (rawReward !== undefined && rawReward !== null) {
    reward = Number(rawReward);
  }

  const graphVersion = (payload && payload.graphVersion) || argObj.graphVersion || '2026-05-29';
  const notes = (payload && payload.notes) || argObj.notes || '';

  const row = {
    timestamp: new Date().toISOString(),
    query,
    intent,
    domain,
    subdomain,
    toolsUsed,
    sourceRefs,
    graphNodes,
    cacheHit,
    recommendationAccepted,
    outcome,
    reward,
    graphVersion,
    notes
  };

  // Ensure output dir exists
  if (!fs.existsSync(ledgerDir)) {
    fs.mkdirSync(ledgerDir, { recursive: true });
  }

  const line = JSON.stringify(row) + '\n';
  try {
    fs.appendFileSync(outPath, line, { encoding: 'utf8' });
    console.log('Appended outcome row to', outPath);
    console.log(JSON.stringify(row, null, 2));
  } catch (e) {
    console.error('Failed to append outcome row:', e);
    process.exitCode = 1;
  }
}

main().catch(console.error);
