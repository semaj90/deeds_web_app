import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { assertLegacyPacketKeyCorpusV1, assertLegacyPacketKeySourceRefMatch, assertPacketKeySourceRefPairsUniqueV1, legacyPacketKeyFromSourceRef, normalizeSourceRef } from './canonical-source-ref.mjs';

test('canonical source-ref boundary rejects unsafe identities before compatibility normalization', () => {
  assert.equal(normalizeSourceRef('./sveltekit-frontend\\src\\a.ts'), 'src/a.ts');
  for (const unsafe of [
    '../private.ts',
    'src/%2e%2e/private.ts',
    'src/%252e%252e/private.ts',
    'src/%2fprivate.ts',
    'https://example.test/src/a.ts',
    'file:///repo/src/a.ts',
    'C:\\repo\\src\\a.ts',
    '\\\\server\\share\\a.ts',
    'src/a.ts?raw=1',
  ]) {
    assert.throws(() => normalizeSourceRef(unsafe), undefined, unsafe);
  }
});

test('legacy packet key preserves the exact source_ref 12-hex formula', () => {
  const sourceRef = 'src/lib/Example.ts';
  const expected = `packet:${createHash('sha256').update(sourceRef, 'utf8').digest('hex').slice(0, 12)}`;
  assert.equal(legacyPacketKeyFromSourceRef(sourceRef), expected);
  assert.match(expected, /^packet:[0-9a-f]{12}$/);
  assert.equal(legacyPacketKeyFromSourceRef(''), '');
});

test('legacy packet collision guard accepts only the matching source identity', () => {
  const packetKey = legacyPacketKeyFromSourceRef('src/a.ts');
  assert.equal(assertLegacyPacketKeySourceRefMatch({ packetKey, sourceRef: 'src/a.ts', existingSourceRef: 'src/a.ts' }), true);
  assert.throws(() => assertLegacyPacketKeySourceRefMatch({ packetKey, sourceRef: 'src/a.ts', existingSourceRef: 'src/b.ts' }), /LEGACY_PACKET_KEY_TRUNCATION_COLLISION/);
  assert.throws(() => assertLegacyPacketKeySourceRefMatch({ packetKey: 'packet:000000000000', sourceRef: 'src/a.ts', existingSourceRef: 'src/a.ts' }), /LEGACY_PACKET_KEY_COLLISION_CHECK_INPUT_INVALID/);
});

test('legacy packet candidate corpus rejects malformed keys and truncated collisions', () => {
  const packetKey = legacyPacketKeyFromSourceRef('src/a.ts');
  assert.equal(assertLegacyPacketKeyCorpusV1([{ packetKey, sourceRef: 'src/a.ts' }]), true);
  assert.throws(() => assertLegacyPacketKeyCorpusV1([{ packetKey: 'packet:wrong', sourceRef: 'src/a.ts' }]), /LEGACY_PACKET_KEY_CORPUS_ENTRY_INVALID/);
  assert.throws(() => assertPacketKeySourceRefPairsUniqueV1([
    { packetKey, sourceRef: 'src/a.ts' },
    { packetKey, sourceRef: 'src/b.ts' },
  ]), /LEGACY_PACKET_KEY_TRUNCATION_COLLISION/);
});

test('audited legacy packet writers use the shared key owner and do not ignore conflicts', () => {
  const writers = [
    '../admit-packets-current-live-identity-v1.mjs',
    '../backfill-summary-layers-from-chunks.mjs',
    '../register-orphaned-chunks.mjs',
    '../upsert-whole-codebase-atlas-packets.mjs',
  ];

  for (const writer of writers) {
    const source = readFileSync(new URL(writer, import.meta.url), 'utf8');
    assert.match(source, /legacyPacketKeyFromSourceRef/iu, `${writer} must use the shared packet-key owner`);
    assert.doesNotMatch(source, /ON\s+CONFLICT\s*\(\s*packet_key\s*\)\s*DO\s+NOTHING/iu, `${writer} must not silently ignore packet-key conflicts`);
  }
});
