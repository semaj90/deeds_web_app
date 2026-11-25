import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildDomainReviewSourceEvidenceV1 } from './domain-review-source-evidence-v1.mjs';

const sha = (value) => `sha256:${crypto.createHash('sha256').update(value).digest('hex')}`;

test('returns an exact ripgrep byte excerpt and confirms the pinned source digest', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'domain-evidence-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, 'src'));
  const bytes = Buffer.from('const greeting = "café";\r\nexport function verifySource() { return true; }\r\n', 'utf8');
  fs.writeFileSync(path.join(root, 'src', 'verify.ts'), bytes);
  const digest = sha(bytes);
  const result = buildDomainReviewSourceEvidenceV1({ repoRoot: root, row: { sourceRef: 'src/verify.ts', sourceRevision: digest, bindingContentDigest: digest, workspaceRevision: 'sha256:' + 'a'.repeat(64) } });
  assert.equal(result.evidenceStatus, 'SOURCE_EXCERPT_BINDINGS_MATCHED');
  assert.equal(result.revisionStatus, 'SOURCE_BINDINGS_MATCH_WORKTREE');
  assert.equal(result.matchKind, 'STRUCTURAL_OR_METADATA_LINE');
  assert.equal(result.lineNumber, 2);
  assert.equal(bytes.subarray(result.startByte, result.endByte).toString('utf8'), result.excerptText);
  assert.equal(result.evidenceScore, 100);
  assert.equal(result.canonicalAuthority, false);
});

test('shows current text for unresolved source revisions but does not qualify it', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'domain-evidence-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, 'src'));
  fs.writeFileSync(path.join(root, 'src', 'readme.md'), '# Retrieval notes\nUse bounded search.\n');
  const result = buildDomainReviewSourceEvidenceV1({ repoRoot: root, row: { sourceRef: 'src/readme.md', sourceRevision: null } });
  assert.equal(result.evidenceStatus, 'SOURCE_EXCERPT_BINDINGS_UNQUALIFIED');
  assert.equal(result.revisionStatus, 'SOURCE_REVISION_UNRESOLVED');
  assert.match(result.excerptText, /Retrieval notes/);
  assert.equal(result.evidenceScore, 75);
});

test('a stale binding content digest prevents source qualification', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'domain-evidence-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, 'src'));
  const bytes = Buffer.from('export const active = true;\n', 'utf8');
  fs.writeFileSync(path.join(root, 'src', 'state.ts'), bytes);
  const result = buildDomainReviewSourceEvidenceV1({ repoRoot: root, row: { sourceRef: 'src/state.ts', sourceRevision: sha(bytes), bindingContentDigest: '0'.repeat(64), workspaceRevision: 'sha256:' + 'c'.repeat(64) } });
  assert.equal(result.revisionStatus, 'BINDING_CONTENT_DIGEST_MISMATCH');
  assert.equal(result.evidenceStatus, 'SOURCE_EXCERPT_BINDINGS_UNQUALIFIED');
  assert.equal(result.evidenceScore, 75);
});

test('rejects path traversal, missing files, and binary content without inventing excerpts', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'domain-evidence-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, 'assets'));
  fs.writeFileSync(path.join(root, 'assets', 'screen.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0xff]));
  assert.equal(buildDomainReviewSourceEvidenceV1({ repoRoot: root, row: { sourceRef: '../outside.ts' } }).evidenceStatus, 'SOURCE_PATH_OUTSIDE_REPO');
  assert.equal(buildDomainReviewSourceEvidenceV1({ repoRoot: root, row: { sourceRef: 'missing.ts' } }).evidenceStatus, 'SOURCE_FILE_MISSING');
  const binary = buildDomainReviewSourceEvidenceV1({ repoRoot: root, row: { sourceRef: 'assets/screen.png' } });
  assert.equal(binary.evidenceStatus, 'SOURCE_BINARY_OR_INVALID_UTF8');
  assert.equal(binary.excerptText, undefined);
  assert.equal(binary.canonicalAuthority, false);
});
