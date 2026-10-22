import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import path from 'node:path';
import test from 'node:test';
import { analyzeIndexedSvelteTypeScriptV1 } from './indexed-source-svelte-typescript-v1.mjs';

const repoRoot = path.resolve(import.meta.dirname, '..', '..', '..');

function analyze(sourceText, sourceRef = 'src/example.svelte') {
  const sourceBytes = Buffer.from(sourceText, 'utf8');
  const expectedRevision = `sha256:${crypto.createHash('sha256').update(sourceBytes).digest('hex')}`;
  return analyzeIndexedSvelteTypeScriptV1({ repoRoot, sourceRef, sourceText, sourceBytes, expectedRevision });
}

test('extracts module and instance TypeScript symbols with original UTF-8 byte spans', () => {
  const source = '<h1>🧭</h1>\r\n<script context="module" lang="ts">\r\nexport const moduleValue = 1;\r\n</script>\r\n<script lang="ts">\r\nimport { onMount } from "svelte";\r\nfunction loadStats() {}\r\n</script>\r\n';
  const result = analyze(source);

  assert.equal(result.status, 'OBSERVED');
  assert.equal(result.scriptBlockCount, 2);
  assert.deepEqual(result.symbolFacts.map(({ scriptContext, kind, symbol }) => [scriptContext, kind, symbol]), [
    ['module', 'VariableStatement', 'moduleValue'],
    ['default', 'ImportDeclaration', 'svelte'],
    ['default', 'FunctionDeclaration', 'loadStats'],
  ]);
  for (const fact of result.symbolFacts) {
    const span = Buffer.from(source, 'utf8').subarray(fact.byteStart, fact.byteEnd).toString('utf8');
    assert.ok(span.includes(fact.symbol === 'svelte' ? 'from "svelte"' : fact.symbol));
    assert.match(fact.sourceSpanSha256, /^sha256:[0-9a-f]{64}$/);
  }
  assert.equal(result.canonicalAuthority, false);
  assert.equal(result.writesPerformed, false);
});

test('maps declarations after comments to their exact original UTF-8 source bytes', () => {
  const source = '<script lang="ts">\n// 🧭 keep this comment outside the declaration span\nexport function findRoute() { return "✓"; }\n</script>';
  const result = analyze(source);
  const [fact] = result.symbolFacts;
  const sourceSpan = Buffer.from(source, 'utf8').subarray(fact.byteStart, fact.byteEnd).toString('utf8');

  assert.equal(fact.symbol, 'findRoute');
  assert.match(sourceSpan, /^export function findRoute/);
  assert.doesNotMatch(sourceSpan, /keep this comment/);
  assert.equal(fact.byteStart, Buffer.byteLength(source.slice(0, source.indexOf('export function')), 'utf8'));
});

test('rejects malformed embedded TypeScript instead of emitting partial facts', () => {
  assert.throws(() => analyze('<script lang="ts">export const broken = ;</script>'));
});

test('rejects bytes that do not match the bound source revision', () => {
  const sourceBytes = Buffer.from('<script lang="ts">const x = 1;</script>', 'utf8');
  assert.throws(() => analyzeIndexedSvelteTypeScriptV1({
    repoRoot,
    sourceRef: 'src/example.svelte',
    sourceText: sourceBytes.toString('utf8'),
    sourceBytes,
    expectedRevision: `sha256:${'0'.repeat(64)}`,
  }), /SVELTE_SOURCE_REVISION_MISMATCH/);
});

test('reports unsupported preprocessor languages instead of silently skipping them', () => {
  const result = analyze('<script lang="coffee">answer = 42</script>');
  assert.equal(result.status, 'PARTIAL_UNSUPPORTED_SCRIPT_LANGUAGE');
  assert.deepEqual(result.unsupportedLanguages, ['coffee']);
  assert.equal(result.analyzedScriptBlockCount, 0);
});

test('extracts native JavaScript module and instance symbols with exact Unicode spans', () => {
  const source = '<p>🧭</p>\r\n<script module>export function collect() { return "é"; }</script>\r\n<script lang="javascript">const run = () => "✓";</script>';
  const result = analyze(source);
  assert.equal(result.status, 'OBSERVED');
  assert.equal(result.scriptBlockCount, 2);
  assert.deepEqual(result.symbolFacts.map(fact => [fact.scriptContext, fact.language, fact.symbol]), [
    ['module', 'js', 'collect'], ['default', 'javascript', 'run'],
  ]);
  for (const fact of result.symbolFacts) {
    const span = Buffer.from(source).subarray(fact.byteStart, fact.byteEnd);
    assert.equal(`sha256:${crypto.createHash('sha256').update(span).digest('hex')}`, fact.sourceSpanSha256);
    assert.ok(span.toString('utf8').includes(fact.symbol));
  }
});

test('empty inline script is accounted for without inventing symbols', () => {
  const result = analyze('<script lang="ts"></script><p>empty</p>');
  assert.equal(result.status, 'OBSERVED');
  assert.equal(result.scriptBlockCount, 1);
  assert.equal(result.analyzedScriptBlockCount, 1);
  assert.deepEqual(result.symbolFacts, []);
});

test('a component without scripts reports zero script observations', () => {
  const result = analyze('<p>🧭 plain markup</p>');
  assert.equal(result.status, 'OBSERVED');
  assert.equal(result.scriptBlockCount, 0);
  assert.equal(result.analyzedScriptBlockCount, 0);
  assert.deepEqual(result.symbolFacts, []);
});

test('malformed Svelte host markup is rejected before emitting otherwise valid script facts', () => {
  assert.throws(() => analyze('<script lang="ts">const value = 1;</script><div>{#if value}<span></div>'));
});
