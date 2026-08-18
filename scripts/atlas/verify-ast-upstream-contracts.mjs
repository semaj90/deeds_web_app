#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const manifestPath = resolve(repoRoot, 'docs/atlas/ast-upstream-contract-manifest.json');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));

async function fetchText(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error(`${url} returned HTTP ${response.status}`);
  return response.text();
}

const results = [];
for (const contract of manifest.contracts) {
  try {
    const source = await fetchText(contract.rawUrl);
    const missingFragments = contract.requiredFragments.filter((fragment) => !source.includes(fragment));
    results.push({
      id: contract.id,
      repository: contract.repository,
      revision: contract.revision,
      path: contract.path,
      status: missingFragments.length === 0 ? 'PASS' : 'FAIL',
      missingFragments,
    });
  } catch (error) {
    results.push({
      id: contract.id,
      repository: contract.repository,
      revision: contract.revision,
      path: contract.path,
      status: 'ERROR',
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

const status = results.every((result) => result.status === 'PASS') ? 'PROVEN_UPSTREAM_CONTRACTS' : 'DEGRADED';
const report = {
  schemaVersion: 'atlas.ast.upstream-contract-proof.v1',
  generatedAt: new Date().toISOString(),
  status,
  manifest: 'docs/atlas/ast-upstream-contract-manifest.json',
  results,
};

console.log(JSON.stringify(report, null, 2));
if (status !== 'PROVEN_UPSTREAM_CONTRACTS') process.exitCode = 2;
