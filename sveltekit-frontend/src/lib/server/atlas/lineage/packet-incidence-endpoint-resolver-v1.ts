/**
 * HYPERRAG-LINEAGE-03: resolve incidence endpoints to exact canonical packets. READ-ONLY and DB-free here:
 * the caller injects packet-row and canonical-key lookups (the latter delegates to
 * `identity/packet-identity-resolver.ts`, not a duplicated resolver). This module mints no identity. A packet whose
 * `source_revision` is NULL is REVISIONLESS and does not resolve: it can never become LINEAGE_PROVEN.
 * Live 2026-10-04: 16,151 of 61,718 atlas_packets rows carry source_revision, so at most ~26% can resolve today.
 */
import type { PacketIncidenceExpectedV1 } from './packet-incidence-lineage-v1.js';

export interface AtlasPacketRowV1 {
  packet_key: string;
  source_ref: string | null;
  source_revision: string | null;
}

export type EndpointResolutionStatusV1 = 'RESOLVED' | 'NOT_FOUND' | 'REVISIONLESS' | 'MISSING_SOURCE_REF' | 'IDENTITY_UNRESOLVED';

export interface EndpointResolutionV1 {
  packetKey: string;
  status: EndpointResolutionStatusV1;
  /** canonicalId comes only from the injected canonical packet-key resolver. */
  canonicalId: string | null;
  sourceRevision: string | null;
}

export async function resolveIncidenceEndpointsV1(
  packetKeys: readonly string[],
  fetchPacketRows: (keys: string[]) => Promise<AtlasPacketRowV1[]>,
  resolveCanonicalId: (packetKey: string) => Promise<string | null>,
): Promise<Map<string, EndpointResolutionV1>> {
  const unique = [...new Set(packetKeys.map((k) => k.trim()).filter(Boolean))];
  const rows = unique.length ? await fetchPacketRows(unique) : [];
  const byKey = new Map(rows.map((r) => [r.packet_key, r]));
  const out = new Map<string, EndpointResolutionV1>();
  const identities = await Promise.all(unique.map(async (key) => [key, await resolveCanonicalId(key)] as const));
  const canonicalByKey = new Map(identities);
  for (const key of unique) {
    const row = byKey.get(key);
    let status: EndpointResolutionStatusV1 = 'RESOLVED';
    if (!row) status = 'NOT_FOUND';
    else if (!row.source_ref?.trim()) status = 'MISSING_SOURCE_REF';
    else if (!row.source_revision?.trim()) status = 'REVISIONLESS';
    else if (!canonicalByKey.get(key)) status = 'IDENTITY_UNRESOLVED';
    out.set(key, {
      packetKey: key,
      status,
      canonicalId: status === 'RESOLVED' ? canonicalByKey.get(key)! : null,
      sourceRevision: status === 'RESOLVED' ? row!.source_revision!.trim() : null,
    });
  }
  return out;
}

/** Adapt a prefetched resolution map to the verifier's `resolvePacket` contract; unresolved endpoints return null. */
export function expectedFromResolutionsV1(
  resolutions: ReadonlyMap<string, EndpointResolutionV1>,
  workspaceRevision: string,
  graphRevision: string,
): PacketIncidenceExpectedV1 {
  return {
    workspaceRevision,
    graphRevision,
    resolvePacket: (key) => {
      const r = resolutions.get(key);
      return r?.status === 'RESOLVED' ? { canonicalId: r.canonicalId!, sourceRevision: r.sourceRevision! } : null;
    },
  };
}

export function summarizeResolutionsV1(resolutions: ReadonlyMap<string, EndpointResolutionV1>): Record<EndpointResolutionStatusV1, number> {
  const s: Record<EndpointResolutionStatusV1, number> = { RESOLVED: 0, NOT_FOUND: 0, REVISIONLESS: 0, MISSING_SOURCE_REF: 0, IDENTITY_UNRESOLVED: 0 };
  for (const r of resolutions.values()) s[r.status] += 1;
  return s;
}
