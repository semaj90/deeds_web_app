import test from 'node:test';
import assert from 'node:assert/strict';
import { juneAutoencoderForward } from './june-autoencoder-forward.mjs';

function syntheticWeights(value) {
  return {
    W_enc_768_128: new Float32Array(128 * 768).fill(value),
    b_enc_128: new Float32Array(128).fill(value),
    W_enc_128_64: new Float32Array(64 * 128).fill(value),
    b_enc_64: new Float32Array(64).fill(value),
    W_dec_64_128: new Float32Array(128 * 64).fill(value),
    b_dec_128: new Float32Array(128).fill(value),
    W_dec_128_768: new Float32Array(768 * 128).fill(value),
    b_dec_768: new Float32Array(768).fill(value),
  };
}

test('AE-FORWARD-PARITY-01: June forward adapter guarantees named output dimensions and tuple order', () => {
  const result = juneAutoencoderForward(new Float32Array(768).fill(0.5), syntheticWeights(0.001));
  assert.equal(result.reconstruction.length, 768);
  assert.equal(result.latent.length, 64);

  const [reconstruction, latent] = result.asHistoricalTuple();
  assert.equal(reconstruction.length, 768);
  assert.equal(latent.length, 64);
  assert.throws(() => {
    const [reversedLatent, reversedReconstruction] = result.asHistoricalTuple();
    if (reversedLatent.length !== 64 || reversedReconstruction.length !== 768) {
      throw new Error('TUPLE_ORDER_MISMATCH');
    }
  }, /TUPLE_ORDER_MISMATCH/);
});

test('AE-FORWARD-PARITY-01: tanh outputs remain bounded and invalid inputs reject', () => {
  const result = juneAutoencoderForward(new Float32Array(768).fill(1), syntheticWeights(10));
  assert.ok(result.latent.every((value) => value >= -1 && value <= 1));
  assert.ok(result.reconstruction.every((value) => value >= -1 && value <= 1));
  assert.throws(() => juneAutoencoderForward(new Float32Array(767), syntheticWeights(0)), /INVALID_INPUT/);
});
