import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { buildNativeInferenceReceiptV1, NativeInferenceReceiptV1Schema } from './native-inference-receipt-v1.js';

const hash = (value: string) => `sha256:${createHash('sha256').update(value, 'utf8').digest('hex')}`;

describe('NativeInferenceReceiptV1', () => {
  it('records the ABI-stable native boundary without claiming execution proof', () => {
    const receipt = buildNativeInferenceReceiptV1({
      requestId: 'fixture:native-inference-1',
      representationId: 'semantic_768',
      representationRevision: 'semantic_768:fixture-v1',
      modelRevision: 'model:fixture-v1',
      executorRevision: 'addon:fixture-v1',
      nodeApiVersion: 'napi-10',
      addonRevision: 'addon:fixture-v1',
      libtorchVersion: 'libtorch:uninstalled',
      device: 'CPU',
      computeCapability: null,
      inputChecksum: hash('input'),
      outputChecksum: hash('output'),
      shape: [1, 768],
      dtype: 'float32',
      parityStatus: 'NOT_RUN',
      eventLoopSafe: true,
      canonicalAuthority: false,
      writesPerformed: false,
    });

    expect(receipt.executor).toBe('libtorch_node_api');
    expect(receipt.eventLoopSafe).toBe(true);
    expect(receipt.parityStatus).toBe('NOT_RUN');
    expect(receipt.canonicalAuthority).toBe(false);
    expect(receipt.writesPerformed).toBe(false);
  });

  it('rejects an addon receipt that claims canonical authority or event-loop blocking', () => {
    const input = {
      requestId: 'fixture:native-inference-2', representationId: 'semantic_768', representationRevision: 'semantic_768:fixture-v1',
      modelRevision: 'model:fixture-v1', executorRevision: 'addon:fixture-v1', nodeApiVersion: 'napi-10', addonRevision: 'addon:fixture-v1',
      libtorchVersion: 'libtorch:uninstalled', device: 'CPU' as const, computeCapability: null,
      inputChecksum: hash('input'), outputChecksum: hash('output'), shape: [1, 768], dtype: 'float32' as const,
      parityStatus: 'NOT_RUN' as const, eventLoopSafe: true as const, canonicalAuthority: false as const, writesPerformed: false as const,
    };
    const receipt = buildNativeInferenceReceiptV1(input);
    expect(() => NativeInferenceReceiptV1Schema.parse({ ...receipt, canonicalAuthority: true })).toThrow();
    expect(() => NativeInferenceReceiptV1Schema.parse({ ...receipt, eventLoopSafe: false })).toThrow();
  });
});

