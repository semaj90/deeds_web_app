/**
 * Drift guard: the .mjs title contract's `semantic-title-v2` rule must reproduce the REAL generator's output.
 * Run from sveltekit-frontend: npx tsx ../scripts/atlas/title-identity-contract-v1.parity.test.mts
 */
import assert from 'node:assert/strict';
import {
  generateTitleIdentity,
  TITLE_GENERATOR_VERSION,
} from '../../sveltekit-frontend/src/lib/server/ace/title-id-generator.ts';
import { verifyTitleDerivationV1, classifyTitleFormatV1, TITLE_VERSION_RULES_V1 } from './lib/title-identity-contract-v1.mjs';

assert.equal(TITLE_GENERATOR_VERSION, 'semantic-title-v2', 'generator version changed: update TITLE_VERSION_RULES_V1');
for (const packetKey of ['packet:abcdef012345', 'ace:packet:0123456789ab', 'packet:12345678-1234-5123-8123-123456789abc']) {
  const generated = generateTitleIdentity(packetKey, { featureLabel: 'Auth Handler' });
  assert.equal(generated.generatorVersion, 'semantic-title-v2');
  assert.equal(classifyTitleFormatV1(generated.titleId), 'TWO_PART', 'generator shape changed');
  const check = verifyTitleDerivationV1({ packetKey, titleId: generated.titleId, generatorVersion: generated.generatorVersion });
  assert.equal(check.status, 'DERIVATION_REPRODUCED', `real generator output not reproduced for ${packetKey}`);
}
assert.equal(TITLE_VERSION_RULES_V1['semantic-title-v2'].evidence, 'SOURCE');

console.log(JSON.stringify({ schema: 'atlas.title-identity-contract-parity.v1', status: 'PARITY_OK', generatorVersion: TITLE_GENERATOR_VERSION }));
