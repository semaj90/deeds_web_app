#!/usr/bin/env node
// ANSWER-FINALIZER-01: headless `opencode run` with ONE continuation when the final answer is empty (e.g. the step-cap forced turn returns an empty <think></think>).
// Records a receipt of both turns. Diagnostic only: canonicalAuthority=false; the run itself is whatever the agent's permissions allow (use a read-only agent).
// Usage: node scripts/opencode/run-with-finalizer.mjs --agent ornith-atlas-kernel [--out receipt.json] [--with-plugins] "<query>"
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

export const FINALIZER = 'Do not call any more tools. Write your final answer now as plain text, in 8 lines or fewer, using only what you already found. Cite file paths. If something is not wired or not found, say so instead of inferring.';
export const MIN_ANSWER_CHARS = 40;
export const stripThink = (t) => t.replace(/<think>[\s\S]*?<\/think>/g, '').trim();

// True when a turn's final text is too short to count as an answer (empty think block, forced-final-turn blank, etc.).
export const needsFinalizer = (finalText) => !finalText || finalText.length < MIN_ANSWER_CHARS;

export function parseEvents(stdout) {
  return (stdout ?? '').split(/\r?\n/).filter((l) => l.startsWith('{')).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
}

export function summarizeEvents(events) {
  const calls = events.filter((e) => e.type === 'tool_use').map((e) => e.part?.tool ?? 'unknown');
  let perStep = 0, maxPerStep = 0;
  for (const e of events) { if (e.type === 'step_start') perStep = 0; else if (e.type === 'tool_use') { perStep += 1; maxPerStep = Math.max(maxPerStep, perStep); } }
  const texts = events.filter((e) => e.type === 'text').map((e) => e.part?.text ?? '');
  const tokens = events.filter((e) => e.type === 'step_finish').map((e) => e.part?.tokens?.total ?? null);
  const counts = {}; for (const c of calls) counts[c] = (counts[c] ?? 0) + 1;
  return {
    sessionId: events.map((e) => e.sessionID ?? e.part?.sessionID).find(Boolean) ?? null,
    steps: events.filter((e) => e.type === 'step_start').length, toolCalls: counts, maxCallsInOneStep: maxPerStep,
    atlasToolsCalls: calls.filter((c) => c.startsWith('atlas-tools')).length,
    writeAttempts: calls.filter((c) => ['edit', 'write', 'patch'].includes(c) || c.includes('record_outcome')).length,
    lastContextTokens: tokens.at(-1) ?? null, peakContextTokens: Math.max(0, ...tokens.filter(Number.isFinite)),
    finalText: stripThink(texts.at(-1) ?? ''),
  };
}

function main() {
  const argv = process.argv.slice(2);
  const flag = (name) => { const i = argv.indexOf(name); return i >= 0 ? argv.splice(i, 2)[1] : null; };
  const agent = flag('--agent') ?? 'ornith-atlas-kernel';
  const out = flag('--out') ?? resolve(ROOT, '.tmp', 'opencode-run-receipts', `run-${Date.now()}.json`);
  const withPlugins = argv.includes('--with-plugins') && argv.splice(argv.indexOf('--with-plugins'), 1).length > 0;
  const query = argv.join(' ').trim();
  if (!query) { console.error('usage: run-with-finalizer.mjs --agent <name> "<query>"'); process.exit(2); }

  function turn(kind, message, sessionId) {
    const args = ['run', ...(withPlugins ? [] : ['--pure']), '--agent', agent, '--format', 'json', '--title', `finalizer:${kind}`, ...(sessionId ? ['--session', sessionId] : []), message];
    const started = Date.now();
    const r = spawnSync('opencode', args, { cwd: ROOT, encoding: 'utf8', timeout: 1_200_000, maxBuffer: 64 * 1024 * 1024 });
    if (r.error) throw r.error;
    const s = summarizeEvents(parseEvents(r.stdout));
    return { kind, exitCode: r.status, seconds: Math.round((Date.now() - started) / 1000), ...s, sessionId: s.sessionId ?? sessionId ?? null };
  }

  const first = turn('primary', query, null);
  const turns = [first];
  let finalizerUsed = false;
  if (needsFinalizer(first.finalText)) {
    if (!first.sessionId) { console.error('no sessionId captured; cannot finalize'); }
    else { finalizerUsed = true; turns.push(turn('finalizer', FINALIZER, first.sessionId)); }
  }
  const finalAnswer = turns.at(-1).finalText;
  const receipt = {
    schema: 'atlas.opencode-run-receipt.v1', generatedAt: new Date().toISOString(), agent, plugins: withPlugins ? 'enabled' : 'pure',
    query, finalizerUsed, answered: !needsFinalizer(finalAnswer), finalAnswer, turns,
    totals: { steps: turns.reduce((a, t) => a + t.steps, 0), seconds: turns.reduce((a, t) => a + t.seconds, 0), writeAttempts: turns.reduce((a, t) => a + t.writeAttempts, 0) },
    canonicalAuthority: false, writesPerformed: false,
  };
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(receipt, null, 2) + '\n');
  console.log(JSON.stringify({ out, answered: receipt.answered, finalizerUsed, totals: receipt.totals, atlasToolsCalls: turns.reduce((a, t) => a + t.atlasToolsCalls, 0) }));
  console.log(finalAnswer);
  process.exit(receipt.answered ? 0 : 1);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
