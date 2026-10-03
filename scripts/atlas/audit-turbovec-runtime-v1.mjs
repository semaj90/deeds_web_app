#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const reportPath = resolve(root, 'docs/reports/turbovec-runtime-v1.json');
const endpoint = process.env.TURBOVEC_URL ?? 'http://127.0.0.1:8791';
const wheelCandidates = [
  resolve(root, 'sveltekit-frontend/vendor/wheels/turbovec-0.3.0-cp39-abi3-winamd64.whl'),
  resolve(root, 'vendor/wheels/turbovec-0.3.0-cp39-abi3-winamd64.whl'),
];

let importProbe = null;
try {
  const raw = execFileSync(process.env.PYTHON ?? 'python', ['-c', [
    'import importlib.util, json',
    'spec=importlib.util.find_spec("turbovec")',
    'print(json.dumps({"importable": spec is not None, "origin": spec.origin if spec else None}))',
  ].join(';')], { cwd: root, encoding: 'utf8', timeout: 15_000 });
  importProbe = JSON.parse(raw.trim());
} catch (cause) {
  importProbe = { importable: false, error: cause instanceof Error ? cause.message : String(cause) };
}

let health = null;
try {
  const response = await fetch(`${endpoint.replace(/\/$/, '')}/health`, { signal: AbortSignal.timeout(5000) });
  health = { status: response.status, ok: response.ok, body: await response.json().catch(() => null) };
} catch (cause) {
  health = { status: null, ok: false, error: cause instanceof Error ? cause.message : String(cause) };
}

const wheelPaths = wheelCandidates.map((file) => ({ file, present: existsSync(file) }));
const installed = Boolean(importProbe?.importable || health?.ok);
const report = {
  schema: 'atlas.turbovec-runtime-receipt.v1',
  generatedAt: new Date().toISOString(),
  status: installed ? 'RUNTIME_OBSERVED_UNPROMOTED' : 'NOT_INSTALLED_OR_PROVEN',
  endpoint,
  importProbe,
  wheelPaths,
  health,
  executor: 'turbovec',
  role: 'semantic_prefilter_challenger',
  additionalSemanticVote: false,
  canonicalAuthority: false,
  writesPerformed: false,
};
mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ status: report.status, endpoint, importable: Boolean(importProbe?.importable), healthy: Boolean(health?.ok), reportPath }, null, 2));
