import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { reconstructAstGrepNominationIdV1 } from './nomination-id-reconstruction-v1.mjs';

test('reconstructs the nomination identity from the exact canonical hash material', () => {
  const input = { sourceRef: 'repo\\src\\a.ts', sourceRevision: 'workspace:0', kind: 'CLASS', name: 'Café', startByte: 12, endByte: 34 };
  const keyMaterial = JSON.stringify({ sourceRef: 'repo/src/a.ts', sourceRevision: 'workspace:0', kind: 'class', name: 'Café', startByte: 12, endByte: 34 });
  const digest = crypto.createHash('sha256').update(keyMaterial, 'utf8').digest('hex');
  assert.equal(reconstructAstGrepNominationIdV1(input), `ast-grep-nomination:${digest.slice(0, 40)}`);
});
