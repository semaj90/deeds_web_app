import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { buildReviewedExport, verifyPaletteChecksum } from './export-okf-reviewed-domain-examples-v1.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT = path.join(HERE, 'export-okf-reviewed-domain-examples-v1.mjs');
const palette = JSON.parse(fs.readFileSync(path.join(HERE, 'data', 'nes-domain-palette-v1.json'), 'utf8'));

// A temp "repo root" holding real source bytes so source verification is exercised, not skipped.
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'okf-export-'));
const sourceBytes = Buffer.from('export function guardSession() { return true; }\n// authorization middleware for sessions\n', 'utf8');
fs.mkdirSync(path.join(root, 'src'), { recursive: true });
fs.writeFileSync(path.join(root, 'src', 'auth.ts'), sourceBytes);
const rev = `sha256:${crypto.createHash('sha256').update(sourceBytes).digest('hex')}`;

const good = (over = {}) => ({
  sourceRef: 'src/auth.ts', featureLabel: 'Session guard', textEvidence: 'guards user sessions', sourceRevision: rev,
  workspaceRevision: 'ws:rev1', reviewedGroup: 'auth', reviewStatus: 'REVIEWED', reviewer: 'a.reviewer', reviewedAt: '2026-11-08T00:00:00Z', ...over,
});
const run = (rows, extra = {}) => buildReviewedExport({ inputRows: rows, palette, root, ...extra });

test('accepts a human-reviewed, source-verified row in notebook format', () => {
  const { rows, receipt } = run([good({ evidenceSpan: { byteStart: 0, byteEnd: 20 } })]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].domain, 'auth');
  assert.equal(rows[0].label_status, 'REVIEWED');
  assert.equal(rows[0].source_group, 'src/auth.ts');
  assert.equal(receipt.canonicalAuthority, false);
  assert.equal(receipt.writesPerformed, false);
  assert.equal(receipt.status, 'INSUFFICIENT_DATA'); // one row is nowhere near the size gate
});

test('no reviewed rows -> BLOCKED_NO_REVIEWED_INPUT', () => {
  const { receipt } = run([good({ reviewStatus: 'PROPOSED' })]);
  assert.equal(receipt.status, 'BLOCKED_NO_REVIEWED_INPUT');
  assert.equal(receipt.rejected.NOT_HUMAN_REVIEWED_STATUS, 1);
});

test('rejects bot, test and missing reviewers', () => {
  const { receipt } = run([good({ reviewer: 'test' }), good({ reviewer: 'llm-labeler', sourceRef: 'src/auth.ts' }), good({ reviewer: '' }), good({ reviewedAt: null })]);
  assert.equal(receipt.rejected.REVIEWER_MISSING_OR_NOT_HUMAN, 4);
});

test('never translates labels outside the NES palette (13-group ontology labels are rejected and counted)', () => {
  const { rows, receipt } = run([good({ reviewedGroup: 'frontend' }), good({ reviewedGroup: 'machine-learning' }), good({ reviewedGroup: 'devops' })]);
  assert.equal(rows.length, 0);
  assert.equal(receipt.rejected.DOMAIN_NOT_IN_NES_PALETTE, 3);
  assert.deepEqual(receipt.unmappedLabels, { frontend: 1, 'machine-learning': 1, devops: 1 });
});

test('AMBIGUOUS / NOT_A_DOMAIN / SKIP are counted, never exported', () => {
  const { rows, receipt } = run([good({ reviewedGroup: 'AMBIGUOUS' }), good({ reviewedGroup: 'SKIP' }), good({ reviewedGroup: 'NOT_A_DOMAIN' })]);
  assert.equal(rows.length, 0);
  assert.deepEqual(receipt.nonGold, { AMBIGUOUS: 1, SKIP: 1, NOT_A_DOMAIN: 1 });
});

test('requires a sha256 source revision and a workspace revision', () => {
  const { receipt } = run([good({ sourceRevision: 'abc' }), good({ sourceRevision: undefined }), good({ workspaceRevision: '' })]);
  assert.equal(receipt.rejected.SOURCE_REVISION_MISSING_OR_INVALID, 2);
  assert.equal(receipt.rejected.WORKSPACE_REVISION_MISSING, 1);
});

test('verifies source bytes: wrong revision, missing file and unsafe paths are rejected', () => {
  const { receipt } = run([
    good({ sourceRevision: `sha256:${'0'.repeat(64)}` }),
    good({ sourceRef: 'src/missing.ts' }),
    good({ sourceRef: '../outside.ts' }),
    good({ sourceRef: path.resolve(root, 'src', 'auth.ts') }),
  ]);
  assert.equal(receipt.rejected.SOURCE_REVISION_MISMATCH, 1);
  assert.equal(receipt.rejected.SOURCE_UNREADABLE, 1);
  assert.equal(receipt.rejected.SOURCE_REF_UNSAFE, 2);
});

test('rejects an evidence span outside the source bytes', () => {
  const bad = [{ byteStart: -1, byteEnd: 5 }, { byteStart: 5, byteEnd: 5 }, { byteStart: 0, byteEnd: sourceBytes.length + 1 }, { byteStart: 1.5, byteEnd: 4 }];
  const { receipt } = run(bad.map((evidenceSpan, i) => good({ evidenceSpan, textEvidence: `t${i}` })));
  assert.equal(receipt.rejected.EVIDENCE_SPAN_INVALID, 4);
});

test('drops a source group labelled with two different domains', () => {
  const { rows, receipt } = run([good({ textEvidence: 'a', reviewedGroup: 'auth' }), good({ textEvidence: 'b', reviewedGroup: 'database' })]);
  assert.equal(rows.length, 0);
  assert.deepEqual(receipt.droppedConflictingGroups, ['src/auth.ts']);
  assert.equal(receipt.rejected.SOURCE_GROUP_DOMAIN_CONFLICT, 2);
});

test('deduplicates identical rows by id', () => {
  const { rows, receipt } = run([good(), good()]);
  assert.equal(rows.length, 1);
  assert.equal(receipt.rejected.DUPLICATE_ID, 1);
});

test('--allow-unverified-source skips byte checks and says so in the receipt', () => {
  const { rows, receipt } = run([good({ sourceRef: 'src/missing.ts', sourceRevision: `sha256:${'1'.repeat(64)}` })], { allowUnverifiedSource: true });
  assert.equal(rows.length, 1);
  assert.equal(receipt.sourceVerification, 'SKIPPED_BY_FLAG');
});

test('palette checksum verifies the real palette and detects tampering', () => {
  assert.equal(verifyPaletteChecksum(palette).ok, true);
  const tampered = structuredClone(palette);
  tampered.domains.auth.lutByte = 99;
  assert.equal(verifyPaletteChecksum(tampered).ok, false);
});

test('size gate: enough reviewed rows across domains and groups is READY_FOR_HELD_OUT_EVAL', () => {
  const rows = [];
  const files = [];
  for (const d of ['auth', 'database']) {
    for (let g = 0; g < 6; g++) {
      const ref = `src/${d}-${g}.ts`;
      const bytes = Buffer.from(`// ${d} ${g}\n`, 'utf8');
      fs.writeFileSync(path.join(root, ref), bytes);
      files.push(ref);
      const r = `sha256:${crypto.createHash('sha256').update(bytes).digest('hex')}`;
      for (let k = 0; k < 6; k++) rows.push(good({ sourceRef: ref, sourceRevision: r, reviewedGroup: d, textEvidence: `${d} ${g} item ${k}` }));
    }
  }
  const out = buildReviewedExport({ inputRows: rows, palette, root });
  assert.equal(out.rows.length, 72);
  assert.equal(out.receipt.status, 'INSUFFICIENT_DATA'); // 72 rows is below the 200-row floor
  assert.equal(out.receipt.groupsPerDomain.auth, 6);
  const many = [];
  for (let rep = 0; rep < 3; rep++) for (const r of rows) many.push({ ...r, textEvidence: `${r.textEvidence} v${rep}` });
  const ready = buildReviewedExport({ inputRows: many, palette, root });
  assert.equal(ready.rows.length, 216);
  assert.equal(ready.receipt.status, 'READY_FOR_HELD_OUT_EVAL');
});

test('CLI: exits 2 and writes only a receipt when nothing is reviewed; exits 1 without --input; never overwrites', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'okf-cli-'));
  const input = path.join(dir, 'in.jsonl');
  fs.writeFileSync(input, JSON.stringify(good({ reviewStatus: 'PROPOSED' })) + '\n');
  const out = path.join(dir, 'out');
  const r1 = spawnSync(process.execPath, [SCRIPT, '--input', input, '--root', root, '--out-dir', out], { encoding: 'utf8' });
  assert.equal(r1.status, 2, r1.stderr);
  assert.deepEqual(fs.readdirSync(out), ['reviewed-export-receipt.json']);
  const r2 = spawnSync(process.execPath, [SCRIPT, '--input', input, '--root', root, '--out-dir', out], { encoding: 'utf8' });
  assert.notEqual(r2.status, 0); // exclusive create: a second run must not overwrite the receipt
  const r3 = spawnSync(process.execPath, [SCRIPT], { encoding: 'utf8' });
  assert.equal(r3.status, 1);
});
