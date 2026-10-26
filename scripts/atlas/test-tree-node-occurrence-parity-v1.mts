import assert from 'node:assert/strict';
import { deriveTreeNodeOccurrenceId as deriveTypeScript } from '../../sveltekit-frontend/src/lib/server/atlas/identity/tree-node-occurrence-v1.ts';
import { deriveTreeNodeOccurrenceId as deriveJavaScript } from './lib/tree-node-occurrence-v1.mjs';

const fixtures = [
  {
    sourceRef: 'src/utf8.ts',
    sourceRevision: `sha256:${'a'.repeat(64)}`,
    nodeType: 'function_declaration',
    startByte: 4,
    endByte: 41,
  },
  {
    sourceRef: 'src/utf8.ts',
    sourceRevision: `sha256:${'b'.repeat(64)}`,
    nodeType: 'function_declaration',
    startByte: 4,
    endByte: 41,
    astPath: 'program/function_declaration[1]',
  },
  {
    sourceRef: 'src/目录/😀.ts',
    sourceRevision: 'workspace:diagnostic-fixture',
    nodeType: 'method_definition',
    startByte: 0,
    endByte: 19,
    astPath: null,
  },
];

for (const fixture of fixtures) {
  assert.equal(deriveJavaScript(fixture), deriveTypeScript(fixture));
}

console.log(JSON.stringify({
  schema: 'atlas.tree-node-occurrence-parity.v1',
  fixtures: fixtures.length,
  parity: 'PASS',
  canonicalAuthority: false,
  writesPerformed: false,
}));
