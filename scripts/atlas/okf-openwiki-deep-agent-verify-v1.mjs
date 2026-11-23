#!/usr/bin/env node
// Deterministic verifier for okf-openwiki-deep-agent-probe receipts.
// Read-only: prints a verdict JSON to stdout, writes nothing.
// Usage: node scripts/atlas/okf-openwiki-deep-agent-verify-v1.mjs <receipt.json>

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const receiptArg = process.argv[2];
if (!receiptArg) {
  console.error('usage: okf-openwiki-deep-agent-verify-v1.mjs <receipt.json>');
  process.exit(2);
}

const receiptPath = path.resolve(ROOT, receiptArg);
const receipt = JSON.parse(fs.readFileSync(receiptPath, 'utf8'));
const answer = typeof receipt.answer === 'string' ? receipt.answer : '';

// Ground truth from the manifest itself: top-level keys and registries children.
const manifestLines = fs.readFileSync(path.join(ROOT, '.okf', 'manifest.yaml'), 'utf8').split('\n');
const topLevel = manifestLines
  .filter((l) => /^[A-Za-z_][A-Za-z0-9_]*:/.test(l))
  .map((l) => l.split(':')[0]);
const regStart = manifestLines.findIndex((l) => /^registries:\s*$/.test(l));
const registryKeys = [];
for (let i = regStart + 1; i < manifestLines.length; i++) {
  const l = manifestLines[i];
  if (/^\S/.test(l) && l.trim() !== '') break; // left the registries block
  const m = /^ {2}([A-Za-z_][A-Za-z0-9_]*):\s*$/.exec(l);
  if (m) registryKeys.push(m[1]);
}

// Identifiers the answer names in backticks.
const named = new Set([...answer.matchAll(/`([^`\n]+)`/g)].map((m) => m[1].trim()));
const claimsRegistry = [...named].filter((c) => c.startsWith('registries.')).map((c) => c.slice('registries.'.length));

// Path claims: every cited path must exist and sit inside the read scopes.
const pathToken = /(?:\.okf|openwiki)\/[A-Za-z0-9_.\-\/]+/g;
const citedPaths = [...new Set([...answer.matchAll(pathToken)].map((m) => m[0].replace(/[.,;:)]+$/, '')))];
const pathChecks = citedPaths.map((p) => {
  const abs = path.resolve(ROOT, p);
  const exists = fs.existsSync(abs);
  const scoped = abs.startsWith(path.join(ROOT, '.okf') + path.sep) || abs.startsWith(path.join(ROOT, 'openwiki') + path.sep);
  return { path: p, exists, inReadScope: scoped, ok: exists && scoped };
});

// Coverage: how much of the manifest the answer names.
const coveredTop = topLevel.filter((k) => named.has(k));
// A registry counts as named when the answer uses its bare name or the `registries.<name>` form.
const coveredReg = registryKeys.filter((k) => named.has(k) || claimsRegistry.includes(k));

const checks = {
  receiptCompleted: receipt.status === 'COMPLETED',
  noWrites: receipt.writesPerformed === false,
  notCanonical: receipt.canonicalAuthority === false,
  allCitedPathsValid: pathChecks.every((c) => c.ok),
  noUnknownRegistryClaims: claimsRegistry.every((c) => registryKeys.includes(c)),
};

const verdict = {
  schema: 'atlas.okf-openwiki-deep-agent-verdict.v1',
  receipt: path.relative(ROOT, receiptPath).split(path.sep).join('/'),
  question: receipt.question,
  checks,
  pass: Object.values(checks).every(Boolean),
  coverage: {
    topLevelKeysInManifest: topLevel.length,
    topLevelKeysNamed: coveredTop.length,
    topLevelMissing: topLevel.filter((k) => !coveredTop.includes(k)),
    registryKeysInManifest: registryKeys.length,
    registryKeysNamed: coveredReg.length,
    registryMissing: registryKeys.filter((k) => !coveredReg.includes(k)),
  },
  citedPaths: pathChecks.length,
  citedPathsFailing: pathChecks.filter((c) => !c.ok).map((c) => c.path),
  unknownRegistryClaims: claimsRegistry.filter((c) => !registryKeys.includes(c)),
  canonicalAuthority: false,
  writesPerformed: false,
};

console.log(JSON.stringify(verdict, null, 2));
process.exitCode = verdict.pass ? 0 : 1;
