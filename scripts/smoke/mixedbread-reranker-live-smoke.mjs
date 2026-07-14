#!/usr/bin/env node
/**
 * Live Mixedbread reranker smoke.
 *
 * Proves the canonical SearchRuntime retrieves from multiple lanes and that
 * the canonical reranker returns explicit provenance.
 */

import { createSearchRuntime } from '../../sveltekit-frontend/src/lib/server/retrieval/search-runtime.ts';
import { rerankCanonicalFeatureEnvelopes } from '../../sveltekit-frontend/src/lib/server/retrieval/canonical-rerank-executor.ts';
import { scanObjectForTurnMarkers } from '../atlas/lib/packet-audit-utils.mjs';

const QUERY = 'How is canonical packet identity resolved before RRF?';
const TOP_K = 20;
const FINAL_TOP_K = 5;

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function scanPacketsForMarkers(packets) {
  const hits = [];
  for (const packet of packets) {
    const markerHits = scanObjectForTurnMarkers(packet);
    if (markerHits.length > 0) {
      hits.push({
        packet_key: packet.packet_key,
        markerHits: markerHits.slice(0, 5),
      });
    }
  }
  return hits;
}

async function main() {
  const runtime = createSearchRuntime({ userId: 'mixedbread-live-smoke' });

  const search = await runtime.search({
    text: QUERY,
    topK: TOP_K,
  });

  assert(search.provenance.retrievalSources.length >= 2, `expected at least two retrieval lanes, got ${search.provenance.retrievalSources.join(', ') || '(none)'}`);
  assert(search.metadata.candidatesFused >= search.packets.length, 'expected aggregated candidates to be at least the returned packet count');
  assert(search.metadata.candidatesReranked >= TOP_K, `expected the canonical reranker to see top-${TOP_K}, got ${search.metadata.candidatesReranked}`);
  assert(search.packets.length > 0, 'search returned no packets');

  const rerankInput = search.packets.slice(0, TOP_K);
  const rerank = await rerankCanonicalFeatureEnvelopes(QUERY, rerankInput, {
    authScope: 'public',
    rendererVersion: 'mixedbread-live-smoke',
    maxLength: 4096,
    topK: FINAL_TOP_K,
    cachePolicy: 'disabled',
  });

  assert(rerank.results.length >= FINAL_TOP_K, `expected top-${FINAL_TOP_K} reranked packets, got ${rerank.results.length}`);
  assert(rerank.provenance.modelVersion.includes('mxbai-rerank-base-v2'), `expected mixedbread base-v2 model version, got ${rerank.provenance.modelVersion}`);
  assert(typeof rerank.provenance.latencyMs === 'number' && rerank.provenance.latencyMs >= 0, 'rerank latency missing');
  assert(rerank.provenance.crossEncoderAttempted === true, 'cross encoder attempt not recorded');
  assert(rerank.provenance.crossEncoderUsed === true || rerank.provenance.fallbackUsed === true, 'neither cross encoder nor fallback was recorded');

  const inputKeys = new Map(rerankInput.map((row) => [row.packet_key, row.source_ref]));
  for (const row of rerank.results) {
    assert(inputKeys.has(row.packet_key), `reranked packet_key not present in input: ${row.packet_key}`);
    assert(inputKeys.get(row.packet_key) === row.source_ref, `source_ref changed across rerank for ${row.packet_key}`);
  }

  const topKeys = rerank.results.slice(0, FINAL_TOP_K).map((row) => row.packet_key);
  assert(new Set(topKeys).size === topKeys.length, 'reranked top-5 contains duplicate packet identities');

  const markerHits = [
    ...scanPacketsForMarkers(search.packets),
    ...scanPacketsForMarkers(rerank.results),
  ];
  assert(markerHits.length === 0, `generated role markers leaked into rerank output: ${JSON.stringify(markerHits.slice(0, 3), null, 2)}`);

  const report = {
    generatedAt: new Date().toISOString(),
    query: QUERY,
    retrieval: {
      sources: search.provenance.retrievalSources,
      candidatesRetrieved: search.metadata.candidatesRetrieved,
      candidatesFused: search.metadata.candidatesFused,
      candidatesReranked: search.metadata.candidatesReranked,
    },
    rerank: {
      topK: FINAL_TOP_K,
      modelVersion: rerank.provenance.modelVersion,
      rendererVersion: rerank.provenance.rendererVersion,
      cacheStatus: rerank.provenance.cacheStatus,
      fallbackUsed: rerank.provenance.fallbackUsed,
      fallbackReason: rerank.provenance.fallbackReason ?? null,
      latencyMs: rerank.provenance.latencyMs ?? null,
    },
    topPackets: rerank.results.slice(0, FINAL_TOP_K).map((row) => ({
      packet_key: row.packet_key,
      source_ref: row.source_ref,
      model_version: row.model_version ?? null,
      rank_after: row.rank_after ?? null,
      cross_encoder_score: row.cross_encoder_score ?? null,
      blended_score: row.blended_score ?? null,
    })),
    markerHits: markerHits.length,
    status: 'PASS',
  };

  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  const message = String(error?.message ?? error ?? '');
  if (/ECONNREFUSED|fetch failed|sidecar|rerank/i.test(message)) {
    console.error('Mixedbread reranker sidecar unavailable; rerank smoke cannot run.');
    process.exit(1);
  }
  console.error('[mixedbread-reranker-live-smoke] failed:', error?.stack ?? message);
  process.exit(1);
});

