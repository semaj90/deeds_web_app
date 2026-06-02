import { db } from '$lib/server/db/client.js';
import { nesChromPackets, nesChromKagDagHits } from '$lib/server/db/schema/nes-chrom-packets.js';

export interface NesChromPacketInput {
  queryHash: string;
  chunkId: string;
  sourceRef: string;
  sourceRefs?: string[];
  featureId: string;
  summary?: string | null;
  payload?: Record<string, unknown>;
  embedding?: number[] | Float32Array | null;
  kagDagRunId?: string | null;
  kagNodeKey?: string | null;
  tokenBudget?: number | null;
  model?: string | null;
  lane?: string | null;
  qdrantPointId?: string | null;
}

export interface NesChromKagDagHitInput {
  runId?: string | null;
  chunkId: string;
  sourceRef: string;
  hitType?: string;
  score?: number | null;
  nodeKey?: string | null;
  evidence?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export function buildNesChromPacketKey(input: Pick<NesChromPacketInput, 'queryHash' | 'featureId' | 'chunkId'>): string {
  return ['nes', input.featureId, input.queryHash.slice(0, 16), input.chunkId.replace(/[^a-z0-9:_-]/gi, '_').slice(0, 64)].join(':');
}

export async function persistNesChromPacket(input: NesChromPacketInput): Promise<{ packetId: string; packetKey: string }> {
  const packetKey = buildNesChromPacketKey(input);
  const sourceRefs = Array.from(new Set([input.sourceRef, ...(input.sourceRefs ?? [])].map((value) => String(value).trim()).filter(Boolean)));
  const packet = {
    packetKey,
    queryHash: input.queryHash,
    chunkId: input.chunkId,
    sourceRef: input.sourceRef,
    sourceRefs,
    featureId: input.featureId,
    packetType: 'nes_chrom',
    lane: input.lane ?? 'semantic_packet',
    model: input.model ?? 'gemma4-rotorquant:latest',
    summary: input.summary ?? null,
    payload: {
      ...(input.payload ?? {}),
      sourceRefs,
      queryHash: input.queryHash,
      featureId: input.featureId,
      chunkId: input.chunkId,
      qdrantPointId: input.qdrantPointId ?? null,
    },
    embedding: input.embedding ?? null,
    qdrantPointId: input.qdrantPointId ?? null,
    kagDagRunId: input.kagDagRunId ?? null,
    kagNodeKey: input.kagNodeKey ?? null,
    tokenBudget: input.tokenBudget ?? null,
  };

  const [row] = await db
    .insert(nesChromPackets)
    .values(packet as any)
    .onConflictDoUpdate({
      target: nesChromPackets.packetKey,
      set: {
        summary: packet.summary,
        payload: packet.payload,
        sourceRefs: packet.sourceRefs,
        qdrantPointId: packet.qdrantPointId,
        kagDagRunId: packet.kagDagRunId,
        kagNodeKey: packet.kagNodeKey,
        tokenBudget: packet.tokenBudget,
        updatedAt: new Date(),
      } as any,
    })
    .returning({ id: nesChromPackets.id, packetKey: nesChromPackets.packetKey });

  return {
    packetId: row.id,
    packetKey: row.packetKey,
  };
}

export async function persistNesChromKagDagHit(input: NesChromKagDagHitInput & { packetId: string }): Promise<void> {
  await db
    .insert(nesChromKagDagHits)
    .values({
      packetId: input.packetId as any,
      runId: input.runId ?? null,
      chunkId: input.chunkId,
      sourceRef: input.sourceRef,
      hitType: input.hitType ?? 'context',
      score: input.score ?? null,
      nodeKey: input.nodeKey ?? null,
      evidence: input.evidence ?? {},
      metadata: input.metadata ?? {},
    })
    .catch(() => null);
}

export async function persistNesChromPacketWithHits(
  input: NesChromPacketInput,
  hits: NesChromKagDagHitInput[] = []
): Promise<{ packetId: string; packetKey: string }> {
  const packet = await persistNesChromPacket(input);
  await Promise.allSettled(
    hits.map((hit) =>
      persistNesChromKagDagHit({
        ...hit,
        packetId: packet.packetId,
      })
    )
  );
  return packet;
}
