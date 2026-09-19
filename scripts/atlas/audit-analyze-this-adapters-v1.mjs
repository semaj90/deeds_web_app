#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const reportPath = resolve(root, 'docs/reports/analyze-this-adapters-v1.json');
const query = process.argv.find((arg) => arg.startsWith('--query='))?.slice(8) || 'analyze this';

function run(command, args) {
  try {
    const stdout = execFileSync(command, args, { cwd: root, encoding: 'utf8', timeout: 15_000 });
    return { available: true, stdout };
  } catch (error) {
    return { available: false, error: error instanceof Error ? error.message : String(error) };
  }
}

const files = run('rg', ['--files', '-g', '!node_modules', '-g', '!docs/reports', '-g', '*.ts', '-g', '*.py']);
const lexical = run('rg', ['--json', '--max-count', '20', query, 'sveltekit-frontend', 'python', 'services']);
const astGrep = run('ast-grep', ['--version']);
const receipt = {
  schema: 'atlas.analyze-this-adapters.v1',
  generatedAt: new Date().toISOString(),
  query,
  sourceMode: 'WORKTREE_DIAGNOSTIC',
  inventory: { available: files.available, fileCount: files.stdout?.trim().split(/\r?\n/).filter(Boolean).length ?? 0 },
  lexical: { available: lexical.available, matchLines: lexical.stdout?.trim().split(/\r?\n/).filter(Boolean).length ?? 0, error: lexical.error ?? null },
  structural: { provider: 'ast-grep', available: astGrep.available, version: astGrep.stdout?.trim() ?? null, error: astGrep.error ?? null },
  provenance: { sourceRevision: null, parserRevision: astGrep.available ? astGrep.stdout?.trim() ?? null : null, canonicalAuthority: false },
  writesPerformed: false,
  nextGate: 'NORMALIZE_BOUNDED_EVIDENCE_IN_ANALYZE_THIS_COORDINATOR',
};
mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ reportPath, inventory: receipt.inventory, lexical: receipt.lexical, structural: receipt.structural }, null, 2));
