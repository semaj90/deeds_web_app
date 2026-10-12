import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const script = path.join(repoRoot, 'scripts/atlas/nominate-ast-symbols-dry-run.mjs');

test('CLI emits only well-shaped declarations and writes receipts to scratch when requested', () => {
  const scratch = mkdtempSync(path.join(os.tmpdir(), 'atlas-symbol-nomination-'));
  try {
    const input = path.join(scratch, 'entities.jsonl');
    const output = path.join(scratch, 'nominations.jsonl');
    const report = path.join(scratch, 'receipt.json');
    const sourceRevision = `sha256:${'a'.repeat(64)}`;
    const candidates = [
      { source_ref: 'src/a.ts', source_revision: sourceRevision, symbol_name: 'work', symbol_kind: 'function', language: 'typescript', start_byte: 0, end_byte: 10 },
      { source_ref: 'src/a.ts', source_revision: sourceRevision, symbol_name: "import { x } from 'x'", symbol_kind: 'function', language: 'typescript', start_byte: 10, end_byte: 20 },
      { source_ref: 'src/a.ts', source_revision: sourceRevision, symbol_name: 'unknownLang', symbol_kind: 'function', language: 'unknown', start_byte: 20, end_byte: 30 },
    ];
    writeFileSync(input, `${candidates.map((candidate) => JSON.stringify(candidate)).join('\n')}\n`);
    execFileSync(process.execPath, [script, `--input=${input}`, `--output=${output}`, `--report-output=${report}`], { cwd: repoRoot });
    const nominations = readFileSync(output, 'utf8').trim().split('\n').map((line) => JSON.parse(line));
    const receipt = JSON.parse(readFileSync(report, 'utf8'));
    assert.equal(nominations.length, 1);
    assert.equal(nominations[0].qualified_name, 'work');
    assert.equal(nominations[0].source_revision, sourceRevision);
    assert.equal(nominations[0].workspace_revision, null);
    assert.equal(receipt.invalid_candidates, 2);
    assert.equal(receipt.stale_source_revision_candidates, 0);
    assert.equal(receipt.database_writes, false);
    assert.equal(receipt.canonical_writes, false);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
});
