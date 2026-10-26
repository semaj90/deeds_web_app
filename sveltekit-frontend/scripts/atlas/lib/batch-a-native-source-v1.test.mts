import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { collectBatchANativeCohortV1, excludedBatchASourceV1, extractBatchANativeSourceV1, resolveBatchASourceV1, selectBatchASourcesV1 } from './batch-a-native-source-v1.mjs';
import { validateBatchASnapshotV1 } from './batch-a-validation-v1.mjs';

function verifySlices(source: string, result: Awaited<ReturnType<typeof extractBatchANativeSourceV1>>) {
  const bytes = Buffer.from(source);
  const byId = new Map(result.nodes.map(node => [node.node_id, node]));
  for (const node of result.nodes) {
    const start = Number(node.metadata.start_byte);
    const end = Number(node.metadata.end_byte);
    assert.ok(start >= 0 && end >= start && end <= bytes.length);
    const text = source.slice(Number(node.metadata.start_utf16), Number(node.metadata.end_utf16));
    assert.equal(bytes.subarray(start, end).toString('utf8'), text);
    assert.equal(createHash('sha256').update(bytes.subarray(start, end)).digest('hex'), node.metadata.node_hash);
    assert.equal(node.metadata.source_revision, null);
    assert.equal(node.metadata.workspace_revision, null);
    assert.equal(node.metadata.canonicalAuthority, false);
    assert.equal(node.packet_key, null);
    if (node.parent_id) {
      const parent = byId.get(node.parent_id)!;
      assert.ok(parent);
      assert.ok(Number(parent.metadata.start_byte) <= start && Number(parent.metadata.end_byte) >= end);
    }
  }
}

test('uses native TypeScript nodes with exact Unicode/CRLF spans and nested parents', async () => {
  const source = '// λ 😀\r\nexport function outer() { return function inner() { return "你好"; }; }\r\n';
  const result = await extractBatchANativeSourceV1('packages/example.ts', Buffer.from(source));
  verifySlices(source, result);
  assert.equal(result.parserName, 'node-tree-sitter-challenger');
  const outer = result.nodes.find(node => node.node_type === 'function_declaration')!;
  assert.equal(outer.metadata.start_byte, Buffer.byteLength(source.slice(0, source.indexOf('function outer'))));
  assert.ok(result.nodes.some(node => node.tree_depth >= 3));
  assert.equal(result.edges.length, result.nodes.length - 1);
});

test('repeats deterministic local observation IDs without claiming canonical identity', async () => {
  const bytes = Buffer.from('export const answer: number = 42;');
  const first = await extractBatchANativeSourceV1('packages/example.ts', bytes);
  const replay = await extractBatchANativeSourceV1('packages/example.ts', bytes);
  assert.deepEqual(first, replay);
});

test('preserves the existing native provider request and evidence contract', async () => {
  const providerModule = await import(new URL('../../../src/lib/server/atlas/indexing/node-tree-sitter-ast-provider.ts', import.meta.url).href);
  const source = 'export function example(): number { return 1; }';
  const parserToken = `anchor:content:${createHash('sha256').update(source).digest('hex')}`;
  const result = await providerModule.createNodeTreeSitterAstProvider().materialize({
    source, sourceRef: 'example.ts', language: 'typescript', sourceRevision: parserToken,
  });
  assert.equal(result.status, 'PROVEN');
  assert.equal(result.evidence.engine, 'node-tree-sitter');
  assert.equal(result.evidence.source_revision, parserToken);
  assert.equal(result.evidence.file_path, 'example.ts');
  assert.ok(result.evidence.chunks.some((chunk: { name: string }) => chunk.name === 'example'));
});

test('handles JS, JSX, TSX and type-only modules through the existing provider', async () => {
  for (const [file, source] of [
    ['example.js', 'export const answer = 42;'],
    ['example.jsx', 'export const node = <div>😀</div>;'],
    ['example.tsx', 'export const node: unknown = <div>😀</div>;'],
    ['example.d.ts', 'export interface Result { value: string }'],
  ]) {
    const result = await extractBatchANativeSourceV1(file, Buffer.from(source));
    verifySlices(source, result);
    assert.ok(result.nodes.length > 1);
  }
});

test('preserves a legitimate native root for short and empty modules', async () => {
  for (const source of ['', 'const x = 1;']) {
    const result = await extractBatchANativeSourceV1('example.ts', Buffer.from(source));
    verifySlices(source, result);
    assert.equal(result.nodes[0].node_type, 'program');
    assert.equal(result.nodes[0].metadata.end_byte, Buffer.byteLength(source));
  }
});

test('uses the Svelte compiler owner for runes, templates and zero-width empty attributes', async () => {
  const source = '<script lang="ts">let count = $state<number>(0);</script>\r\n<label>λ 😀<input value={count} alt=""/></label>';
  const result = await extractBatchANativeSourceV1('example.svelte', Buffer.from(source));
  verifySlices(source, result);
  assert.equal(result.parserName, 'svelte/compiler');
  assert.equal(result.nodes[0].node_type, 'Root');
  assert.ok(result.nodes.some(node => node.node_type === 'CallExpression'));
  assert.ok(result.nodes.some(node => node.node_type === 'RegularElement'));
  assert.ok(result.nodes.some(node => node.node_type === 'Text' && node.metadata.start_byte === node.metadata.end_byte));
});

test('rejects syntax errors, invalid UTF-8 and oversized input without regex fallback', async () => {
  await assert.rejects(extractBatchANativeSourceV1('bad.ts', Buffer.from('export function {')), /NATIVE_SYNTAX_ERROR/);
  await assert.rejects(extractBatchANativeSourceV1('bad.svelte', Buffer.from('<script>let x =')), /./);
  await assert.rejects(extractBatchANativeSourceV1('bad.ts', Buffer.from([0xc3, 0x28])), /INVALID_UTF8/);
  await assert.rejects(extractBatchANativeSourceV1('large.ts', Buffer.alloc(2 * 1024 * 1024 + 1)), /EXCEEDS_2_MIB/);
  await assert.rejects(extractBatchANativeSourceV1('example.py', Buffer.from('def example(): pass')), /UNSUPPORTED_LANGUAGE/);
});

test('preserves valid siblings when paths are rejected or languages unsupported', async () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'atlas-native-cohort-'));
  try {
    writeFileSync(path.join(directory, 'good.ts'), 'export function example() { return 1; }');
    const result = await collectBatchANativeCohortV1(directory, ['../outside.ts', 'good.ts', '.tmp/hidden.ts', 'unsupported.py', 'missing.ts']);
    assert.deepEqual(result.counts, { requested: 5, processed: 1, failed: 1, rejected: 2, skipped: 1 });
    assert.ok(result.nodes.length > 0);
    assert.equal(validateBatchASnapshotV1(result.snapshot)[0].status, 'NOT_PROVEN');
  } finally {
    assert.equal(path.dirname(directory), path.resolve(tmpdir()));
    rmSync(directory, { recursive: true, force: true });
  }
});

test('accepts SvelteKit rest, group and layout-reset paths through the shared path resolver', async () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'atlas-native-route-'));
  const relative = 'sveltekit-frontend/src/routes/(app)/[...label]@/+page.svelte';
  try {
    mkdirSync(path.dirname(path.join(directory, relative)), { recursive: true });
    writeFileSync(path.join(directory, relative), '<p>λ</p>');
    const result = await collectBatchANativeCohortV1(directory, [relative]);
    const replay = await collectBatchANativeCohortV1(directory, [relative]);
    assert.deepEqual(result.counts, { requested: 1, processed: 1, failed: 0, rejected: 0, skipped: 0 });
    assert.ok(validateBatchASnapshotV1(result.snapshot, replay.snapshot).every(gate => gate.pass));
    await assert.rejects(resolveBatchASourceV1(directory, path.join(directory, relative)), /MUST_BE_WORKSPACE_RELATIVE/);
  } finally {
    assert.equal(path.dirname(directory), path.resolve(tmpdir()));
    rmSync(directory, { recursive: true, force: true });
  }
});

test('selects bounded tracked source and excludes dependencies, environments and generated folders', async () => {
  const workspace = fileURLToPath(new URL('../../../../', import.meta.url));
  const selected = await selectBatchASourcesV1(workspace, 4);
  assert.ok(selected.length > 0 && selected.length <= 4);
  assert.deepEqual(selected, [...selected].sort((left, right) => Buffer.compare(Buffer.from(left), Buffer.from(right))));
  assert.ok(selected.every(sourceRef => !excludedBatchASourceV1(sourceRef)));
  for (const sourceRef of ['packages/.venv-test/a.ts', 'node_modules/a.ts', '.tmp/a.ts', 'packages/archive/a.ts', '.svelte-kit/a.ts']) {
    assert.equal(excludedBatchASourceV1(sourceRef), true);
  }
  assert.deepEqual(await selectBatchASourcesV1(workspace, 2, ['b.ts', 'a.ts', 'a.ts']), ['a.ts', 'b.ts']);
  await assert.rejects(selectBatchASourcesV1(workspace, 1, ['b.ts', 'a.ts']), /EXPLICIT_SELECTION_EXCEEDS_LIMIT/);
  await assert.rejects(selectBatchASourcesV1(workspace, 0), /LIMIT/);
});

test('rejects directory-symlink escapes through the shared containment owner', async () => {
  const directory = mkdtempSync(path.join(tmpdir(), 'atlas-native-symlink-'));
  const workspace = path.join(directory, 'workspace');
  const outside = path.join(directory, 'outside');
  try {
    mkdirSync(workspace);
    mkdirSync(outside);
    writeFileSync(path.join(outside, 'escape.ts'), 'export const secret = 1;');
    symlinkSync(outside, path.join(workspace, 'jump'), 'junction');
    await assert.rejects(resolveBatchASourceV1(workspace, 'jump/escape.ts'), /OUTSIDE_WORKSPACE/);
  } finally {
    assert.equal(path.dirname(directory), path.resolve(tmpdir()));
    rmSync(directory, { recursive: true, force: true });
  }
});
