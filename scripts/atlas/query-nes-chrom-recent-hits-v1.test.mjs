import assert from 'node:assert/strict';
import test from 'node:test';
import { filterNesChromPacketsAndHitsV1 } from './query-nes-chrom-recent-hits-v1.mjs';
import { runJsonlStreamBenchmarkV1 } from './benchmark-jsonl-stream-v1.mjs';

test('filterNesChromPacketsAndHitsV1 filters by sourceRef, featureId, and queryHash', () => {
  const packets = [
    {
      id: 'p1',
      packet_key: 'nes_1',
      source_ref: 'sveltekit-frontend/src/lib/server/retrieval/search-runtime.ts',
      source_refs: ['sveltekit-frontend/src/lib/server/retrieval/search-runtime.ts'],
      feature_id: 'retrieval_rrf',
      query_hash: 'qhash_alpha',
      payload: { parentAtlasCardId: 'card_1' },
    },
    {
      id: 'p2',
      packet_key: 'nes_2',
      source_ref: 'sveltekit-frontend/src/lib/server/atlas/graph/graph-snapshot-materializer.ts',
      source_refs: ['sveltekit-frontend/src/lib/server/atlas/graph/graph-snapshot-materializer.ts'],
      feature_id: 'graph_v2',
      query_hash: 'qhash_beta',
      payload: { parentAtlasCardId: 'card_2' },
    },
  ];

  const hits = [
    {
      id: 'h1',
      packet_id: 'p1',
      source_ref: 'sveltekit-frontend/src/lib/server/retrieval/search-runtime.ts',
      hit_type: 'kag_dag',
      score: 0.94,
    },
    {
      id: 'h2',
      packet_id: 'p2',
      source_ref: 'sveltekit-frontend/src/lib/server/atlas/graph/graph-snapshot-materializer.ts',
      hit_type: 'kag_dag',
      score: 0.89,
    },
  ];

  const byFeature = filterNesChromPacketsAndHitsV1(packets, hits, {
    featureId: 'retrieval_rrf',
  });
  assert.equal(byFeature.packets.length, 1);
  assert.equal(byFeature.packets[0].id, 'p1');
  assert.equal(byFeature.hits.length, 1);
  assert.equal(byFeature.hits[0].id, 'h1');

  const byQueryHash = filterNesChromPacketsAndHitsV1(packets, hits, {
    queryHash: 'qhash_beta',
  });
  assert.equal(byQueryHash.packets.length, 1);
  assert.equal(byQueryHash.packets[0].id, 'p2');
  assert.equal(byQueryHash.hits.length, 1);
  assert.equal(byQueryHash.hits[0].id, 'h2');

  const bySourceRef = filterNesChromPacketsAndHitsV1(packets, hits, {
    sourceRef: 'sveltekit-frontend/src/lib/server/retrieval/search-runtime.ts',
  });
  assert.equal(bySourceRef.packets.length, 1);
  assert.equal(bySourceRef.packets[0].packet_key, 'nes_1');
});

test('runJsonlStreamBenchmarkV1 verifies parity and non-mutating flags', async () => {
  const res = await runJsonlStreamBenchmarkV1({
    recordCount: 1500,
    batchRecords: 256,
  });

  assert.equal(res.canonicalAuthority, false);
  assert.equal(res.writesPerformed, false);
  assert.equal(res.parity.recordCountMatches, true);
  assert.equal(res.parity.packetKeySequenceDigestMatches, true);
  assert.equal(res.boundedStreamJsonlBatchesV1.batchCount, Math.ceil(1500 / 256));
  assert.ok(res.boundedStreamJsonlBatchesV1.recordsPerSec > 0);
});
