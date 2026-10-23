import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { extractSourceImportCandidatesV1 } from './source-import-candidates-v1.mts';

const workspaceRevision = `sha256:${'f'.repeat(64)}`;
const targetSourceBytes = Buffer.from('export type A = string; export interface B {} export const C = 1; export type D = number;\n');
const targetSourceRevision = createHash('sha256').update(targetSourceBytes).digest('hex');

test('captures static imports and re-exports with explicit type-only status and exact spans', () => {
  const sourceBytes = Buffer.from([
    "import type { A } from './target.js';",
    "import { type B, C } from './target.js';",
    "export type { D } from './target.js';",
    "export * from './target.js';",
    '',
  ].join('\n'));
  const sourceRevision = createHash('sha256').update(sourceBytes).digest('hex');
  const result = extractSourceImportCandidatesV1({
    workspaceRevision,
    sources: [
      { sourceRef: 'src/from.ts', sourceBytes, sourceRevision, workspaceRevision },
      { sourceRef: 'src/target.ts', sourceBytes: targetSourceBytes, sourceRevision: targetSourceRevision, workspaceRevision },
    ],
  });

  assert.deepEqual(result.edges.map(edge => [edge.relationKind, edge.typeOnlyStatus]), [
    ['STATIC_IMPORT', 'EXPLICIT_TYPE_ONLY'],
    ['STATIC_IMPORT', 'MIXED_TYPE_AND_VALUE'],
    ['STATIC_REEXPORT', 'EXPLICIT_TYPE_ONLY'],
    ['STATIC_REEXPORT', 'NO_EXPLICIT_TYPE_MODIFIER'],
  ]);
  for (const edge of result.edges) {
    assert.equal(sourceBytes.subarray(Number(edge.startByte), Number(edge.endByte)).toString('utf8'), edge.importSpanText);
    assert.equal(edge.evidenceStatus, 'EXACT_SOURCE_SPAN_AND_REVISION; STATIC_MODULE_REFERENCE_ONLY; NONCANONICAL');
  }
  assert.equal(result.unresolved.length, 0);
});

test('keeps unresolved external module references as non-edge observations', () => {
  const sourceBytes = Buffer.from("export { External } from 'external-package';\n");
  const sourceRevision = createHash('sha256').update(sourceBytes).digest('hex');
  const result = extractSourceImportCandidatesV1({ workspaceRevision, sources: [
    { sourceRef: 'src/from.ts', sourceBytes, sourceRevision, workspaceRevision },
  ] });

  assert.equal(result.edges.length, 0);
  assert.equal(result.unresolved.length, 1);
  assert.equal(result.unresolved[0]?.status, 'EXTERNAL_PACKAGE');
});
