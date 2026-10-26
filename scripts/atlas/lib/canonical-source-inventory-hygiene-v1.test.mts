import test from 'node:test';
import assert from 'node:assert/strict';
import {
  classifyInventoryPath,
  SOURCE_INVENTORY_HYGIENE_POLICY_REVISION,
} from './canonical-source-inventory-hygiene-v1.mts';

test('excludes repository .archive trees from active source inventory', () => {
  assert.equal(
    classifyInventoryPath('.archive/production-hardening/ace-packet.json'),
    'BACKUP_OR_ARCHIVE',
  );
  assert.equal(
    classifyInventoryPath('.archive/knn-contract/knn_contract.py'),
    'BACKUP_OR_ARCHIVE',
  );
});

test('does not exclude ordinary source directories named archive', () => {
  assert.equal(classifyInventoryPath('src/archive/reader.ts'), 'CANONICAL_SOURCE');
});

test('versions the changed inventory exclusion policy', () => {
  assert.equal(
    SOURCE_INVENTORY_HYGIENE_POLICY_REVISION,
    'atlas.canonical-source-inventory-hygiene-policy.2026-10-12.v2',
  );
});
