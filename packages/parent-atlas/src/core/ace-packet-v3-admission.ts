import { z } from 'zod';
import { verifyAcePacketV3, type AcePacketV3 } from './ace-packet-v3.js';
import { sha256HexV1 } from './knowledge/stable-json-v1.js';

/**
 * Cache admission for atlas.ace-packet.v3 (BitFrost/Valkey and any other rebuildable store).
 * Presence in a cache — and TTL — is never proof of freshness: a stored packet is a HIT only if it parses,
 * its checksum verifies AND every expected identity field equals the cached identity. Anything else is a MISS.
 */

export const aceCacheExpectationV3Schema = z.object({
  packet_key: z.string().min(1),
  source_ref: z.string().min(1).optional(),
  source_revision: z.string().min(1),
  workspace_revision: z.string().min(1),
  representation_id: z.string().min(1),
  representation_revision: z.string().min(1).nullable(),
  feature_revision: z.string().min(1).nullable().optional(),
  graph_revision: z.string().min(1).nullable().optional(),
  producer_revision: z.string().min(1).optional(),
  packet_checksum: z.string().regex(/^sha256:[0-9a-f]{64}$/).optional(),
}).strict();
export type AceCacheExpectationV3 = z.infer<typeof aceCacheExpectationV3Schema>;

export type AceCacheDecisionV3 =
  | { decision: 'HIT'; packet: AcePacketV3 }
  | { decision: 'MISS'; reason: 'UNPARSEABLE' | 'SCHEMA_INVALID' | 'CHECKSUM_MISMATCH' | `IDENTITY_MISMATCH:${string}` };

const IDENTITY_FIELDS = [
  'packet_key', 'source_ref', 'source_revision', 'workspace_revision', 'representation_id',
  'representation_revision', 'feature_revision', 'graph_revision', 'producer_revision',
] as const;

export function admitCachedAcePacketV3(raw: string | unknown, expectedInput: AceCacheExpectationV3): AceCacheDecisionV3 {
  const expected = aceCacheExpectationV3Schema.parse(expectedInput);
  let value: unknown = raw;
  if (typeof raw === 'string') {
    try { value = JSON.parse(raw); } catch { return { decision: 'MISS', reason: 'UNPARSEABLE' }; }
  }
  let packet: AcePacketV3;
  try { packet = verifyAcePacketV3(value); } catch (error) {
    return { decision: 'MISS', reason: String((error as Error).message).includes('packet_checksum') ? 'CHECKSUM_MISMATCH' : 'SCHEMA_INVALID' };
  }
  for (const field of IDENTITY_FIELDS) {
    const want = (expected as Record<string, unknown>)[field];
    if (want === undefined) continue;
    if ((packet.identity as Record<string, unknown>)[field] !== want) return { decision: 'MISS', reason: `IDENTITY_MISMATCH:${field}` };
  }
  if (expected.packet_checksum && packet.integrity.packet_checksum !== expected.packet_checksum) return { decision: 'MISS', reason: 'CHECKSUM_MISMATCH' };
  return { decision: 'HIT', packet };
}

/** Stable digest of the full identity tuple, intended as the key suffix by the BitFrost key builder. Not a freshness proof. */
export function acePacketIdentityDigestV3(identity: AcePacketV3['identity']): string {
  return `sha256:${sha256HexV1(identity)}`;
}
