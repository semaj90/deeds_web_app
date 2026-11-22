#!/usr/bin/env node
// gan-validation-gate.mjs — Claude Code PostToolUse hook (Edit | Write).
//
// When a status artifact changes (an OpenSpec tasks.md or a docs/reports file), inject a reminder to run the
// existing `gan-validation` skill (~/.codex/skills/gan-validation/SKILL.md) before any item is marked done.
// Advisory only: it never blocks the tool call and never edits files.
//
// Rule it enforces: CREATED / WIRED / PROVEN / DONE are distinct. A checkbox flip is not proof.

import { readFileSync } from 'node:fs';

let payload;
try { payload = JSON.parse(readFileSync(0, 'utf8')); }
catch { process.exit(0); }

const filePath = String(payload?.tool_input?.file_path ?? '').replace(/\\/g, '/');
const isStatusArtifact =
  /\/openspec\/changes\/[^/]+\/tasks\.md$/.test(filePath) ||
  /\/docs\/reports\/[^/]+\.(md|json)$/.test(filePath);

if (!isStatusArtifact) process.exit(0);

const reminder = [
  `GAN validation gate: ${filePath} changed.`,
  'Before marking any item DONE or checking it [x], run the gan-validation skill:',
  '  CREATED = file exists · WIRED = production path calls it · PROVEN = live evidence · DONE = wired + proven + accepted.',
  'Cite for each claim: exact command, exact output, report path, and the task ID with its change (change#Lnn).',
  'Existence alone is not DONE. Leave the item open if no live evidence exists.',
].join('\n');

process.stdout.write(JSON.stringify({
  hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: reminder },
}));
