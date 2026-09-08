import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const source = fs.readFileSync(path.join(root, 'scripts/atlas/hyperrag-packet-materializer.mjs'), 'utf8');

test('HyperRAG schema admission is apply-only', () => {
  assert.match(source, /if\s*\(APPLY\)\s+await\s+ensureHotTable\(client\)/);
  assert.equal([...source.matchAll(/await\s+ensureHotTable\(client\)/g)].length, 1);
});

test('HyperRAG registry upsert is apply-only', () => {
  assert.match(source, /const packed = APPLY \? await upsertRegistry\(client, registryPacket\) : null/);
  assert.doesNotMatch(source, /const packed = await upsertRegistry\(client, registryPacket\)/);
});

test('HyperRAG keeps dry-run output explicitly planned', () => {
  assert.match(source, /planned: !APPLY/);
  assert.match(source, /mode: APPLY \? 'apply' : 'dry-run'/);
});
