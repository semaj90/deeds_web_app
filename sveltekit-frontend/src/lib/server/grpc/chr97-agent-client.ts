/**
 * CHR97 Agent gRPC Client — server-only.
 *
 * Lazy-loaded singleton gRPC client for the Chr97Agent service defined in
 * proto/active/chr97_agent.proto.  Used as a fast-path by the cartridge
 * export/search/timeline API routes, with automatic fallback to the direct
 * Qdrant scroll + CHR97 builder path when gRPC is unavailable.
 *
 * All addresses resolved via ENV.* getters in env.server.ts.
 */
import { ENV } from '$lib/server/env.server.js';
import { buildGrpcClientChannelOptions } from './client-options.js';

// ── Public types ───────────────────────────────────────────────────────────

/** A single rune returned from GetCartridge — wraps the 128-byte Chr97Rune header. */
export interface Chr97RuneBinary {
  /** 128-byte Chr97Rune header (binary — contains quantised FP16 cluster centroid) */
  header: Uint8Array;
  /** UTF-8 text summary / tag string */
  tag: string;
  /** UTF-8 display label */
  label: string;
  /** JSON metadata: sourceId, sourceName, entities[], section, chunkIndex, etc. */
  imageMeta: Record<string, unknown>;
}

/** Relational edge between two runes in the CHR97 knowledge graph. */
export interface Chr97GraphEdge {
  fromId: number;
  toId: number;
  /** Relation type: "cites" | "contradicts" | "explains" */
  relation: string;
}

/** Decoded cartridge response (runes + graph). */
export interface Chr97CartridgeResult {
  runes: Chr97RuneBinary[];
  edges: Chr97GraphEdge[];
  source: 'grpc';
}

/** Single hit from QueryTags. */
export interface Chr97TagHit {
  runeId: number;
  caseId: string;
  chunkIndex: number;
  tag: string;
  label: string;
  savedCitations: string[];
  searchCitations: string[];
}

/** Timeline event from GetTimeline. */
export interface Chr97TimelineEvent {
  id: string;
  /** ISO8601 timestamp */
  ts: string;
  /** "ingest" | "search" | "edit" | "note" */
  kind: string;
  description: string;
}

/** GetTimeline response. */
export interface Chr97TimelineResult {
  events: Chr97TimelineEvent[];
  aiSummary: string;
  source: 'grpc';
}

// ── gRPC singleton ─────────────────────────────────────────────────────────

let _client: unknown = null;
let _loadFailed = false;
let _retryAt = 0;
let _failLogged = false;

async function getClient(): Promise<unknown> {
  if (_loadFailed) {
    if (Date.now() < _retryAt) return null;
    _loadFailed = false;
    _client = null;
  }
  if (_client) return _client;

  try {
    const grpc = await import('@grpc/grpc-js');
    const protoLoader = await import('@grpc/proto-loader');
    const { resolve } = await import('path');

    const PROTO_PATH = resolve(process.cwd(), '../proto/active/chr97_agent.proto');

    const packageDefinition = await protoLoader.load(PROTO_PATH, {
      keepCase: false,
      longs: Number,
      enums: String,
      defaults: true,
      oneofs: true,
    });

    const descriptor = grpc.loadPackageDefinition(packageDefinition) as Record<string, unknown>;
    const pkg = descriptor['chr97'] as Record<string, unknown>;
    const Chr97Agent = pkg['Chr97Agent'] as new (
      address: string,
      credentials: unknown,
      options?: Record<string, unknown>
    ) => unknown;

    _client = new Chr97Agent(
      ENV.CHR97_GRPC_URL,
      grpc.credentials.createInsecure(),
      buildGrpcClientChannelOptions({
        maxConnectionIdleMs: 300_000,
        maxSendMessageLength: 32 * 1024 * 1024,
        maxReceiveMessageLength: 32 * 1024 * 1024,
      })
    );

    return _client;
  } catch (err) {
    if (!_failLogged) {
      console.warn(
        '[chr97-agent-client] gRPC init failed, will retry in 30s:',
        (err as Error).message
      );
      _failLogged = true;
    }
    _loadFailed = true;
    _retryAt = Date.now() + 30_000;
    return null;
  }
}

// ── Helper: decode proto RuneBinary → Chr97RuneBinary ─────────────────────

function _decodeRuneBinary(raw: Record<string, unknown>): Chr97RuneBinary {
  // Proto field names after keepCase:false → camelCase
  const headerBuf = raw['header'];
  const tagBuf    = raw['tag'];
  const labelBuf  = raw['label'];
  const metaBuf   = raw['imageMeta'];

  const header: Uint8Array =
    headerBuf instanceof Uint8Array ? headerBuf :
    Buffer.isBuffer(headerBuf)      ? new Uint8Array(headerBuf) :
    new Uint8Array(0);

  const tag   = Buffer.isBuffer(tagBuf)   ? tagBuf.toString('utf-8')   :
                tagBuf instanceof Uint8Array ? Buffer.from(tagBuf).toString('utf-8') : '';
  const label = Buffer.isBuffer(labelBuf) ? labelBuf.toString('utf-8') :
                labelBuf instanceof Uint8Array ? Buffer.from(labelBuf).toString('utf-8') : '';

  let imageMeta: Record<string, unknown> = {};
  try {
    const metaStr = Buffer.isBuffer(metaBuf)      ? metaBuf.toString('utf-8') :
                    metaBuf instanceof Uint8Array  ? Buffer.from(metaBuf).toString('utf-8') : '';
    if (metaStr) imageMeta = JSON.parse(metaStr);
  } catch { /* malformed JSON is safe to ignore */ }

  return { header, tag, label, imageMeta };
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Fetch the full CHR97 cartridge (runes + graph edges) for a case.
 *
 * Returns null when gRPC is disabled or the service is unreachable —
 * callers must fall back to the Qdrant scroll path.
 */
export async function getChr97Cartridge(
  caseId: string,
  timeoutMs = 8_000
): Promise<Chr97CartridgeResult | null> {
  if (!ENV.CHR97_GRPC_ENABLED) return null;

  const client = await getClient();
  if (!client) return null;

  return new Promise((resolve) => {
    const deadline = new Date(Date.now() + timeoutMs);
    (client as Record<string, Function>)['getCartridge'](
      { caseId },
      { deadline },
      (err: Error | null, response: Record<string, unknown> | null) => {
        if (err || !response) {
          console.warn('[chr97-agent-client] GetCartridge failed:', err?.message ?? 'no response');
          resolve(null);
          return;
        }

        const rawRunes = Array.isArray(response['runes']) ? response['runes'] : [];
        const rawEdges = Array.isArray(response['edges']) ? response['edges'] : [];

        const runes: Chr97RuneBinary[] = rawRunes.map((r: unknown) =>
          _decodeRuneBinary(r as Record<string, unknown>)
        );

        const edges: Chr97GraphEdge[] = rawEdges.map((e: unknown) => {
          const edge = e as Record<string, unknown>;
          return {
            fromId:   Number(edge['fromId']   ?? edge['from_id']   ?? 0),
            toId:     Number(edge['toId']     ?? edge['to_id']     ?? 0),
            relation: String(edge['relation'] ?? 'cites'),
          };
        });

        resolve({ runes, edges, source: 'grpc' });
      }
    );
  });
}

/**
 * Query the CHR97 agent for rune tag + citation matches.
 *
 * Returns null when gRPC is disabled or unreachable.
 */
export async function queryChr97Tags(
  query: string,
  limit = 20,
  timeoutMs = 5_000
): Promise<Chr97TagHit[] | null> {
  if (!ENV.CHR97_GRPC_ENABLED) return null;

  const client = await getClient();
  if (!client) return null;

  return new Promise((resolve) => {
    const deadline = new Date(Date.now() + timeoutMs);
    (client as Record<string, Function>)['queryTags'](
      { query, limit },
      { deadline },
      (err: Error | null, response: Record<string, unknown> | null) => {
        if (err || !response) {
          console.warn('[chr97-agent-client] QueryTags failed:', err?.message ?? 'no response');
          resolve(null);
          return;
        }

        const rawHits = Array.isArray(response['hits']) ? response['hits'] : [];

        const hits: Chr97TagHit[] = rawHits.map((h: unknown) => {
          const hit = h as Record<string, unknown>;
          return {
            runeId:          Number(hit['runeId']          ?? hit['rune_id']          ?? 0),
            caseId:          String(hit['caseId']          ?? hit['case_id']          ?? ''),
            chunkIndex:      Number(hit['chunkIndex']      ?? hit['chunk_index']      ?? 0),
            tag:             String(hit['tag']             ?? ''),
            label:           String(hit['label']           ?? ''),
            savedCitations:  Array.isArray(hit['savedCitations'])  ? hit['savedCitations'].map(String)  : [],
            searchCitations: Array.isArray(hit['searchCitations']) ? hit['searchCitations'].map(String) : [],
          };
        });

        resolve(hits);
      }
    );
  });
}

/**
 * Fetch the agentic timeline (events + AI summary) for a case.
 *
 * Returns null when gRPC is disabled or unreachable.
 */
export async function getChr97Timeline(
  caseId: string,
  userId = '',
  timeoutMs = 6_000
): Promise<Chr97TimelineResult | null> {
  if (!ENV.CHR97_GRPC_ENABLED) return null;

  const client = await getClient();
  if (!client) return null;

  return new Promise((resolve) => {
    const deadline = new Date(Date.now() + timeoutMs);
    (client as Record<string, Function>)['getTimeline'](
      { caseId, userId },
      { deadline },
      (err: Error | null, response: Record<string, unknown> | null) => {
        if (err || !response) {
          console.warn('[chr97-agent-client] GetTimeline failed:', err?.message ?? 'no response');
          resolve(null);
          return;
        }

        const rawEvents = Array.isArray(response['events']) ? response['events'] : [];

        const events: Chr97TimelineEvent[] = rawEvents.map((ev: unknown) => {
          const e = ev as Record<string, unknown>;
          return {
            id:          String(e['id']          ?? ''),
            ts:          String(e['ts']          ?? new Date().toISOString()),
            kind:        String(e['kind']        ?? 'ingest'),
            description: String(e['description'] ?? ''),
          };
        });

        resolve({
          events,
          aiSummary: String(response['aiSummary'] ?? response['ai_summary'] ?? ''),
          source: 'grpc',
        });
      }
    );
  });
}

/**
 * Health-check the Chr97Agent gRPC service.
 */
export async function checkChr97GrpcHealth(): Promise<{
  enabled: boolean;
  available: boolean;
  url: string;
  detail?: string;
}> {
  const base = { enabled: ENV.CHR97_GRPC_ENABLED, url: ENV.CHR97_GRPC_URL };

  if (!ENV.CHR97_GRPC_ENABLED) return { ...base, available: false, detail: 'disabled by config' };

  const client = await getClient();
  if (!client) return { ...base, available: false, detail: 'client init failed' };

  // Probe with an empty GetCartridge — any non-transport-error means service is up
  return new Promise((resolve) => {
    const deadline = new Date(Date.now() + 2_000);
    (client as Record<string, Function>)['getCartridge'](
      { caseId: '__health_probe__' },
      { deadline },
      (err: Error | null) => {
        if (err) {
          const detail = err.message ?? 'unknown error';
          // gRPC NOT_FOUND means service is up (but probe caseId doesn't exist) — healthy
          if (detail.includes('NOT_FOUND') || detail.includes('not found')) {
            resolve({ ...base, available: true, detail: 'healthy (not found expected)' });
          } else {
            resolve({ ...base, available: false, detail });
          }
        } else {
          resolve({ ...base, available: true, detail: 'healthy' });
        }
      }
    );
  });
}
