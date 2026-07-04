#!/usr/bin/env node
/**
 * ACE Packet Swap smoke test
 *
 * Proves binary serialization is safe:
 *   canonical packet → msgpack encode → decode → compare packet_key + title_id
 *   + feature_id + summary hash
 *
 * No Postgres or Redis required — pure codec round-trip.
 *
 * Usage: node scripts/atlas/smoke-ace-packet-swap.mjs
 */

import { createHash } from 'node:crypto';

// Resolve @msgpack/msgpack from sveltekit-frontend node_modules
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const __dir = dirname(fileURLToPath(import.meta.url));
const req = createRequire(join(__dir, '../../sveltekit-frontend/package.json'));
const { encode, decode } = req('@msgpack/msgpack');

// PacketMsgpackTags (mirrors packet-msgpack-codec.ts)
const Tags = {
  packet_key:   0,
  packet_id:    1,
  packet_ulid:  2,
  title_id:     3,
  feature_id:   4,
  source_ref:   5,
  directory_path: 6,
  som_row:      7,
  som_col:      8,
  som_cluster:  9,
  community_id: 10,
  kmeans_cluster_id: 11,
  latent_64:    12,
  manifold_4d:  13,
  qdrant_point_id: 14,
  neo4j_neighbors: 15,
  page_rank_score: 16,
  summary:      17,
};

function summaryHash(s) {
  return createHash('sha256').update(s ?? '').digest('hex').slice(0, 16);
}

function encodePacket(packet) {
  const obj = {};
  obj[Tags.packet_key]  = packet.packet_key;
  obj[Tags.packet_id]   = packet.packet_id;
  obj[Tags.title_id]    = packet.title_id;
  obj[Tags.feature_id]  = packet.feature_id;
  obj[Tags.source_ref]  = packet.source_ref;
  if (packet.summary)          obj[Tags.summary]        = packet.summary;
  if (packet.som_row != null)  obj[Tags.som_row]        = packet.som_row;
  if (packet.som_col != null)  obj[Tags.som_col]        = packet.som_col;
  if (packet.community_id != null) obj[Tags.community_id] = packet.community_id;
  if (packet.latent_64)        obj[Tags.latent_64]      = packet.latent_64;
  return encode(obj);
}

function decodePacket(bytes) {
  return decode(bytes);
}

function verifyRoundTrip(packet) {
  const failures = [];

  const encoded = encodePacket(packet);
  const decoded = decodePacket(encoded);

  const packet_key_match   = decoded[Tags.packet_key]  === packet.packet_key;
  const title_id_match     = decoded[Tags.title_id]    === packet.title_id;
  const feature_id_match   = decoded[Tags.feature_id]  === packet.feature_id;
  const summary_hash_match = summaryHash(decoded[Tags.summary]) === summaryHash(packet.summary);

  if (!packet_key_match)   failures.push(`packet_key: expected ${packet.packet_key}, got ${decoded[Tags.packet_key]}`);
  if (!title_id_match)     failures.push(`title_id: expected ${packet.title_id}, got ${decoded[Tags.title_id]}`);
  if (!feature_id_match)   failures.push(`feature_id: expected ${packet.feature_id}, got ${decoded[Tags.feature_id]}`);
  if (!summary_hash_match) failures.push('summary hash mismatch after round-trip');

  return {
    ok: failures.length === 0,
    encoded_bytes: encoded.length,
    json_bytes: new TextEncoder().encode(JSON.stringify(packet)).length,
    packet_key_match,
    title_id_match,
    feature_id_match,
    summary_hash_match,
    failures,
  };
}

// ── Test packets ──────────────────────────────────────────────────────────────

const PACKETS = [
  {
    label: 'minimal packet (identity fields only)',
    packet: {
      packet_key: 'ace:packet:auth:001',
      packet_id:  'pid_auth_001',
      title_id:   'title:auth',
      feature_id: 'auth.sessions',
      source_ref: 'src/lib/server/auth.ts',
    },
  },
  {
    label: 'packet with summary + SOM coords + latent_64',
    packet: {
      packet_key:  'ace:packet:db:042',
      packet_id:   'pid_db_042',
      title_id:    'title:db',
      feature_id:  'db.client',
      source_ref:  'src/lib/server/db/client.ts',
      summary:     'Provides the Drizzle ORM database client singleton for all server-side queries.',
      som_row:     3,
      som_col:     7,
      community_id: 12,
      latent_64:   new Float32Array(64).fill(0.1),
    },
  },
  {
    label: 'packet with unicode summary',
    packet: {
      packet_key: 'ace:packet:legal:999',
      packet_id:  'pid_legal_999',
      title_id:   'title:legal',
      feature_id: 'legal.citation',
      source_ref: 'src/lib/server/legal/citation.ts',
      summary:    '§ 1983 civil rights claim — "unreasonable seizure" under the Fourth Amendment. Héritier v. État (2024).',
    },
  },
  {
    label: 'packet with null summary (edge case)',
    packet: {
      packet_key: 'ace:packet:empty:000',
      packet_id:  'pid_empty_000',
      title_id:   'title:empty',
      feature_id: 'empty.feature',
      source_ref: 'src/lib/empty.ts',
      summary:    null,
    },
  },
];

let passed = 0, failed = 0;

for (const { label, packet } of PACKETS) {
  const result = verifyRoundTrip(packet);
  const icon = result.ok ? '✅' : '❌';
  console.log(
    `${icon} ${label}\n` +
    `   bytes: json=${result.json_bytes} msgpack=${result.encoded_bytes}` +
    ` (${((1 - result.encoded_bytes / result.json_bytes) * 100).toFixed(1)}% smaller)\n` +
    `   packet_key=${result.packet_key_match} title_id=${result.title_id_match}` +
    ` feature_id=${result.feature_id_match} summary_hash=${result.summary_hash_match}` +
    (result.failures.length ? `\n   FAILURES: ${result.failures.join('; ')}` : '')
  );
  if (result.ok) passed++; else failed++;
}

console.log(`\n[smoke:ace-swap] ${passed}/${PACKETS.length} passed${failed ? ` — ${failed} FAILED` : ''}`);
process.exit(failed > 0 ? 1 : 0);
