/**
 * DAG-Hit Envelope Persist
 *
 * Temporary binary blob store for gRPC/protobuf DAG-hit packets.
 * Uses packet_binary_registry as the canonical transient blob registry.
 * Separate from metadata registries — these are transient binary payloads.
 */

import { db } from '$lib/server/db/client.js';
import { eq, sql } from 'drizzle-orm';
import { encodePacketToMsgpack, decodePacketFromMsgpack } from './packet-msgpack-codec.js';
import type { PacketTopologyEnvelope } from '$lib/server/hyperrag/packet-topology-envelope.js';
import { packetBinaryRegistry } from '$lib/server/db/schema/packet-binary-registry.js';

type DagHitSource = 'dag_hit' | 'cache_swap' | 'repair';

function sha256Hex(input: string): string {
  const { createHash } = require('node:crypto') as typeof import('node:crypto');
  return createHash('sha256').update(input).digest('hex');
}

/**
 * Persist a packet envelope as a binary blob with TTL.
 * Returns the packet_key on success.
 */
export async function persistDagHitEnvelope(
  packet: PacketTopologyEnvelope,
  source: DagHitSource,
  ttlSeconds = 300
): Promise<string> {
  const binary = encodePacketToMsgpack(packet);
  const hash = sha256Hex(JSON.stringify({ packet_key: packet.packet_key, source_ref: packet.source_ref }));

  await db
    .insert(packetBinaryRegistry)
    .values({
      packetKey: packet.packet_key,
      packetId: packet.packet_id,
      packetUlid: packet.packet_ulid ?? null,
      titleId: packet.title_id,
      featureId: packet.feature_id,
      sourceRef: packet.source_ref,
      communityId: packet.community_id ?? null,
      somRow: packet.som_row ?? null,
      somCol: packet.som_col ?? null,
      transportType: 'grpc',
      payloadFormat: 'msgpack',
      binaryPayload: Buffer.from(binary),
      payloadHash: hash,
      ttlSeconds,
      dagHitKind: source,
      updatedAt: new Date(),
      lastAccessedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: packetBinaryRegistry.packetKey,
      set: {
        packetId: packet.packet_id,
        packetUlid: packet.packet_ulid ?? null,
        titleId: packet.title_id,
        featureId: packet.feature_id,
        sourceRef: packet.source_ref,
        communityId: packet.community_id ?? null,
        somRow: packet.som_row ?? null,
        somCol: packet.som_col ?? null,
        transportType: 'grpc',
        payloadFormat: 'msgpack',
        binaryPayload: Buffer.from(binary),
        payloadHash: hash,
        ttlSeconds,
        dagHitKind: source,
        updatedAt: new Date(),
        lastAccessedAt: new Date(),
      },
    });

  return packet.packet_key;
}

/**
 * Retrieve a binary blob by packet_key. Returns null if not found or expired.
 */
export async function retrieveDagHitEnvelope(
  packetKey: string
): Promise<PacketTopologyEnvelope | null> {
  const rows = await db
    .select({
      binaryPayload: packetBinaryRegistry.binaryPayload,
      createdAt: packetBinaryRegistry.createdAt,
      ttlSeconds: packetBinaryRegistry.ttlSeconds,
    })
    .from(packetBinaryRegistry)
    .where(eq(packetBinaryRegistry.packetKey, packetKey))
    .limit(1);

  const row = rows[0];
  if (!row?.binaryPayload) return null;

  if (row.createdAt && row.ttlSeconds) {
    const expiresAt = new Date(row.createdAt.getTime() + row.ttlSeconds * 1000);
    if (expiresAt <= new Date()) return null;
  }

  const decoded = decodePacketFromMsgpack(
    row.binaryPayload instanceof Buffer
      ? row.binaryPayload
      : Buffer.from(row.binaryPayload as unknown as string, 'hex')
  );

  await db
    .update(packetBinaryRegistry)
    .set({ lastAccessedAt: new Date() })
    .where(eq(packetBinaryRegistry.packetKey, packetKey))
    .catch(() => {});

  return decoded as unknown as PacketTopologyEnvelope;
}

/**
 * Purge all expired blobs. Safe to call on a schedule.
 */
export async function purgeExpiredDagHitEnvelopes(): Promise<number> {
  const result = await db.execute(sql`
    DELETE FROM packet_binary_registry
    WHERE (created_at + (ttl_seconds || ' seconds')::interval) <= NOW()
  `);
  return (result as { rowCount?: number }).rowCount ?? 0;
}
