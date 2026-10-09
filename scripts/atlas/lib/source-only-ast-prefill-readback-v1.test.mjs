import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { verifySourceOnlyAstPrefillReadbackV1 } from '../verify-source-only-ast-prefill-readback-v1.mjs';

const sha256 = (value) => createHash('sha256').update(value).digest('hex');

test('independently verifies exact source bytes, UTF-8 span, and source-only identity', (t) => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-source-only-readback-'));
  t.after(() => fs.rmSync(repoRoot, { recursive: true, force: true }));
  const sourceRef = 'src/sample.ts';
  const source = Buffer.from(`const marker = '🧭';\nexport function lookup() { return marker; }\n`, 'utf8');
  const sourcePath = path.join(repoRoot, sourceRef);
  fs.mkdirSync(path.dirname(sourcePath), { recursive: true });
  fs.writeFileSync(sourcePath, source);
  const start = source.indexOf(Buffer.from('export function lookup'));
  const end = source.indexOf(Buffer.from('\n'), start);
  const span = source.subarray(start, end);
  const observation = {
    schema: 'atlas.ast-grep-observation.v1',
    observation_id: 'ast-grep:sample',
    source_ref: sourceRef,
    source_revision: `sha256:${sha256(source)}`,
    byte_start: start,
    byte_end: end,
    matched_text_hash: sha256(span),
    captures: { name: 'lookup' },
    canonical_authority: false,
  };
  const row = {
    schema: 'atlas.ast-prefill-observation-bridge-row.v1',
    packetKey: null,
    identityStatus: 'SOURCE_ONLY_UNBOUND',
    sourceRef,
    sourceRevision: observation.source_revision,
    workspaceRevision: `sha256:${'b'.repeat(64)}`,
    observation,
    admissionStatus: 'PROPOSAL_ONLY',
    canonicalAuthority: false,
  };
  const artifactPath = '.tmp/artifact.jsonl';
  const bridgeReceiptPath = '.tmp/bridge-receipt.json';
  const artifactFile = path.join(repoRoot, artifactPath);
  const bridgeReceiptFile = path.join(repoRoot, bridgeReceiptPath);
  fs.mkdirSync(path.dirname(artifactFile), { recursive: true });
  const artifactBytes = Buffer.from(`${JSON.stringify(row)}\n`);
  fs.writeFileSync(artifactFile, artifactBytes);
  fs.writeFileSync(bridgeReceiptFile, JSON.stringify({
    schema: 'atlas.ast-prefill-observation-bridge-receipt.v1',
    outputPath: artifactPath,
    outputChecksum: sha256(artifactBytes),
    readbackChecksum: sha256(artifactBytes),
    projectedRows: 1,
    canonicalAuthority: false,
    persistentStoreWritesPerformed: false,
  }));

  const receipt = verifySourceOnlyAstPrefillReadbackV1({
    repoRoot,
    artifactPath,
    bridgeReceiptPath,
    workspaceRevision: row.workspaceRevision,
  });
  assert.equal(receipt.status, 'SOURCE_ONLY_OBSERVATION_READBACK_MATCH');
  assert.equal(receipt.independentlyVerifiedRows, 1);
  assert.equal(receipt.packetIdentityCount, 0);
  assert.equal(receipt.persistentStoreWritesPerformed, false);
});

test('rejects source bytes that drift after the bridge receipt', (t) => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-source-only-drift-'));
  t.after(() => fs.rmSync(repoRoot, { recursive: true, force: true }));
  const sourceRef = 'src/sample.ts';
  const sourcePath = path.join(repoRoot, sourceRef);
  fs.mkdirSync(path.dirname(sourcePath), { recursive: true });
  fs.writeFileSync(sourcePath, 'export function lookup() {}');
  const artifactPath = '.tmp/artifact.jsonl';
  const bridgeReceiptPath = '.tmp/bridge-receipt.json';
  const artifactFile = path.join(repoRoot, artifactPath);
  const bridgeReceiptFile = path.join(repoRoot, bridgeReceiptPath);
  fs.mkdirSync(path.dirname(artifactFile), { recursive: true });
  const artifactBytes = Buffer.from('{}\n');
  fs.writeFileSync(artifactFile, artifactBytes);
  fs.writeFileSync(bridgeReceiptFile, JSON.stringify({
    schema: 'atlas.ast-prefill-observation-bridge-receipt.v1',
    outputPath: artifactPath,
    outputChecksum: sha256(artifactBytes),
    readbackChecksum: sha256(artifactBytes),
    projectedRows: 1,
    canonicalAuthority: false,
    persistentStoreWritesPerformed: false,
  }));
  assert.throws(() => verifySourceOnlyAstPrefillReadbackV1({
    repoRoot,
    artifactPath,
    bridgeReceiptPath,
    workspaceRevision: `sha256:${'b'.repeat(64)}`,
  }), /EMPTY_OR_INCOMPLETE_ARTIFACT|SOURCE_ONLY_LINEAGE_CONTRACT_MISMATCH/);
});
