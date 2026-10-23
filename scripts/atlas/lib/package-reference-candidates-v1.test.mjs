import test from 'node:test';
import assert from 'node:assert/strict';
import { comparePackageSurfaceRowV1, extractPackageReferencesV1 } from './package-reference-candidates-v1.mjs';

test('JavaScript references retain exact UTF-16 and UTF-8 spans with scoped package names', () => {
  const source = "// π\r\nimport { value } from '@scope/pkg/subpath';\nconst schema = require('zod');\nconst ignored = import('node:fs');\n";
  const result = extractPackageReferencesV1({
    source,
    relativePath: 'src/file.ts',
    npmPackageNames: new Set(['@scope/pkg', 'zod']),
    pythonPackageNames: new Set(),
    moduleToDistributions: new Map(),
  });
  assert.deepEqual(result.packageSet, ['npm:@scope/pkg', 'npm:zod']);
  assert.deepEqual(result.references.map(row => [row.specifier, row.line1]), [
    ['@scope/pkg/subpath', 2], ['zod', 3],
  ]);
  for (const row of result.references) {
    assert.equal(Buffer.byteLength(source.slice(0, row.startUtf16), 'utf8'), row.startByte);
    assert.equal(Buffer.byteLength(source.slice(0, row.endUtf16), 'utf8'), row.endByte);
    assert.equal(Buffer.from(source).subarray(row.startByte, row.endByte).toString('utf8'), row.specifier);
  }
});

test('UTF-8 BOM remains in the source coordinate space', () => {
  const source = '\uFEFFimport { json } from "@sveltejs/kit";\n';
  const result = extractPackageReferencesV1({
    source,
    relativePath: 'src/routes/+page.ts',
    npmPackageNames: new Set(['@sveltejs/kit']),
    pythonPackageNames: new Set(),
    moduleToDistributions: new Map(),
  });
  const reference = result.references[0];
  assert.equal(Buffer.from(source).subarray(reference.startByte, reference.endByte).toString('utf8'), reference.specifier);
  assert.equal(reference.startByte, Buffer.byteLength(source.slice(0, reference.startUtf16), 'utf8'));
});

test('Python import forms map modules to installed distributions', () => {
  const source = [
    'from sklearn.model_selection import train_test_split',
    'import numpy as np, pandas as pd',
    'import importlib',
    "value = importlib.import_module('requests.sessions')",
  ].join('\n');
  const result = extractPackageReferencesV1({
    source,
    relativePath: 'python/job.py',
    npmPackageNames: new Set(),
    pythonPackageNames: new Set(['scikit-learn', 'numpy', 'pandas', 'requests']),
    moduleToDistributions: new Map([
      ['sklearn', ['scikit-learn']], ['numpy', ['numpy']], ['pandas', ['pandas']], ['requests', ['requests']],
    ]),
  });
  assert.deepEqual(result.packageSet, ['pypi:numpy', 'pypi:pandas', 'pypi:requests', 'pypi:scikit-learn']);
  assert.deepEqual(result.references.map(row => row.specifier), [
    'sklearn.model_selection', 'numpy', 'pandas', 'requests.sessions',
  ]);
  assert.equal(result.references[2].line1, 2);
});

test('package surface matches fail closed on changed package membership', () => {
  const result = comparePackageSurfaceRowV1({ packages: [{ ecosystem: 'npm', name: 'zod' }] }, ['npm:vitest']);
  assert.equal(result.same, false);
  assert.deepEqual(result.missing, ['npm:zod']);
  assert.deepEqual(result.unexpected, ['npm:vitest']);
});
