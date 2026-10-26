import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { buildIndexedSourceSvelteLspInitializationOptionsV1, mapSymbolByteSpans, resolveIndexedSourceLspWorkspaceRootV1, runIndexedSourceLspV1 } from './indexed-source-lsp-v1.mjs';

const revision = bytes => `sha256:${crypto.createHash('sha256').update(bytes).digest('hex')}`;

test('LSP symbol ranges map UTF-16 positions to original UTF-8 byte spans', () => {
  const source = Buffer.from('const title = "é😀";\r\nfunction run() {}\r\n', 'utf8');
  const facts = mapSymbolByteSpans([{
    name: 'run',
    kind: 12,
    range: { start: { line: 1, character: 0 }, end: { line: 1, character: 17 } },
    children: [{ name: 'nested', kind: 6, range: { start: { line: 1, character: 12 }, end: { line: 1, character: 17 } } }],
  }], source);
  assert.equal(facts.length, 2);
  assert.equal(source.subarray(facts[0].byteStart, facts[0].byteEnd).toString('utf8'), 'function run() {}');
  assert.equal(source.subarray(facts[1].byteStart, facts[1].byteEnd).toString('utf8'), '() {}');
  assert.equal(facts[1].parentName, 'run');
});

test('invalid LSP symbol ranges fail closed', () => {
  assert.throws(() => mapSymbolByteSpans([{
    name: 'bad', kind: 12,
    range: { start: { line: 0, character: 2 }, end: { line: 0, character: 1 } },
  }], Buffer.from('abc')), /LSP_SYMBOL_BYTE_SPAN_INVALID/);
});

test('LSP workspace root resolves to the nearest package boundary, not the source folder', () => {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-lsp-root-'));
  const workspace = path.join(repoRoot, 'sveltekit-frontend');
  const sourceDirectory = path.join(workspace, 'src', 'lib', 'components');
  fs.mkdirSync(sourceDirectory, { recursive: true });
  fs.writeFileSync(path.join(workspace, 'package.json'), '{}');
  const sourcePath = path.join(sourceDirectory, 'Example.svelte');
  try {
    assert.equal(resolveIndexedSourceLspWorkspaceRootV1({ repoRoot, absolutePath: sourcePath }), workspace);
  } finally {
    fs.rmSync(repoRoot, { recursive: true, force: true });
  }
});

test('Svelte LSP defaults to host-only mode and requires explicit opt-in for its TypeScript plugin', () => {
  assert.deepEqual(buildIndexedSourceSvelteLspInitializationOptionsV1(), {
    configuration: { svelte: { plugin: { typescript: { enable: false } } } },
  });
  assert.deepEqual(buildIndexedSourceSvelteLspInitializationOptionsV1({ enableTypeScriptPlugin: true }), {
    configuration: { svelte: { plugin: { typescript: { enable: true } } } },
  });
  assert.throws(() => buildIndexedSourceSvelteLspInitializationOptionsV1({ enableTypeScriptPlugin: 'false' }), /SETTING_INVALID/);
});


test('LSP refuses source bytes or workspace revisions that are not exactly qualified before starting a server', async () => {
  const sourceText = 'const value = "🧭";';
  const sourceBytes = Buffer.from(sourceText, 'utf8');
  const base = { repoRoot: process.cwd(), sourceRef: 'src/example.ts', absolutePath: 'C:/not-read/example.ts',
    sourceText, sourceBytes, sourceRevision: revision(sourceBytes), workspaceRevision: `sha256:${'a'.repeat(64)}` };
  const stale = await runIndexedSourceLspV1({ ...base, sourceBytes: Buffer.from('const value = 1;') });
  assert.equal(stale.status, 'STALE_SOURCE');
  assert.equal(stale.error, 'INDEXED_SOURCE_LSP_SOURCE_REVISION_MISMATCH');
  const unqualified = await runIndexedSourceLspV1({ ...base, workspaceRevision: '0' });
  assert.equal(unqualified.status, 'STALE_SOURCE');
  assert.equal(unqualified.error, 'INDEXED_SOURCE_LSP_REVISION_INVALID');
});
