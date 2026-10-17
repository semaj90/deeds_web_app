import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { resolveSourceRefPathV1 } from './resolve-source-ref-path-v1.mjs';

test('resolves source refs inside an admitted snapshot root', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-source-ref-'));
  const file = path.join(root, 'packages', 'sample.ts');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, 'export const sample = true;');
  assert.equal(resolveSourceRefPathV1(root, 'packages/sample.ts'), file);
});

test('supports frontend-relative source refs without leaving the snapshot', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-source-ref-'));
  const file = path.join(root, 'sveltekit-frontend', 'src', 'sample.ts');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, 'export const sample = true;');
  assert.equal(resolveSourceRefPathV1(root, 'src/sample.ts'), file);
});

test('rejects absolute paths, traversal, and missing source refs', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-source-ref-'));
  assert.equal(resolveSourceRefPathV1(root, '../outside.ts'), null);
  assert.equal(resolveSourceRefPathV1(root, 'C:\\outside.ts'), null);
  assert.equal(resolveSourceRefPathV1(root, 'missing.ts'), null);
});

test('rejects an indexed candidate outside the selected snapshot root', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'atlas-source-ref-'));
  const outside = path.join(os.tmpdir(), 'outside-atlas-source.ts');
  fs.writeFileSync(outside, 'export const outside = true;');
  assert.equal(resolveSourceRefPathV1(root, 'outside.ts', new Map([['outside.ts', outside]])), null);
});
