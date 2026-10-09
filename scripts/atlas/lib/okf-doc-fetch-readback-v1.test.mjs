import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { verifyOkfDocFetchReadbackV1 } from './okf-doc-fetch-readback-v1.mjs';

test('verifies corpus records against independently reopened markdown bytes', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-okf-readback-'));
  try {
    const markdownPath = path.join(root, 'raw.md');
    const corpusPath = path.join(root, 'corpus.jsonl');
    const markdown = Buffer.from('# Valkey\nrevision-safe cache docs\n', 'utf8');
    const contentHash = crypto.createHash('sha256').update(markdown).digest('hex');
    fs.writeFileSync(markdownPath, markdown);
    fs.writeFileSync(corpusPath, `${JSON.stringify({
      schema_version: 'okf.dev.corpus.v1',
      source_id: 'redis-valkey',
      source_ref: 'redis-valkey:topics',
      url: 'https://valkey.io/topics/',
      title: 'Valkey topics',
      content_hash: contentHash,
      markdown_path: markdownPath,
      metadata: { fetched_via: 'fixture' },
    })}\n`);

    const receipt = verifyOkfDocFetchReadbackV1({ corpusPath, outputRoot: root });
    assert.equal(receipt.status, 'SCRATCH_FETCH_READBACK_VERIFIED_NOT_INDEXED');
    assert.equal(receipt.recordCount, 1);
    assert.equal(receipt.records[0].status, 'READBACK_MATCH');
    assert.equal(receipt.records[0].contentHash, contentHash);
    assert.equal(receipt.canonicalAuthority, false);
    assert.equal(receipt.datastoreWritesPerformed, false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('rejects markdown path traversal and changed raw bytes', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-okf-readback-reject-'));
  try {
    const markdownPath = path.join(root, 'raw.md');
    const corpusPath = path.join(root, 'corpus.jsonl');
    fs.writeFileSync(markdownPath, 'changed');
    const record = {
      schema_version: 'okf.dev.corpus.v1',
      source_id: 'redis-valkey',
      source_ref: 'redis-valkey:topics',
      url: 'https://valkey.io/topics/',
      content_hash: '0'.repeat(64),
      markdown_path: markdownPath,
    };
    fs.writeFileSync(corpusPath, `${JSON.stringify(record)}\n`);
    assert.throws(() => verifyOkfDocFetchReadbackV1({ corpusPath, outputRoot: root }), /OKF_MARKDOWN_CHECKSUM_MISMATCH/);
    record.markdown_path = path.join(root, '..', 'outside.md');
    fs.writeFileSync(corpusPath, `${JSON.stringify(record)}\n`);
    assert.throws(() => verifyOkfDocFetchReadbackV1({ corpusPath, outputRoot: root }), /OKF_MARKDOWN_PATH_OUTSIDE_OUTPUT_ROOT/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
