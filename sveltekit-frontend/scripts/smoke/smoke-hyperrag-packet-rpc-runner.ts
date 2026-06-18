#!/usr/bin/env tsx
/**
 * smoke-hyperrag-packet-rpc-runner.ts
 *
 * Flags:
 *   --query <text>       query string (default: 'retrieval telemetry parent atlas packet')
 *   --limit <n>          max packets (default: 5, max: 25)
 *   --allow-empty        don't assert packet count > 0
 *   --include-graph      pass includeGraph:true to hyperragPacketRpc (Neo4j expansion)
 *   --use-fts            pass useFts:true (Postgres BM25)
 */
import { closeHyperRagPacketRpcPool, hyperragPacketRpc } from '../../src/lib/server/retrieval/hyperrag-packet-rpc.js';

function argValue(name: string, fallback: string): string {
  const idx = process.argv.indexOf(name);
  if (idx >= 0 && process.argv[idx + 1]) return process.argv[idx + 1];
  const inline = process.argv.find((arg) => arg.startsWith(`${name}=`));
  if (inline) return inline.slice(name.length + 1);
  return fallback;
}

const query        = argValue('--query', 'retrieval telemetry parent atlas packet');
const limit        = Math.max(1, Math.min(Number(argValue('--limit', '5')), 25));
const allowEmpty   = process.argv.includes('--allow-empty');
const includeGraph = process.argv.includes('--include-graph');
const useFts       = process.argv.includes('--use-fts');

function assert(condition: unknown, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

async function main(): Promise<void> {
  try {
    console.log('[smoke:hyperrag-packet-rpc] start', { query, limit, includeGraph, useFts });
    const result = await hyperragPacketRpc({
      query,
      limit,
      includeGraph,
      useFts,
      awaitTelemetry: true,
      useExactMatchCache: true,
    });
    console.log('[smoke:hyperrag-packet-rpc] helper returned', { packets: result.packets.length });

    // Structural assertions
    assert(result.query === query, 'query echo mismatch');
    assert(Array.isArray(result.packets), 'packets must be an array');
    assert(result.trace && typeof result.trace.latency_ms === 'number', 'trace.latency_ms is missing');
    assert(result.trace.collection_split.codebase_topology === 'codebase_chunks_768', 'codebase collection split mismatch');
    assert(result.trace.collection_split.runtime_legal === 'legal_documents', 'runtime collection split mismatch');

    // Strategy: 'fusion' only when both graph+fts are enabled
    if (includeGraph && useFts) {
      assert(result.strategy === 'fusion', `expected strategy 'fusion', got '${result.strategy}'`);
    }

    if (!allowEmpty) {
      assert(result.packets.length > 0, 'expected at least one packet; pass --allow-empty for shape-only smoke');
    }

    const first = result.packets[0] ?? null;
    if (first) {
      assert(typeof first.packet_key === 'string' && first.packet_key.length > 0, 'packet_key missing on first packet');
      assert(typeof first.source_ref === 'string' && first.source_ref.length > 0, 'source_ref missing on first packet');
      // retrieval_lanes only populated on full-fusion path
      if (first.retrieval_lanes) {
        assert(typeof first.retrieval_lanes.fts === 'number', 'retrieval_lanes.fts not a number');
      }
    }

    console.log(JSON.stringify({
      ok: true,
      query: result.query,
      strategy: result.strategy,
      includeGraph,
      useFts,
      packets: result.packets.length,
      trace: result.trace,
      firstPacket: first ? {
        packet_key: first.packet_key,
        source_ref: first.source_ref,
        feature_id: first.feature_id,
        rank: first.rank,
      } : null,
    }, null, 2));
  } finally {
    console.log('[smoke:hyperrag-packet-rpc] closing pool');
    await closeHyperRagPacketRpcPool();
    console.log('[smoke:hyperrag-packet-rpc] done');
    process.exit(0);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
