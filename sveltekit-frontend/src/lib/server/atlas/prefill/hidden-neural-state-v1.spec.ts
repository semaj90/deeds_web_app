import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { buildHiddenNeuralStateReceiptV1, HiddenNeuralStateV1Schema } from './hidden-neural-state-v1.js';

const hash = (value: string) => `sha256:${createHash('sha256').update(value, 'utf8').digest('hex')}`;

describe('HiddenNeuralStateV1', () => {
  it('records hidden_256 as ephemeral internal state, never a representation', () => {
    const receipt = buildHiddenNeuralStateReceiptV1({
      modelRevision: 'model:r1',
      executionRevision: 'executor:cpu:v1',
      inputChecksum: hash('input'),
      outputChecksum: hash('output'),
    });

    expect(receipt.stateId).toBe('hidden_256');
    expect(receipt.dimensions).toBe(256);
    expect(receipt.registeredRepresentation).toBe(false);
    expect(receipt.durableArtifact).toBe(false);
    expect(receipt.canonicalAuthority).toBe(false);
    expect(receipt.writesPerformed).toBe(false);
    expect(receipt.checksumSha256).toMatch(/^sha256:[a-f0-9]{64}$/);
  });

  it('rejects attempts to register or persist hidden state', () => {
    const receipt = buildHiddenNeuralStateReceiptV1({
      modelRevision: 'model:r1',
      executionRevision: 'executor:cpu:v1',
      inputChecksum: hash('input'),
      outputChecksum: hash('output'),
    });

    expect(() => HiddenNeuralStateV1Schema.parse({ ...receipt, registeredRepresentation: true })).toThrow();
    expect(() => HiddenNeuralStateV1Schema.parse({ ...receipt, durableArtifact: true })).toThrow();
  });

  it('changes identity when the model or execution revision changes', () => {
    const base = buildHiddenNeuralStateReceiptV1({
      modelRevision: 'model:r1',
      executionRevision: 'executor:cpu:v1',
      inputChecksum: hash('input'),
      outputChecksum: hash('output'),
    });
    const changed = buildHiddenNeuralStateReceiptV1({
      modelRevision: 'model:r2',
      executionRevision: 'executor:cuda:v1',
      inputChecksum: hash('input'),
      outputChecksum: hash('output'),
    });
    expect(changed.checksumSha256).not.toBe(base.checksumSha256);
  });
});
