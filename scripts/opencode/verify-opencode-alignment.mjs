#!/usr/bin/env node
// Read-only check that the OpenCode plan/build/default agents are aligned (to-do tool available, write-capable MCP tools
// denied, MCP schema token cost kept off the default path). Uses `opencode debug agent <name> --pure` (no plugins, no model
// call, no MCP server spawn). Exit 1 on any failed assertion. Usage: node scripts/opencode/verify-opencode-alignment.mjs
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const failures = [];
const check = (ok, msg) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${msg}`); if (!ok) failures.push(msg); };

function agent(name) {
  const r = spawnSync('opencode', ['debug', 'agent', name, '--pure'], { cwd: ROOT, encoding: 'utf8', shell: process.platform === 'win32', timeout: 90000 });
  const out = `${r.stdout ?? ''}`;
  const start = out.indexOf('{');
  if (r.status !== 0 || start < 0) { check(false, `opencode debug agent ${name} failed to run`); return null; }
  return JSON.parse(out.slice(start));
}
const glob = (pattern, value) => new RegExp(`^${pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`).test(value);
// Last matching rule wins (OpenCode ruleset semantics); permission names and patterns are both globs (e.g. `claude-mem*`).
function action(a, permission, pattern = '*') {
  let result = null;
  for (const rule of a.permission ?? []) {
    if (!glob(rule.permission, permission)) continue;
    if (!glob(rule.pattern ?? '*', pattern)) continue;
    result = rule.action;
  }
  return result;
}

const plan = agent('plan');
const build = agent('build');
const kernel = agent('ornith-atlas-kernel');
for (const [name, a] of [['plan', plan], ['build', build], ['ornith-atlas-kernel (default)', kernel]]) {
  if (!a) continue;
  check(a.tools?.todowrite === true, `${name}: todowrite tool available (to-do list can be created)`);
  check(action(a, 'atlas-tools_record_outcome') === 'deny', `${name}: atlas-tools_record_outcome (writes NDJSON + Neo4j) is denied`);
  check(action(a, 'claude-mem_work_state_write') === 'deny', `${name}: claude-mem write tools are denied`);
}
if (plan) check(action(plan, 'edit', 'src/x.ts') === 'deny', 'plan: source edits denied (read-only planning)');
if (build) check(action(build, 'edit', 'src/x.ts') !== 'deny', 'build: source edits allowed');
if (kernel) check(action(kernel, 'atlas-tools_find_feature') === 'allow', 'default agent: atlas-tools read tools callable');

const sys = readFileSync(resolve(ROOT, '.opencode/system.md'), 'utf8');
check(!/TODO lists or numbered phase trackers unless the user explicitly requests them/.test(sys), 'system.md no longer bans to-do lists outright');
check(/todowrite/.test(sys), 'system.md instructs plan/build to use todowrite');

const cfg = readFileSync(resolve(ROOT, '.opencode/opencode.jsonc'), 'utf8');
check(/"trace\*":\s*false/.test(cfg) && /"claude-mem\*":\s*false/.test(cfg), 'project config: trace* and claude-mem* tool schemas off by default (token budget)');

console.log(failures.length ? `\n${failures.length} check(s) failed` : '\nOpenCode agent alignment OK');
process.exit(failures.length ? 1 : 0);
