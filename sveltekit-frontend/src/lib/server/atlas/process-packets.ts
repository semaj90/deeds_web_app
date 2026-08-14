import { createHash } from 'node:crypto';
import { z } from 'zod';

function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableStringify(entry)).join(',')}]`;
  }

  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableStringify(entry)}`)
      .join(',')}}`;
  }

  return JSON.stringify(value);
}

function uniqueOrdered(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const normalized = String(value).trim();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }
  return result;
}

function toStringArray(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  return uniqueOrdered(values.map((value) => String(value)));
}

function processSummary(packet: AtlasProcessPacketInput): string {
  return [
    packet.name,
    `steps=${packet.stepSymbolIds.length}`,
    packet.stepSymbolIds.length > 0 ? packet.stepSymbolIds.join(' -> ') : 'steps=none',
    packet.dbTables.length > 0 ? `tables=${packet.dbTables.join(',')}` : 'tables=none',
    packet.tools.length > 0 ? `tools=${packet.tools.join(',')}` : 'tools=none',
    packet.endpoints.length > 0 ? `endpoints=${packet.endpoints.join(',')}` : 'endpoints=none',
    packet.caches.length > 0 ? `caches=${packet.caches.join(',')}` : 'caches=none',
  ].join(' | ');
}

export const AtlasProcessPacketInputSchema = z.object({
  processId: z.string().trim().min(1),
  name: z.string().trim().min(1),
  sourceRefs: z.array(z.string().trim().min(1)).default([]),
  stepSymbolIds: z.array(z.string().trim().min(1)).default([]),
  dbTables: z.array(z.string().trim().min(1)).default([]),
  tools: z.array(z.string().trim().min(1)).default([]),
  endpoints: z.array(z.string().trim().min(1)).default([]),
  caches: z.array(z.string().trim().min(1)).default([]),
  graphRevision: z.string().trim().min(1),
  packetKey: z.string().trim().min(1).optional(),
}).strict();

export type AtlasProcessPacketInput = z.input<typeof AtlasProcessPacketInputSchema>;

export interface AtlasProcessPacket {
  schemaVersion: 'atlas.process.packet.v1';
  packetKey: string;
  processId: string;
  name: string;
  sourceRefs: string[];
  stepSymbolIds: string[];
  dbTables: string[];
  tools: string[];
  endpoints: string[];
  caches: string[];
  graphRevision: string;
  processHash: string;
  qdrantPayload: Record<string, unknown>;
  createdAt: string;
}

export interface AtlasProcessPacketBuildResult {
  packet: AtlasProcessPacket;
  canonicalProjection: Record<string, unknown>;
  canonicalHash: string;
}

export interface AtlasProcessPacketPersistResult {
  collection: string;
  upserted: number;
  pointIds: string[];
}

export interface AtlasProcessPacketReadbackResult {
  collection: string;
  processIds: string[];
  pointIds: string[];
  packets: Array<{
    packetKey: string;
    processId: string;
    processHash: string;
    name: string;
    sourceRefs: string[];
    stepSymbolIds: string[];
    dbTables: string[];
    tools: string[];
    endpoints: string[];
    caches: string[];
    graphRevision: string;
  }>;
}

function processPacketEmbeddingText(packet: AtlasProcessPacket): string {
  return [
    packet.name,
    `processId=${packet.processId}`,
    packet.sourceRefs.length > 0 ? `sources=${packet.sourceRefs.join(' ')}` : 'sources=none',
    packet.stepSymbolIds.length > 0 ? `steps=${packet.stepSymbolIds.join(' -> ')}` : 'steps=none',
    packet.dbTables.length > 0 ? `dbTables=${packet.dbTables.join(',')}` : 'dbTables=none',
    packet.tools.length > 0 ? `tools=${packet.tools.join(',')}` : 'tools=none',
    packet.endpoints.length > 0 ? `endpoints=${packet.endpoints.join(',')}` : 'endpoints=none',
    packet.caches.length > 0 ? `caches=${packet.caches.join(',')}` : 'caches=none',
    `graphRevision=${packet.graphRevision}`,
    `processHash=${packet.processHash}`,
  ].join('\n');
}

function processPacketQdrantPayload(packet: AtlasProcessPacket): Record<string, unknown> {
  return {
    point_kind: 'process_packet',
    packet_key: packet.packetKey,
    process_id: packet.processId,
    name: packet.name,
    source_ref: packet.sourceRefs[0] ?? packet.packetKey,
    sourceRefs: packet.sourceRefs,
    step_symbol_ids: packet.stepSymbolIds,
    db_tables: packet.dbTables,
    tools: packet.tools,
    endpoints: packet.endpoints,
    caches: packet.caches,
    graph_revision: packet.graphRevision,
    process_hash: packet.processHash,
    summary: processSummary({
      processId: packet.processId,
      name: packet.name,
      sourceRefs: packet.sourceRefs,
      stepSymbolIds: packet.stepSymbolIds,
      dbTables: packet.dbTables,
      tools: packet.tools,
      endpoints: packet.endpoints,
      caches: packet.caches,
      graphRevision: packet.graphRevision,
      packetKey: packet.packetKey,
    }),
    created_at: packet.createdAt,
  };
}

export function buildAtlasProcessPacket(input: AtlasProcessPacketInput): AtlasProcessPacketBuildResult {
  const parsed = AtlasProcessPacketInputSchema.parse(input);
  const sourceRefs = uniqueOrdered(parsed.sourceRefs);
  const stepSymbolIds = uniqueOrdered(parsed.stepSymbolIds);
  const dbTables = uniqueOrdered(parsed.dbTables);
  const tools = uniqueOrdered(parsed.tools);
  const endpoints = uniqueOrdered(parsed.endpoints);
  const caches = uniqueOrdered(parsed.caches);

  const processHash = `sha256:${sha256(stableStringify({
    processId: parsed.processId,
    name: parsed.name,
    sourceRefs,
    stepSymbolIds,
    dbTables,
    tools,
    endpoints,
    caches,
    graphRevision: parsed.graphRevision,
  })).slice(0, 24)}`;

  const packetKey = parsed.packetKey ?? `sha256:${sha256(stableStringify({
    processHash,
    graphRevision: parsed.graphRevision,
    processId: parsed.processId,
  })).slice(0, 24)}`;

  const canonicalProjection = {
    schemaVersion: 'atlas.process.packet.v1',
    packetKey,
    processId: parsed.processId,
    name: parsed.name,
    sourceRefs,
    stepSymbolIds,
    dbTables,
    tools,
    endpoints,
    caches,
    graphRevision: parsed.graphRevision,
    processHash,
  };

  const canonicalHash = sha256(stableStringify(canonicalProjection));

  const packet: AtlasProcessPacket = {
    schemaVersion: 'atlas.process.packet.v1',
    packetKey,
    processId: parsed.processId,
    name: parsed.name,
    sourceRefs,
    stepSymbolIds,
    dbTables,
    tools,
    endpoints,
    caches,
    graphRevision: parsed.graphRevision,
    processHash,
    qdrantPayload: {
      packet_key: packetKey,
      process_id: parsed.processId,
      name: parsed.name,
      source_refs: sourceRefs,
      step_symbol_ids: stepSymbolIds,
      db_tables: dbTables,
      tools,
      endpoints,
      caches,
      graph_revision: parsed.graphRevision,
      process_hash: processHash,
      summary: processSummary(parsed),
    },
    createdAt: new Date().toISOString(),
  };

  return {
    packet,
    canonicalProjection,
    canonicalHash,
  };
}

export async function persistAtlasProcessPacketsToQdrant(
  packets: AtlasProcessPacket[],
  opts: { collection?: string; wait?: boolean } = {}
): Promise<AtlasProcessPacketPersistResult> {
  const collection = opts.collection ?? 'codebase_chunks';
  if (!packets.length) return { collection, upserted: 0, pointIds: [] };

  const [{ generateEmbeddings }, { qdrant: qdrantManager, sha256ToUuid }] = await Promise.all([
    import('$lib/server/grpc/embedding-client.js'),
    import('$lib/server/vector/qdrant-manager.js'),
  ]);

  const texts = packets.map((packet) => processPacketEmbeddingText(packet));
  const embeddings = await generateEmbeddings(texts);
  const vectors = Array.isArray(embeddings.vectors) ? embeddings.vectors : [];

  if (vectors.length !== packets.length) {
    throw new Error(`process packet embedding mismatch: expected ${packets.length}, got ${vectors.length}`);
  }

  const pointIds = packets.map((packet) => sha256ToUuid(packet.packetKey));
  const points = packets.map((packet, index) => ({
    id: pointIds[index],
    vector: {
      content: vectors[index] ?? [],
    },
    payload: processPacketQdrantPayload(packet),
  }));

  await qdrantManager.upsert({
    collection,
    points,
    wait: opts.wait ?? true,
  });

  return { collection, upserted: points.length, pointIds };
}

export async function readAtlasProcessPacketsFromQdrant(
  processIds: string[],
  opts: { collection?: string; limit?: number } = {}
): Promise<AtlasProcessPacketReadbackResult> {
  const collection = opts.collection ?? 'codebase_chunks';
  const uniqueProcessIds = uniqueOrdered(processIds);
  if (!uniqueProcessIds.length) {
    return { collection, processIds: [], pointIds: [], packets: [] };
  }

  const { qdrant: qdrantManager } = await import('$lib/server/vector/qdrant-manager.js');
  const scroll = await qdrantManager.scroll({
    collection,
    limit: opts.limit ?? 100,
    filter: {
      point_kind: 'process_packet',
      process_id: uniqueProcessIds,
    },
    withPayload: true,
    withVector: false,
  });

  const packets = scroll.points.map((point) => {
    const payload = (point.payload ?? {}) as Record<string, unknown>;
    return {
      packetKey: String(payload.packet_key ?? ''),
      processId: String(payload.process_id ?? ''),
      processHash: String(payload.process_hash ?? ''),
      name: String(payload.name ?? ''),
      sourceRefs: uniqueOrdered(Array.isArray(payload.sourceRefs) ? payload.sourceRefs.map((value) => String(value)) : []),
      stepSymbolIds: uniqueOrdered(Array.isArray(payload.step_symbol_ids) ? payload.step_symbol_ids.map((value) => String(value)) : []),
      dbTables: uniqueOrdered(Array.isArray(payload.db_tables) ? payload.db_tables.map((value) => String(value)) : []),
      tools: uniqueOrdered(Array.isArray(payload.tools) ? payload.tools.map((value) => String(value)) : []),
      endpoints: uniqueOrdered(Array.isArray(payload.endpoints) ? payload.endpoints.map((value) => String(value)) : []),
      caches: uniqueOrdered(Array.isArray(payload.caches) ? payload.caches.map((value) => String(value)) : []),
      graphRevision: String(payload.graph_revision ?? ''),
    };
  });

  return {
    collection,
    processIds: uniqueProcessIds,
    pointIds: scroll.points.map((point) => String(point.id)),
    packets,
  };
}
