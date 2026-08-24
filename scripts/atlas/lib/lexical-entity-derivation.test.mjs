import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deriveEntityLexicalFeatures, tokenizeIdentifier } from './lexical-entity-derivation.mjs';

test('tokenizeIdentifier splits camelCase, snake_case, and import: prefixes', () => {
  assert.deepEqual(tokenizeIdentifier('handleReconnect'), ['handle', 'reconnect']);
  assert.deepEqual(tokenizeIdentifier('retry_policy'), ['retry', 'policy']);
  assert.deepEqual(tokenizeIdentifier('import:$lib/server/redis.js'), ['$lib', 'server', 'redis', 'js']);
});

test('deriveEntityLexicalFeatures is deterministic for identical input', () => {
  const symbols = ['handleReconnect', 'class:WebsocketClient', 'import:$lib/server/redis.js', 'handleReconnect'];
  const first = deriveEntityLexicalFeatures(symbols);
  const second = deriveEntityLexicalFeatures([...symbols]);
  assert.deepEqual(first, second);
});

test('entities excludes import: pseudo-symbols but lexicalFeatures/usedConcepts still see their tokens', () => {
  const { entities, lexicalFeatures, usedConcepts } = deriveEntityLexicalFeatures([
    'handleReconnect',
    'import:$lib/server/redis.js',
  ]);
  assert.deepEqual(entities, ['handleReconnect']);
  assert.ok(lexicalFeatures.includes('import:$lib/server/redis.js')); // raw term preserved
  assert.ok(lexicalFeatures.includes('redis'));
  assert.ok(usedConcepts.includes('redis'));
  assert.ok(usedConcepts.includes('reconnect'));
});

test('usedConcepts drops stopwords and short tokens, stays bounded', () => {
  const symbols = Array.from({ length: 50 }, (_, i) => `getFooBarBaz${i}Thing`);
  const { usedConcepts } = deriveEntityLexicalFeatures(symbols);
  assert.ok(usedConcepts.length <= 32);
  assert.ok(!usedConcepts.includes('get'));
});

test('empty/non-array input never throws', () => {
  assert.deepEqual(deriveEntityLexicalFeatures([]), { entities: [], lexicalFeatures: [], usedConcepts: [] });
  assert.deepEqual(deriveEntityLexicalFeatures(null), { entities: [], lexicalFeatures: [], usedConcepts: [] });
});
