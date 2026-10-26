import { pool } from '$lib/server/db/client.js';
import {
  DomainClassificationV1Schema,
  type DomainClassificationV1,
} from '../contracts/okf-cross-domain-v1.js';
import {
  resolvePacketKeyResolutionCoreV2,
  type PacketKeyResolutionLookups,
} from './packet-key-resolution-v2.js';
import {
  resolveDomainClassificationPacketCrosswalkV1,
  type DomainClassificationPacketRowV1,
  type DomainClassificationPacketCrosswalkV1,
} from './domain-classification-packet-crosswalk-v1.js';

export const MAX_DOMAIN_CLASSIFICATION_PACKET_REFS_V1 = 30_000;
export const MAX_DOMAIN_CLASSIFICATION_PACKET_ROWS_V1 = 10_000;

export async function resolveDomainClassificationPacketCrosswalkFromPostgresV1(input: {
  rows: readonly DomainClassificationV1[];
  workspaceRevision: string;
}): Promise<DomainClassificationPacketCrosswalkV1> {
  const rows = input.rows.map((row) => DomainClassificationV1Schema.parse(row));
  const sourceRefs = [...new Set(rows.flatMap((row) => row.evidenceRefs.map((ref) => ref.trim()).filter(Boolean)))];
  if (sourceRefs.length > MAX_DOMAIN_CLASSIFICATION_PACKET_REFS_V1) {
    throw new Error('DOMAIN_CLASSIFICATION_PACKET_SOURCE_REF_LIMIT_EXCEEDED');
  }

  const client = await pool.connect();
  let transactionStarted = false;
  try {
    await client.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
    transactionStarted = true;

    const packetResult = sourceRefs.length
      ? await client.query<DomainClassificationPacketRowV1>(
        `SELECT packet_key, source_ref, source_revision, workspace_revision_key
           FROM public.atlas_packets
          WHERE source_ref = ANY($1::text[])
          ORDER BY source_ref, workspace_revision_key, source_revision, packet_key
          LIMIT $2`,
        [sourceRefs, MAX_DOMAIN_CLASSIFICATION_PACKET_ROWS_V1 + 1],
      )
      : { rows: [] as DomainClassificationPacketRowV1[] };
    if (packetResult.rows.length > MAX_DOMAIN_CLASSIFICATION_PACKET_ROWS_V1) {
      throw new Error('DOMAIN_CLASSIFICATION_PACKET_ROW_LIMIT_EXCEEDED');
    }

    const lookups: PacketKeyResolutionLookups = {
      async storedKeyExists(key) {
        const result = await client.query<{ row_exists: boolean }>(
          'SELECT EXISTS (SELECT 1 FROM public.atlas_packets WHERE packet_key = $1) AS row_exists',
          [key],
        );
        return result.rows[0]?.row_exists === true;
      },
      async aliasByKey(aliasKey) {
        const result = await client.query<{ canonical_packet_key: string; alias_kind: string }>(
          `SELECT canonical_packet_key, alias_kind
             FROM public.atlas_packet_identity_aliases
            WHERE alias_key = $1
            LIMIT 2`,
          [aliasKey],
        );
        if (result.rows.length > 1) throw new Error('PACKET_IDENTITY_ALIAS_KEY_AMBIGUOUS');
        const row = result.rows[0];
        return row ? { canonicalPacketKey: row.canonical_packet_key, aliasKind: row.alias_kind } : null;
      },
      async aliasesByCanonical(canonicalPacketKey, aliasKind) {
        const result = await client.query<{ alias_key: string }>(
          `SELECT alias_key
             FROM public.atlas_packet_identity_aliases
            WHERE canonical_packet_key = $1 AND alias_kind = $2
            ORDER BY alias_key
            LIMIT 2`,
          [canonicalPacketKey, aliasKind],
        );
        return result.rows.map((row) => row.alias_key);
      },
    };

    const result = await resolveDomainClassificationPacketCrosswalkV1({
      rows,
      packetRows: packetResult.rows,
      workspaceRevision: input.workspaceRevision,
      resolvePacketKey: (packetKey) => resolvePacketKeyResolutionCoreV2(packetKey, lookups),
    });

    await client.query('COMMIT');
    transactionStarted = false;
    return result;
  } catch (error) {
    if (transactionStarted) {
      try {
        await client.query('ROLLBACK');
      } catch {
        // Preserve the originating read/identity error.
      }
    }
    throw error;
  } finally {
    client.release();
  }
}
