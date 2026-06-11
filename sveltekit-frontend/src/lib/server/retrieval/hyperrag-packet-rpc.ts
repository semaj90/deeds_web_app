import pg from 'pg';
import crypto from 'node:crypto';
import { ENV } from '$lib/server/env.server.js';
import type { FTSResult } from '$lib/server/search/postgres-fts.js';
import { expandNeighbours } from '$lib/server/search/neo4j-rerank.js';

export type HyperRagPacketRpcInput = {
  query: string;
  limit?: number;
  includeGraph?: boolean;
  useFts?: boolean;
  recordTelemetry?: boolean;
  awaitTelemetry?: boolean;
};

export type HyperRagPacketRpcPacket = {
  packet_key: string;
  source_ref: string;
  feature_id: string | null;
  feature_label: string | null;
  directory_path: string | null;
  qdrant_tags: string[];
  neo4j_neighbors: string[];
  retrieval_lanes: {
    dense: number;
    fts: number;
    trigram: number;
    jsonb: number;
  };
  gemma4_summary: string | null;
  rank: number;
};

export type HyperRagPacketRpcResult = {
  query: string;
  strategy: 'fusion';
  packets: HyperRagPacketRpcPacket[];
  trace: {
    qdrant_hits: number;
    postgres_hits: number;
    neo4j_expansions: number;
    duckdb_join_used: false;
    latency_ms: number;
    collection_split: {
      runtime_legal: 'legal_documents';
      codebase_topology: 'codebase_chunks_768';
    };
  };
};

type ParentAtlasRow = {
  source_ref: string | null;
  rel_path: string | null;
  feature_id: string | null;
  summary_lod0: string | null;
  summary_lod1: string | null;
  summary: string | null;
  tags: string[] | null;
  payload: Record<string, unknown> | null;
};

type NesPacketRow = {
  packet_key: string;
  source_ref: string | null;
  feature_id: string | null;
  summary: string | null;
  qdrant_point_id: string | null;
  som_cluster: string | null;
  payload: Record<string, unknown> | null;
};

let packetRpcPool: pg.Pool | null = null;

function getPacketRpcPool(): pg.Pool {
  if (!packetRpcPool) {
    packetRpcPool = new pg.Pool({
      connectionString: ENV.DATABASE_URL,
      max: 1,
      connectionTimeoutMillis: 3000,
      idleTimeoutMillis: 5000,
      statement_timeout: 3000,
    });
  }
  return packetRpcPool;
}

function cleanText(value: unknown): string {
  return String(value ?? '').trim();
}

function splitTags(value: unknown): string[] {
  if (Array.isArray(value)) return [...new Set(value.map(cleanText).filter(Boolean))];
  return [...new Set(cleanText(value).split(/[,\s]+/).map((tag) => tag.trim()).filter(Boolean))];
}

function sourceRefCandidates(hit: FTSResult): string[] {
  return [...new Set([hit.file_path, hit.stable_key].map(cleanText).filter(Boolean))];
}

function directoryPath(sourceRef: string): string | null {
  const normalized = sourceRef.replace(/\\/g, '/');
  const idx = normalized.lastIndexOf('/');
  return idx > 0 ? normalized.slice(0, idx) : null;
}

function featureLabelFrom(row: ParentAtlasRow | NesPacketRow | undefined, featureId: string | null): string | null {
  const payload = row?.payload;
  const label = payload?.feature_label ?? payload?.featureLabel ?? payload?.label ?? payload?.title;
  return cleanText(label) || featureId;
}

async function recordPacketRpcTelemetry(params: {
  query: string;
  latencyMs: number;
  ftsHits: number;
  vectorHits: number;
  packets: HyperRagPacketRpcPacket[];
}): Promise<void> {
  try {
    const query = params.query.slice(0, 2000);
    const queryHash = crypto.createHash('sha256').update(query).digest('hex');
    const packetKeys = params.packets.map((packet) => packet.packet_key).filter(Boolean);
    const featureIds = [...new Set(params.packets.map((packet) => packet.feature_id).filter((featureId): featureId is string => Boolean(featureId)))];

    await getPacketRpcPool().query(
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
        values ($1, $2, $3, $4, 0, $5, $6, $7::jsonb, $8, $9::jsonb, $10, false, 'hyperrag-packet-rpc', 'phase-3d-retrieval-telemetry', 'hyperrag_packet_rpc')
      `,
      [
        query,
        queryHash,
        Math.max(0, Math.round(params.latencyMs)),
        Math.max(0, Math.round(params.vectorHits)),
        Math.max(0, Math.round(params.ftsHits)),
        packetKeys[0] ?? null,
        JSON.stringify(packetKeys),
        featureIds[0] ?? null,
        JSON.stringify(featureIds),
        params.packets[0]?.retrieval_lanes.fts ?? null,
      ],
    );
  } catch (err) {
    console.warn('[hyperrag-packet-rpc] telemetry record failed:', err instanceof Error ? err.message : String(err));
  }
}

async function loadParentAtlas(sourceRefs: string[]): Promise<Map<string, ParentAtlasRow>> {
  if (!sourceRefs.length) return new Map();
  try {
    const { rows } = await getPacketRpcPool().query<ParentAtlasRow>(
      `
        select source_ref, rel_path, feature_id, summary_lod0, summary_lod1, summary, tags, payload
        from parent_atlas_documents
        where source_ref = any($1::text[])
           or rel_path = any($1::text[])
        limit 250
      `,
      [sourceRefs],
    );

    const out = new Map<string, ParentAtlasRow>();
    for (const row of rows) {
      if (row.source_ref) out.set(row.source_ref, row);
      if (row.rel_path) out.set(row.rel_path, row);
    }
    return out;
  } catch {
    return new Map();
  }
}

async function loadNesPackets(sourceRefs: string[]): Promise<Map<string, NesPacketRow>> {
  if (!sourceRefs.length) return new Map();
  try {
    const { rows } = await getPacketRpcPool().query<NesPacketRow>(
      `
        select packet_key, source_ref, feature_id, summary, qdrant_point_id, som_cluster, payload
        from nes_chrom_packets
        where source_ref = any($1::text[])
        order by updated_at desc nulls last, created_at desc nulls last
        limit 250
      `,
      [sourceRefs],
    );

    const out = new Map<string, NesPacketRow>();
    for (const row of rows) {
      if (row.source_ref && !out.has(row.source_ref)) out.set(row.source_ref, row);
    }
    return out;
  } catch {
    return new Map();
  }
}

async function searchCodeLexicalBounded(query: string, limit: number): Promise<FTSResult[]> {
  const client = await getPacketRpcPool().connect();
  try {
    await client.query('begin');
    await client.query(`set local statement_timeout = '3000ms'`);
    const { rows } = await client.query<FTSResult>(
      'SELECT * FROM search_code_lexical($1, $2, $3)',
      [query, limit, null],
    );
    await client.query('commit');
    return rows;
  } catch {
    await client.query('rollback').catch(() => {});
    return [];
  } finally {
    client.release();
  }
}

async function fallbackParentAtlas(query: string, limit: number): Promise<FTSResult[]> {
  try {
    const { rows } = await getPacketRpcPool().query<{
      source_ref: string;
      rel_path: string | null;
      summary_lod0: string | null;
      summary_lod1: string | null;
      summary: string | null;
      tags: string[] | null;
    }>(
      `
        select source_ref, rel_path, summary_lod0, summary_lod1, summary, tags
        from parent_atlas_documents
        where source_ref is not null
          and source_ref <> $1
        order by updated_at desc nulls last, id desc
        limit $2
      `,
      ['', limit],
    );

    return rows.map((row, index) => ({
      stable_key: row.source_ref,
      file_path: row.rel_path ?? row.source_ref,
      symbol_name: null,
      symbol_kind: null,
      language: null,
      content: row.summary_lod0 ?? row.summary_lod1 ?? row.summary ?? '',
      tags: (row.tags ?? []).join(','),
      topo_class: null,
      graph_authority_score: 0,
      lexical_score: Math.max(0.01, 1 - index / Math.max(1, limit)),
      headline: row.summary_lod0 ?? row.summary_lod1 ?? row.summary ?? '',
    }));
  } catch {
    return [];
  }
}

export async function hyperragPacketRpc(input: HyperRagPacketRpcInput): Promise<HyperRagPacketRpcResult> {
  const startedAt = Date.now();
  const query = cleanText(input.query);
  const limit = Math.max(1, Math.min(Number(input.limit ?? 10), 25));
  const includeGraph = input.includeGraph !== false;
  const useFts = input.useFts !== false;

  if (!query) {
    throw new Error('query is required');
  }

  let ftsHits = useFts ? await searchCodeLexicalBounded(query, limit) : [];
  if (!ftsHits.length) {
    ftsHits = await fallbackParentAtlas(query, limit);
  }

  const candidateRefs = [...new Set(ftsHits.flatMap(sourceRefCandidates))];
  const [parentAtlas, nesPackets] = await Promise.all([
    loadParentAtlas(candidateRefs),
    loadNesPackets(candidateRefs),
  ]);

  let neo4jExpansions = 0;
  const packets: HyperRagPacketRpcPacket[] = [];

  for (const [index, hit] of ftsHits.slice(0, limit).entries()) {
    const candidates = sourceRefCandidates(hit);
    const sourceRef = candidates.find((candidate) => parentAtlas.has(candidate) || nesPackets.has(candidate)) ?? candidates[0] ?? hit.stable_key;
    const atlasRow = parentAtlas.get(sourceRef) ?? candidates.map((candidate) => parentAtlas.get(candidate)).find(Boolean);
    const nesRow = nesPackets.get(sourceRef) ?? candidates.map((candidate) => nesPackets.get(candidate)).find(Boolean);
    const featureId = nesRow?.feature_id ?? atlasRow?.feature_id ?? null;
    const packetKey = nesRow?.packet_key ?? `hyperrag:${sourceRef || hit.stable_key}`;
    const neighbors = includeGraph ? await expandNeighbours(hit.stable_key, 1).catch(() => []) : [];
    neo4jExpansions += neighbors.length;

    packets.push({
      packet_key: packetKey,
      source_ref: sourceRef,
      feature_id: featureId,
      feature_label: featureLabelFrom(nesRow ?? atlasRow, featureId),
      directory_path: directoryPath(atlasRow?.rel_path ?? sourceRef),
      qdrant_tags: splitTags(hit.tags).concat(splitTags(atlasRow?.tags)).filter((tag, tagIndex, all) => all.indexOf(tag) === tagIndex),
      neo4j_neighbors: neighbors,
      retrieval_lanes: {
        dense: Number(hit.graph_authority_score ?? 0),
        fts: Number(hit.lexical_score ?? 0),
        trigram: 0,
        jsonb: atlasRow || nesRow ? 1 : 0,
      },
      gemma4_summary: nesRow?.summary ?? atlasRow?.summary_lod0 ?? atlasRow?.summary_lod1 ?? atlasRow?.summary ?? hit.headline ?? null,
      rank: index + 1,
    });
  }

  const latencyMs = Date.now() - startedAt;
  const result: HyperRagPacketRpcResult = {
    query,
    strategy: 'fusion',
    packets,
    trace: {
      qdrant_hits: packets.filter((packet) => packet.qdrant_tags.length > 0).length,
      postgres_hits: ftsHits.length,
      neo4j_expansions: neo4jExpansions,
      duckdb_join_used: false,
      latency_ms: latencyMs,
      collection_split: {
        runtime_legal: 'legal_documents',
        codebase_topology: 'codebase_chunks_768',
      },
    },
  };

  if (input.recordTelemetry !== false) {
    const telemetry = recordPacketRpcTelemetry({
      query,
      latencyMs,
      ftsHits: ftsHits.length,
      vectorHits: result.trace.qdrant_hits,
      packets,
    });
    if (input.awaitTelemetry) {
      await telemetry;
    } else {
      void telemetry;
    }
  }

  return result;
}

export async function closeHyperRagPacketRpcPool(): Promise<void> {
  const pool = packetRpcPool;
  packetRpcPool = null;
  await pool?.end().catch(() => {});
}
