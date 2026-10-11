import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  classifyTitleFormatV1, verifyTitleDerivationV1, decideTitlePersistenceV1,
} from './lib/title-identity-contract-v1.mjs';

const h8 = (pk, v) => createHash('sha256').update(`${pk}\0${v}`).digest('hex').slice(0, 8);
const pk = 'packet:abcdef012345';
const three = (slug, v) => `title:${slug}:${h8(pk, v)}`;
const two = (v) => `title:${h8(pk, v)}`;

test('format validator recognizes shapes and nothing else', () => {
  assert.equal(classifyTitleFormatV1('title:auth-handler:deadbeef'), 'THREE_PART');
  assert.equal(classifyTitleFormatV1('title:deadbeef'), 'TWO_PART');
  assert.equal(classifyTitleFormatV1('title:bad-:deadbeef'), 'UNRECOGNIZED');
  assert.equal(classifyTitleFormatV1('cluster:0'), 'UNRECOGNIZED');
  assert.equal(classifyTitleFormatV1(null), 'MISSING');
});
test('valid-looking is not derived: format passes, derivation mismatches', () => {
  const r = verifyTitleDerivationV1({ packetKey: pk, titleId: 'title:auth:00000000', generatorVersion: 'deterministic-title-v1' });
  assert.equal(r.format, 'THREE_PART');
  assert.equal(r.status, 'DERIVATION_MISMATCH');
});
test('deterministic-title-v1 reproduces', () => {
  const r = verifyTitleDerivationV1({ packetKey: pk, titleId: three('auth', 'deterministic-title-v1'), generatorVersion: 'deterministic-title-v1' });
  assert.equal(r.status, 'DERIVATION_REPRODUCED');
  assert.equal(r.evidence, 'SOURCE_AND_OBSERVED');
});
test('semantic-title-v2 is two-part with its own hash input', () => {
  assert.equal(verifyTitleDerivationV1({ packetKey: pk, titleId: two('semantic-title-v2'), generatorVersion: 'semantic-title-v2' }).status, 'DERIVATION_REPRODUCED');
  assert.equal(verifyTitleDerivationV1({ packetKey: pk, titleId: three('auth', 'semantic-title-v2'), generatorVersion: 'semantic-title-v2' }).status, 'SHAPE_DIFFERS_FROM_VERSION_RULE');
});
test('hash-only and three-part forms of different versions have different suffixes', () => {
  assert.notEqual(h8(pk, 'semantic-title-v2'), h8(pk, 'deterministic-title-v1'));
});
test('unknown versions are never reported as reproduced', () => {
  for (const v of ['v1', 'whatever', undefined]) {
    assert.equal(verifyTitleDerivationV1({ packetKey: pk, titleId: three('auth', 'deterministic-title-v1'), generatorVersion: v }).status, 'FORMULA_UNKNOWN_FOR_VERSION');
  }
});
test('packet_key is required', () => {
  assert.equal(verifyTitleDerivationV1({ packetKey: '', titleId: 'title:deadbeef', generatorVersion: 'semantic-title-v2' }).status, 'PACKET_KEY_REQUIRED');
});
test('persistence: three-part reproduced from a SOURCE-backed version is allowed', () => {
  const d = decideTitlePersistenceV1({ packetKey: pk, titleId: three('auth', 'deterministic-title-v1'), generatorVersion: 'deterministic-title-v1' });
  assert.equal(d.allowed, true);
  assert.equal(d.reason, 'POLICY_ALLOWS_SHAPE_ONLY');
  assert.equal(d.productionWriteAuthorized, false);
  assert.equal(d.writesPerformed, false);
});
test('persistence: two-part semantic-title-v2 is blocked under the provisional policy', () => {
  const d = decideTitlePersistenceV1({ packetKey: pk, titleId: two('semantic-title-v2'), generatorVersion: 'semantic-title-v2' });
  assert.equal(d.allowed, false);
  assert.equal(d.reason, 'TWO_PART_NOT_PERSISTABLE_UNDER_POLICY');
});
test('persistence: observed-only version (deterministic-title-v2) is not writable even when the hash reproduces', () => {
  const d = decideTitlePersistenceV1({ packetKey: pk, titleId: three('auth', 'deterministic-title-v1'), generatorVersion: 'deterministic-title-v2' });
  assert.equal(d.check.status, 'DERIVATION_REPRODUCED');
  assert.equal(d.allowed, false);
  assert.equal(d.reason, 'GENERATOR_EVIDENCE_OBSERVED_ONLY');
});
test('persistence: mismatched and unknown-version labels are blocked', () => {
  assert.equal(decideTitlePersistenceV1({ packetKey: pk, titleId: 'title:auth:00000000', generatorVersion: 'deterministic-title-v1' }).reason, 'DERIVATION_MISMATCH');
  assert.equal(decideTitlePersistenceV1({ packetKey: pk, titleId: three('auth', 'deterministic-title-v1'), generatorVersion: 'v1' }).reason, 'FORMULA_UNKNOWN_FOR_VERSION');
});
test('semantic-title-v1 (registry/backfill) is a SOURCE-backed 3-part rule with its own hash input', () => {
  const t = three('auth', 'semantic-title-v1');
  assert.equal(verifyTitleDerivationV1({ packetKey: pk, titleId: t, generatorVersion: 'semantic-title-v1' }).status, 'DERIVATION_REPRODUCED');
  // same packet_key + slug, different version => different suffix: a backfill under v1 would CHANGE stored deterministic-title-v1 labels
  assert.notEqual(t, three('auth', 'deterministic-title-v1'));
});
