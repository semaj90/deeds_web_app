#!/usr/bin/env node
// OPENSPEC-LEDGER-CLASSIFICATION-01: a tasks-only directory under openspec/changes must either be
// a real change (proposal.md or specs/) or declare itself a CONSOLIDATION_LEDGER in tasks.md so it
// is never reported as strict-valid or treated as requirement authority. Read-only.
//
//   node scripts/atlas/audit-openspec-ledger-classification-v1.mjs [--root dir ...] [--json]
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const DEFAULT_ROOTS = ['openspec/changes', 'sveltekit-frontend/openspec/changes'];
// Pre-existing tasks-only directories not yet classified (tolerated debt; a NEW one fails).
export const TOLERATED_UNCLASSIFIED = new Set(['session-96-event-sourcing-gpu-complete']);

const BLOCK = /<!--\s*openspec-ledger-classification\s*([\s\S]*?)-->/;

export function parseClassification(tasksText) {
  const match = BLOCK.exec(tasksText ?? '');
  if (!match) return null;
  const fields = {};
  for (const line of match[1].split(/\r?\n/)) {
    const m = /^\s*([A-Za-z]+)\s*:\s*(\S+)\s*$/.exec(line);
    if (m) fields[m[1]] = m[2];
  }
  return fields;
}

/** Pure verdict for one tasks-only directory. */
export function judgeLedger(name, tasksText, { tolerated = TOLERATED_UNCLASSIFIED } = {}) {
  const c = parseClassification(tasksText);
  if (!c) {
    return tolerated.has(name)
      ? { name, verdict: 'UNCLASSIFIED_TOLERATED', violations: [] }
      : { name, verdict: 'FAIL', violations: ['TASKS_ONLY_DIRECTORY_NOT_CLASSIFIED'] };
  }
  const violations = [];
  if (c.artifactRole !== 'CONSOLIDATION_LEDGER') violations.push('ARTIFACT_ROLE_NOT_CONSOLIDATION_LEDGER');
  if (c.openspecChange !== 'false') violations.push('CLAIMS_TO_BE_AN_OPENSPEC_CHANGE');
  if (c.strictValidationEligible !== 'false') violations.push('CLAIMS_STRICT_VALIDATION_ELIGIBILITY');
  if (c.canonicalRequirementAuthority !== 'false') violations.push('CLAIMS_REQUIREMENT_AUTHORITY');
  // Only a claim about THIS directory counts; quoting another change's validity is fine.
  const own = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (new RegExp(`openspec validate\\s+${own}\\s[^\\n]*?--strict\\W{0,6}(passed|passes|valid|PASS)\\b`, 'i').test(tasksText)) violations.push('CLAIMS_STRICT_VALIDATION_PASSED');
  return { name, verdict: violations.length ? 'FAIL' : 'CLASSIFIED_LEDGER', violations };
}

export function auditRoots(roots, { readText = (p) => readFileSync(p, 'utf8') } = {}) {
  const results = [];
  for (const root of roots) {
    if (!existsSync(root)) continue;
    for (const entry of readdirSync(root)) {
      if (entry === 'archive') continue;
      const dir = join(root, entry);
      if (!statSync(dir).isDirectory()) continue;
      const tasks = join(dir, 'tasks.md');
      if (!existsSync(tasks) || existsSync(join(dir, 'proposal.md')) || existsSync(join(dir, 'specs'))) continue;
      results.push({ root, ...judgeLedger(entry, readText(tasks)) });
    }
  }
  return results;
}

function main() {
  const argv = process.argv.slice(2);
  const roots = [];
  for (let i = 0; i < argv.length; i += 1) if (argv[i] === '--root') roots.push(argv[++i]);
  const results = auditRoots((roots.length ? roots : DEFAULT_ROOTS).map((r) => resolve(r)));
  const failed = results.filter((r) => r.verdict === 'FAIL');
  console.log(JSON.stringify({ status: failed.length ? 'FAIL' : 'PASS', tasksOnlyDirectories: results.length, results, writesPerformed: false }, null, 2));
  if (failed.length) process.exitCode = 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
