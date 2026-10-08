import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { encodeEnvelope, decodeEnvelope } from './wire_envelope.ts';

test('deterministic golden envelope', () => {
  const encoded = encodeEnvelope(Buffer.from('abc'));
  assert.equal(encoded.toString('hex'), '415458500100000003ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad616263');
  assert.equal(decodeEnvelope(encoded).toString(), 'abc');
});
test('corrupt body rejected', () => {
  const wire = encodeEnvelope(Buffer.from('abc'));
  wire[wire.length - 1] ^= 1;
  assert.throws(() => decodeEnvelope(wire), /CHECKSUM_MISMATCH/);
});
test('truncated header rejected', () => {
  assert.throws(() => decodeEnvelope(Buffer.from('ATXP')), /TRUNCATED_HEADER/);
});
