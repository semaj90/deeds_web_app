import test from 'node:test';
import assert from 'node:assert/strict';
import {
  bucketFor,
  isActiveCoverageRow,
  normalizeSourceRef,
} from '../atlas/report-production-qdrant-no-som.lib.mjs';

test('normalizeSourceRef collapses common repo prefixes', () => {
  assert.equal(normalizeSourceRef('../scripts/atlas/out/report.json'), 'scripts/atlas/out/report.json');
  assert.equal(normalizeSourceRef('sveltekit-frontend/src/routes/api/health/+server.ts'), 'src/routes/api/health/+server.ts');
  assert.equal(normalizeSourceRef('scripts/atlas/build-synthesized-map.mjs'), 'scripts/atlas/build-synthesized-map.mjs');
});

test('bucketFor groups by the first three path segments', () => {
  assert.equal(bucketFor('sveltekit-frontend/src/routes/api/health/+server.ts'), 'src/routes/api');
  assert.equal(bucketFor('../scripts/atlas/build-synthesized-map.mjs'), 'scripts/atlas/build-synthesized-map.mjs');
});

test('isActiveCoverageRow excludes generated/cache/vendor rows', () => {
  assert.equal(
    isActiveCoverageRow({
      source_ref: '../scripts/atlas/out/report.json',
      source_kind: 'generated',
      index_lane: 'generated',
      profile_card_visible: false,
      tags: ['vendor'],
    }),
    false,
  );

  assert.equal(
    isActiveCoverageRow({
      source_ref: 'src/routes/api/health/+server.ts',
      source_kind: 'source',
      index_lane: 'source',
      profile_card_visible: true,
      tags: [],
    }),
    true,
  );
});

