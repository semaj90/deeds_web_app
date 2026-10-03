import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { indexSafeQualifiedSymbolV1, writeAtlasAstNodes } from './atlas-ast-nodes-writer.mjs';

test('keeps ordinary qualified symbols byte-for-byte unchanged', () => {
  const value = 'Atlas.ContextManifest.build';
  assert.equal(indexSafeQualifiedSymbolV1(value), value);
});

test('bounds long Unicode display keys and hashes the complete qualified symbol', () => {
  const value = `${'深'.repeat(1200)}.nested.heading`;
  const safe = indexSafeQualifiedSymbolV1(value);

  assert.ok(Buffer.byteLength(safe, 'utf8') <= 512);
  assert.ok(safe.endsWith(`[sha256:${createHash('sha256').update(value, 'utf8').digest('hex')}]`));
  assert.notEqual(safe, indexSafeQualifiedSymbolV1(`${value}.different`));
});

test('rejects missing parser provenance before issuing a database query', async () => {
  let queryCalled = false;
  const client = {
    async query() {
      queryCalled = true;
      return { rowCount: 1 };
    },
  };

  await assert.rejects(
    writeAtlasAstNodes(client, {
      sourceRef: 'docs/contract.md',
      parserLanguage: 'markdown',
      parserName: 'markdown-symbol-extractor',
      nodes: [],
    }),
    { message: 'PARSER_VERSION_REQUIRED' },
  );
  assert.equal(queryCalled, false);
});

test('rejects blank parser provenance before issuing a database query', async () => {
  let queryCalled = false;
  const client = {
    async query() {
      queryCalled = true;
      return { rowCount: 1 };
    },
  };

  await assert.rejects(
    writeAtlasAstNodes(client, {
      sourceRef: 'docs/contract.md',
      parserLanguage: 'markdown',
      parserName: 'markdown-symbol-extractor',
      parserVersion: '   ',
      nodes: [],
    }),
    { message: 'PARSER_VERSION_REQUIRED' },
  );
  assert.equal(queryCalled, false);
});

test('bounds only the indexed display value while retaining full structural identity', async () => {
  const value = `${'heading/'.repeat(500)}leaf`;
  let insertedParams;
  const client = {
    async query(_sql, params) {
      insertedParams = params;
      return { rowCount: 1 };
    },
  };

  const result = await writeAtlasAstNodes(client, {
    sourceRef: 'docs/deep.md',
    parserLanguage: 'markdown',
    parserName: 'markdown-symbol-extractor',
    parserVersion: 'markdown-symbol-extractor-v1',
    sourceRevision: 'sha256:source-revision',
    nodes: [{
      kind: 'HEADING',
      qualifiedSymbol: value,
      startByte: 0,
      endByte: 1,
      startLine: 1,
      endLine: 1,
      sourceContentDigest: 'sha256:content',
      parentIndex: null,
    }],
  });

  const normalizedPath = 'docs/deep.md';
  const fullStructuralKey = `deeds-web-app/${normalizedPath}#HEADING:${value}`;
  const fullTreeNodeInput = [
    'deeds-web-app', normalizedPath, 'markdown', 'HEADING', value, 'ROOT', '',
  ].join('\x00');
  assert.equal(insertedParams[0], createHash('sha256').update(fullTreeNodeInput, 'utf8').digest('hex'));
  assert.equal(insertedParams[1], fullStructuralKey);
  assert.equal(insertedParams[5], indexSafeQualifiedSymbolV1(value));
  assert.ok(Buffer.byteLength(insertedParams[5], 'utf8') <= 512);
  assert.deepEqual(result.insertedFlags, [true]);
});
