import test from 'node:test';
import assert from 'node:assert/strict';
import { describeOnnxProviderEvidence } from './onnx-provider-evidence-v1.mjs';

test('reports an advertised backend without claiming it executed', () => {
  assert.deepEqual(
    describeOnnxProviderEvidence('webgpu', [{ name: 'cpu' }, { name: 'webgpu' }]),
    {
      requestedProvider: 'webgpu',
      runtimeAdvertised: true,
      supportedProviderNames: ['cpu', 'webgpu'],
      actualProvider: null,
      actualProviderVerified: false,
      attribution: 'UNVERIFIED_PER_NODE_EXECUTION',
      fallbackVisibility: 'NOT_EXPOSED_BY_PROVIDER_LIST',
    },
  );
});

test('does not claim an unadvertised provider was available or executed', () => {
  const evidence = describeOnnxProviderEvidence('webgpu', [{ name: 'cpu' }]);
  assert.equal(evidence.runtimeAdvertised, false);
  assert.equal(evidence.actualProvider, null);
  assert.equal(evidence.actualProviderVerified, false);
});

test('handles malformed backend inventory as no provider evidence', () => {
  const evidence = describeOnnxProviderEvidence('cpu', null);
  assert.equal(evidence.runtimeAdvertised, false);
  assert.deepEqual(evidence.supportedProviderNames, []);
});
