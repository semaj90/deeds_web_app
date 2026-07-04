/**
 * DAG-Hit Envelope Persist
 *
 * Temporary binary blob store for gRPC/protobuf DAG-hit packets.
 * Uses dag_hit_envelope_cache table (BYTEA, TTL-based).
 * Separate from metadata registries — these are transient binary payloads.
 */

import { db } from '$lib/server/db/client.js';
import { sql, eq } from 'drizzle-orm';
import { encodePacketToMsgpack, decodePacketFromMsgpack } from './packet-msgpack-codec.js';
import type { PacketTopologyEnvelope } from '$lib/server/hyperrag/packet-topology-envelope.js';

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
  const expiresAt = new Date(Date.now() + ttlSeconds * 1000);

  await db.execute(sql`
    INSERT INTO dag_hit_envelope_cache
      (packet_key, binary_payload, packet_shape_hash, created_at, expires_at, source)
    VALUES
      (${packet.packet_key}, ${binary}, ${hash}, NOW(), ${expiresAt.toISOString()}, ${source})
    ON CONFLICT (packet_key) DO UPDATE SET
      binary_payload    = EXCLUDED.binary_payload,
      packet_shape_hash = EXCLUDED.packet_shape_hash,
      expires_at        = EXCLUDED.expires_at,
      source            = EXCLUDED.source
  `);

  return packet.packet_key;
}

/**
 * Retrieve a binary blob by packet_key. Returns null if not found or expired.
 */
export async function retrieveDagHitEnvelope(
  packetKey: string
): Promise<PacketTopologyEnvelope | null> {
  const rows = await db.execute(sql`
    SELECT binary_payload
    FROM dag_hit_envelope_cache
    WHERE packet_key = ${packetKey}
      AND expires_at > NOW()
    LIMIT 1
  `);

  const row = rows.rows?.[0] as { binary_payload: Buffer } | undefined;
  if (!row?.binary_payload) return null;

  const decoded = decodePacketFromMsgpack(
    row.binary_payload instanceof Buffer
      ? row.binary_payload
      : Buffer.from(row.binary_payload as unknown as string, 'hex')
  );

  return decoded as unknown as PacketTopologyEnvelope;
}

/**
 * Purge all expired blobs. Safe to call on a schedule.
 */
export async function purgeExpiredDagHitEnvelopes(): Promise<number> {
  const result = await db.execute(sql`
    DELETE FROM dag_hit_envelope_cache WHERE expires_at <= NOW()
  `);
  return (result as { rowCount?: number }).rowCount ?? 0;
}
