import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const script = path.join(repoRoot, 'scripts/atlas/promote-ast-symbols-to-registry.mjs');

test('dry-run rejects malformed promotion rows and keeps reports in scratch', () => {
  const scratch = mkdtempSync(path.join(os.tmpdir(), 'atlas-symbol-promotion-'));
  try {
    const input = path.join(scratch, 'nominations.jsonl');
    const report = path.join(scratch, 'promotion-report.json');
    const rows = [
      { symbol_key: 'key:valid', kind: 'function', name: 'run', language: 'typescript', byte_start: 0, byte_end: 10, source_ref: 'src/a.ts', source_revision: 'sha256:qualified' },
      { symbol_key: 'key:import', kind: 'function', name: "import { x } from 'x'", language: 'typescript', byte_start: 10, byte_end: 20, source_ref: 'src/a.ts', source_revision: 'sha256:qualified' },
      { symbol_key: 'key:unknown-language', kind: 'function', name: 'call', language: 'unknown', byte_start: 20, byte_end: 30, source_ref: 'src/a.ts', source_revision: 'sha256:qualified' },
      { symbol_key: 'key:variable', kind: 'variable', name: 'value', language: 'typescript', byte_start: 30, byte_end: 40, source_ref: 'src/a.ts', source_revision: 'sha256:qualified' },
    ];
    writeFileSync(input, `${rows.map((row) => JSON.stringify(row)).join('\n')}\n`);
    execFileSync(process.execPath, [script, `--input=${input}`, `--report-output=${report}`], { cwd: repoRoot });
    const receipt = JSON.parse(readFileSync(report, 'utf8'));
    assert.equal(receipt.inputNominations, 4);
    assert.equal(receipt.eligibleDeclarationLike, 1);
    assert.equal(receipt.excludedInvalidShape, 2);
    assert.equal(receipt.excludedVariables, 1);
    assert.equal(receipt.rowsAttempted, 0);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
});
