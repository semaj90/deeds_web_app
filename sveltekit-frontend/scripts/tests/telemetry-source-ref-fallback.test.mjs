import test from 'node:test';
import assert from 'node:assert/strict';

import {
  normalizeTelemetrySourceRef,
  resolveTelemetryPacketFallbacks,
} from '../../src/lib/server/features/ai/ace/telemetry-source-ref-fallback.ts';

test('normalizeTelemetrySourceRef collapses common repo and OS prefixes', () => {
  assert.equal(
    normalizeTelemetrySourceRef('..\\scripts\\atlas\\build-synthesized-map.mjs'),
    'scripts/atlas/build-synthesized-map.mjs',
  );

  assert.equal(
    normalizeTelemetrySourceRef('C:\\Users\\james\\Videos\\deeds-web-app\\sveltekit-frontend\\src\\routes\\api\\health\\+server.ts'),
    'sveltekit-frontend/src/routes/api/health/+server.ts',
  );
});

test('resolveTelemetryPacketFallbacks restores sourceRefs and somCluster from query rows', () => {
  const resolved = resolveTelemetryPacketFallbacks({
    sourceRefs: [],
    qdrantPointIds: ['711736734'],
    packetSomCluster: '',
    rows: [
      {
        source_ref: null,
        relative_path: 'src/routes/api/health/+server.ts',
        som_cluster: 26,
      },
      {
        source_ref: 'sveltekit-frontend/src/lib/server/features/ai/ace/context-assembler.ts',
        relative_path: null,
        som_cluster: null,
      },
    ],
  });

  assert.deepEqual(resolved.sourceRefs, [
    'sveltekit-frontend/src/routes/api/health/+server.ts',
    'sveltekit-frontend/src/lib/server/features/ai/ace/context-assembler.ts',
  ]);
  assert.equal(resolved.somCluster, '26');
});

test('resolveTelemetryPacketFallbacks keeps existing refs and dedupes them', () => {
  const resolved = resolveTelemetryPacketFallbacks({
    sourceRefs: [
      'sveltekit-frontend/src/routes/api/health/+server.ts',
      '  sveltekit-frontend/src/routes/api/health/+server.ts  ',
      '../scripts/atlas/build-synthesized-map.mjs',
    ],
    qdrantPointIds: [],
    packetSomCluster: '26',
    rows: [],
  });

  assert.deepEqual(resolved.sourceRefs, [
    'sveltekit-frontend/src/routes/api/health/+server.ts',
    'scripts/atlas/build-synthesized-map.mjs',
  ]);
  assert.equal(resolved.somCluster, '26');
});
