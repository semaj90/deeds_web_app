#!/usr/bin/env node
// posttooluse-audit.mjs — Claude Code PostToolUse hook.
//
// Appends one JSONL line per tool call to memory/runs/claude-code/<YYYY-MM-DD>.jsonl
// for an offline-readable audit trail. Per the agent-OS doc: this is what
// the `evidence-pipeline-auditor` subagent reads to reconstruct who-did-what.
//
// Best-effort: errors are swallowed (we never want the audit to break a tool call).
// Output: empty (no permission decision needed for PostToolUse observation).

import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { readFileSync } from 'node:fs';

const ROOT = 'c:/Users/james/Videos/deeds-web-app';

let payload;
try { payload = JSON.parse(readFileSync(0, 'utf8')); }
catch { process.exit(0); }

try {
  const tool = payload.tool_name ?? payload.tool ?? 'unknown';
  const ti   = payload.tool_input ?? payload.input ?? {};
  const tr   = payload.tool_response ?? payload.response ?? {};

  // Build a compact entry. Truncate long fields so the JSONL stays grep-friendly.
  const entry = {
    ts: new Date().toISOString(),
    tool,
    // Common identifying fields (subset varies by tool):
    file_path:  ti.file_path  ?? ti.path  ?? null,
    command:    typeof ti.command === 'string' ? ti.command.slice(0, 240) : null,
    pattern:    ti.pattern   ?? null,
    url:        ti.url       ?? null,
    description:typeof ti.description === 'string' ? ti.description.slice(0, 120) : null,
    // Outcome — best-effort; PostToolUse fires after a successful call by default.
    success:    tr.success ?? (tr.error ? false : true),
    error:      typeof tr.error === 'string' ? tr.error.slice(0, 200) : null,
    // Hook metadata
    cwd:        payload.cwd ?? null,
    session_id: payload.session_id ?? payload.sessionId ?? null,
  };
  // Strip nulls for compactness.
  for (const k of Object.keys(entry)) if (entry[k] === null) delete entry[k];

  const date    = entry.ts.slice(0, 10); // YYYY-MM-DD
  const logPath = resolve(ROOT, 'memory', 'runs', 'claude-code', `${date}.jsonl`);
  mkdirSync(dirname(logPath), { recursive: true });
  appendFileSync(logPath, JSON.stringify(entry) + '\n', 'utf8');
} catch {
  // Swallow — never break a tool call because the audit failed.
}
process.exit(0);
