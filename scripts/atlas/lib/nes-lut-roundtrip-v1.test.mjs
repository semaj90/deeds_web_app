import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyPalette, roundTrip, comparePersisted, encode, decode } from './nes-lut-roundtrip-v1.mjs';

const good = () => ({ auth: { lutByte: 1, nesHex: '0x16', label: 'A', priorWeight: 0.9 }, ui: { lutByte: 2, nesHex: '0x2A', label: 'B', priorWeight: 0.8 }, general: { lutByte: 10, nesHex: '0x0F', label: 'G', priorWeight: 0.4 } });

test('a consistent palette verifies and round-trips; unknown codes do not decode', () => {
  assert.equal(verifyPalette(good()).valid, true);
  assert.equal(roundTrip(good()).ok, true);
  assert.equal(decode(good(), 200), null);
  assert.equal(encode(good(), 'nope'), null);
});

test('collisions, bad hex, bad bytes and bad weights are named', () => {
  const dup = { ...good(), x: { lutByte: 1, nesHex: '0x16', label: 'A', priorWeight: 0.1 } };
  const errs = verifyPalette(dup).errors.join('|');
  assert.match(errs, /COLLISION:lutByte:1/);
  assert.match(errs, /COLLISION:nesHex:0x16/);
  assert.match(errs, /COLLISION:label:A/);
  assert.ok(verifyPalette({ a: { lutByte: 300, nesHex: '0x1', label: 'L', priorWeight: 2 } }).errors.length >= 3);
  assert.equal(roundTrip(dup).ok, false);
});

test('lutByte and nesHex are different fields and must not be swapped', () => {
  assert.ok(verifyPalette({ a: { lutByte: 42, nesHex: '0x2A', label: 'L', priorWeight: 0.5 } }).errors.includes('LUT_BYTE_EQUALS_NES_BYTE:a'));
});

test('persisted comparison reports each differing field, missing and extra rows', () => {
  const rows = [
    { domain_key: 'auth', lut_byte: '1', nes_hex: '0x16', nes_byte: '22', label: 'A', prior_weight: '0.9' },
    { domain_key: 'ui', lut_byte: '2', nes_hex: '0x2B', nes_byte: '43', label: 'B', prior_weight: '0.8' },
    { domain_key: 'extra', lut_byte: '9', nes_hex: '0x01', nes_byte: '1', label: 'X', prior_weight: '0.1' },
  ];
  const out = comparePersisted(good(), rows);
  assert.equal(out.equal, false);
  const fields = out.diffs.map((d) => `${d.key}:${d.field}`);
  assert.ok(fields.includes('ui:nesHex') && fields.includes('ui:nesByte'));
  assert.ok(fields.includes('general:row'));
  assert.ok(fields.includes('extra:row'));
  assert.equal(comparePersisted({ auth: good().auth }, [rows[0]]).equal, true);
});
