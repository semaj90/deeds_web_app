/**
 * Phase 3D: Retrieval Telemetry Recorder
 *
 * Fire-and-forget telemetry capture for retrieval queries.
 * Records every ACE context assembly, search operation, and RAG pipeline execution.
 *
 * Non-blocking: failures are logged but do not interrupt query execution.
 */

import { pool } from '$lib/server/db/client.js';
import crypto from 'node:crypto';

/** One retrieved packet pointer — no payload, no body. */
export interface RetrievalHit {
  packet_key:         string;
  feature_id?:        string | null;
  source_ref?:        string | null;
  fusion_score?:      number | null;
  retrieval_strategy?: string | null;
}

/** Per-query hit summary stored in atlas_retrieval_eval_times.payload. */
export interface RetrievalHitsPayload {
  hits?:   RetrievalHit[];
  counts?: {
    packet_hits?:      number;
    cache_hits?:       number;
    neo4j_expansions?: number;
    [k: string]:       number | undefined;
  };
}

export interface RetrievalTelemetrySignal {
  query: string;
  latencyMs: number;
  vectorHits: number;
  trigramHits: number;
  ftsHits: number;
  selectedPacketKey?: string | null;
  selectedPacketKeys?: string[];
  selectedFeatureId?: string | null;
  featureIds?: string[];
  fusionScore?: number;
  cacheHit?: boolean;
  surface: string;
  environment: string;
  retrievalStrategy?: 'vector_only' | 'lexical_only' | 'structural_only' | 'fusion' | 'cold_neschrom';
  /** Pointer-only hit summary — written to atlas_retrieval_eval_times.payload. No packet bodies. */
  hitsPayload?: RetrievalHitsPayload;
  /** Per-lane timing breakdowns (ms). */
  timings?: {
    bm25_ms?:    number;
    qdrant_ms?:  number;
    redis_ms?:   number;
    neo4j_ms?:   number;
    fusion_ms?:  number;
    rerank_ms?:  number;
  };
  /** First domain_class from results, for atlas_retrieval_eval_times. */
  domainClass?: string | null;
  /** First source_ref from results. */
  sourceRef?: string | null;
  protocol?: 'jsonrpc' | 'http' | 'grpc' | 'mcp' | string;
  accelerator?: string | null;
  cudaAvailable?: boolean | null;
  cuvsEnabled?: boolean | null;
  matmulMs?: number | null;
  embeddingMs?: number | null;
  verdict?: 'PASS' | 'WARN' | 'FAIL' | string | null;
  /** Disable the generic eval-times mirror when the caller owns a richer one-row-per-query writer. */
  writeEvalTimes?: boolean;
}

function cleanStringArray(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  return [...new Set(values.map((value) => String(value ?? '').trim()).filter(Boolean))];
}

function getConceptIdForFeatureOrPacket(id: string): string {
  const clean = id.toLowerCase();
  if (clean.includes('svelte') || clean.includes('component') || clean.includes('ui') || clean.includes('ux') || clean.includes('palette') || clean.includes('view') || clean.includes('dashboard')) {
    return 'ui_components';
  }
  if (clean.includes('drizzle') || clean.includes('postgres') || clean.includes('database') || clean.includes('db') || clean.includes('migration') || clean.includes('orm') || clean.includes('client')) {
    return 'database_orm';
  }
  if (clean.includes('route') || clean.includes('api') || clean.includes('endpoint') || clean.includes('server') || clean.includes('rpc')) {
    return 'api_endpoints';
  }
  if (clean.includes('gpu') || clean.includes('simd') || clean.includes('cuda') || clean.includes('native') || clean.includes('accelerator') || clean.includes('bridge') || clean.includes('libtorch') || clean.includes('tensorrt')) {
    return 'native_accelerators';
  }
  if (clean.includes('telemetry') || clean.includes('observability') || clean.includes('metrics') || clean.includes('log') || clean.includes('recorder') || clean.includes('signal') || clean.includes('trace')) {
    return 'observability_telemetry';
  }
  if (clean.includes('test') || clean.includes('smoke') || clean.includes('check') || clean.includes('benchmark') || clean.includes('harness')) {
    return 'test_harness';
  }
  if (clean.includes('agent') || clean.includes('reason') || clean.includes('fix') || clean.includes('gemma') || clean.includes('qlora') || clean.includes('llm') || clean.includes('unsloth')) {
    return 'agent_intelligence';
  }
  if (clean.includes('docker') || clean.includes('env') || clean.includes('config') || clean.includes('settings') || clean.includes('infrastructure')) {
    return 'infrastructure_config';
  }
  if (clean.includes('topology') || clean.includes('cluster') || clean.includes('som')) {
    return 'emergent_topology';
  }
  return 'general';
}

/**
 * Record a retrieval telemetry signal.
 *
 * This function:
 * 1. Hashes the query for deduplication
 * 2. Inserts the signal into Postgres (fire-and-forget)
 * 3. Updates concept_records metadata, query counts, and temperatures (Phase 3E.1)
 * 4. Logs errors but does not throw (telemetry should not block queries)
 *
 * @param signal - Telemetry signal from retrieval pipeline
 */
export async function recordRetrievalTelemetry(signal: RetrievalTelemetrySignal): Promise<void> {
  try {
    const queryHash = crypto
      .createHash('sha256')
      .update(signal.query)
      .digest('hex');

    const selectedPacketKeys = cleanStringArray(signal.selectedPacketKeys);
    const featureIds = cleanStringArray(signal.featureIds);

    await pool.query(
      `
        insert into retrieval_telemetry (
          query,
          query_hash,
          latency_ms,
          vector_hits,
          trigram_hits,
          fts_hits,
          selected_packet_key,
          selected_packet_keys,
          selected_feature_id,
          feature_ids,
          fusion_score,
          cache_hit,
          surface,
          environment,
          retrieval_strategy
        )
        values ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10::jsonb, $11, $12, $13, $14, $15)
      `,
      [
        signal.query.slice(0, 2000),
        queryHash,
        Math.max(0, Math.round(Number(signal.latencyMs ?? 0))),
        Math.max(0, Math.round(Number(signal.vectorHits ?? 0))),
        Math.max(0, Math.round(Number(signal.trigramHits ?? 0))),
        Math.max(0, Math.round(Number(signal.ftsHits ?? 0))),
        signal.selectedPacketKey ?? selectedPacketKeys[0] ?? null,
        JSON.stringify(selectedPacketKeys),
        signal.selectedFeatureId ?? featureIds[0] ?? null,
        JSON.stringify(featureIds),
        signal.fusionScore ?? null,
        Boolean(signal.cacheHit),
        signal.surface,
        signal.environment,
        signal.retrievalStrategy ?? 'fusion',
      ],
    );

    // ── atlas_retrieval_eval_times: one row per query, JSONB hits summary ────
    // Pointer-only: no packet bodies, no vectors stored here.
    if (signal.writeEvalTimes !== false) void pool.query(
      `INSERT INTO atlas_retrieval_eval_times
         (query_hash, packet_key, feature_id, domain_class, source_ref,
          qdrant_ms, bm25_ms, redis_ms, bitfrost_ms, neo4j_ms, rerank_ms, total_ms,
          cache_hit_source, result_count, protocol, accelerator, cuda_available, cuvs_enabled,
          matmul_ms, embedding_ms, verdict, payload, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22::jsonb,now())
       ON CONFLICT DO NOTHING`,
      [
        queryHash,
        signal.selectedPacketKey ?? selectedPacketKeys[0] ?? '',
        signal.selectedFeatureId ?? featureIds[0] ?? null,
        signal.domainClass ?? null,
        signal.sourceRef ?? null,
        signal.timings?.qdrant_ms  ?? null,
        signal.timings?.bm25_ms    ?? null,
        signal.timings?.redis_ms   ?? null,
        null,                                          // bitfrost_ms — set by ACE emitter
        signal.timings?.neo4j_ms   ?? null,
        signal.timings?.rerank_ms  ?? null,
        Math.max(0, Math.round(Number(signal.latencyMs ?? 0))),
        signal.cacheHit ? 'redis' : null,
        (selectedPacketKeys.length || 0),
        signal.protocol ?? 'http',
        signal.accelerator ?? 'cpu',
        signal.cudaAvailable ?? null,
        signal.cuvsEnabled ?? null,
        signal.matmulMs ?? null,
        signal.embeddingMs ?? null,
        signal.verdict ?? null,
        JSON.stringify(signal.hitsPayload ?? {}),
      ],
    ).catch((e: unknown) =>
      console.error('[Telemetry] atlas_retrieval_eval_times insert failed:',
        e instanceof Error ? e.message : String(e))
    );

    // Concept Telemetry Integration (Phase 3E.1)
    const featuresToMatch = [...featureIds];
    if (signal.selectedFeatureId) {
      featuresToMatch.push(signal.selectedFeatureId);
    }
    const packetsToMatch = [...selectedPacketKeys];
    if (signal.selectedPacketKey) {
      packetsToMatch.push(signal.selectedPacketKey);
    }

    const fallbackConceptId = getConceptIdForFeatureOrPacket(signal.query);
    const conceptIdsToMatch = [fallbackConceptId];
    for (const f of featuresToMatch) {
      conceptIdsToMatch.push(getConceptIdForFeatureOrPacket(f));
    }
    for (const p of packetsToMatch) {
      conceptIdsToMatch.push(getConceptIdForFeatureOrPacket(p));
    }
    const uniqueConceptIds = [...new Set(conceptIdsToMatch.filter(Boolean))];

    const strategy = signal.retrievalStrategy ?? 'fusion';
    await pool.query(
      `
        update concept_records cr
        set
          retrieval_count = cr.retrieval_count + 1,
          last_retrieved_at = now(),
          retrieval_strategy = coalesce($1, cr.retrieval_strategy),
          strategy_distribution = jsonb_set(
            coalesce(cr.strategy_distribution, '{}'::jsonb),
            array[$2],
            (coalesce((cr.strategy_distribution->$2)::integer, 0) + 1)::text::jsonb
          ),
          concept_temperature = least(1.0, greatest(0.0, cr.concept_temperature * 0.85 + 0.15 * (1.2 - cr.repair_success))),
          feature_ids = (
            select coalesce(jsonb_agg(distinct merged.value), '[]'::jsonb)
            from (
              select value
              from jsonb_array_elements_text(coalesce(cr.feature_ids, '[]'::jsonb)) as value
              union
              select unnest($6::text[]) as value
            ) merged
          ),
          packet_keys = (
            select coalesce(jsonb_agg(distinct merged.value), '[]'::jsonb)
            from (
              select value
              from jsonb_array_elements_text(coalesce(cr.packet_keys, '[]'::jsonb)) as value
              union
              select unnest($7::text[]) as value
            ) merged
          ),
          evidence_cards = (
            select coalesce(jsonb_agg(distinct merged.value), '[]'::jsonb)
            from (
              select value
              from jsonb_array_elements_text(coalesce(cr.evidence_cards, '[]'::jsonb)) as value
              union
              select unnest($7::text[]) as value
            ) merged
          )
        where
          cr.concept_id = any($3::text[])
          or exists (
            select 1 from jsonb_array_elements_text(cr.feature_ids) f
            where f = any($4::text[])
          )
          or exists (
            select 1 from jsonb_array_elements_text(cr.packet_keys) p
            where p = any($5::text[])
          )
      `,
      [
        strategy,
        strategy,
        uniqueConceptIds,
        featuresToMatch,
        packetsToMatch,
        featureIds,
        selectedPacketKeys,
      ]
    );

  } catch (err) {
    // Telemetry failure should not block queries
    console.error('[Telemetry] Failed to record retrieval signal:', {
      query: signal.query.slice(0, 100),
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * Batch record multiple telemetry signals.
 *
 * Useful when multiple operations (e.g., hybrid search with vector + FTS) happen
 * in a single request context.
 *
 * @param signals - Array of telemetry signals
 */
export async function recordRetrievalTelemetryBatch(signals: RetrievalTelemetrySignal[]): Promise<void> {
  if (signals.length === 0) return;

  try {
    await Promise.all(signals.map((signal) => recordRetrievalTelemetry(signal)));
  } catch (err) {
    console.error('[Telemetry] Failed to record batch:', {
      count: signals.length,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
