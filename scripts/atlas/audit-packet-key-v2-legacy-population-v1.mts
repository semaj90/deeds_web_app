#!/usr/bin/env node
/**
 * Read-only census: derive PacketKeyV2 for the existing atlas_packets population and test the alias model.
 * No writes. Run from sveltekit-frontend/:  npx tsx ../scripts/atlas/audit-packet-key-v2-legacy-population-v1.mts
 */
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl, REPO_ROOT } from './connection-config.mjs';
import { computePacketKeyV2, PacketKeyV2InputError } from '../../sveltekit-frontend/src/lib/server/atlas/identity/packet-key-v2';

const pool = new pg.Pool({ connectionString: resolveDatabaseUrl(loadRepoEnv(process.env)), max: 1, connectionTimeoutMillis: 5000, statement_timeout: 170000 });
const client = await pool.connect();
try {
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  const packets = (await client.query(`
    SELECT p.packet_key, p.source_ref, p.source_kind, m.repos
      FROM public.atlas_packets p
      LEFT JOIN (SELECT source_ref, array_agg(DISTINCT repository_id) AS repos FROM public.graphify_execution_file_membership_v2 GROUP BY source_ref) m
        ON m.source_ref = p.source_ref`)).rows;
  const aliases = (await client.query(`SELECT alias_key, canonical_packet_key, alias_kind FROM public.atlas_packet_identity_aliases`)).rows;
  const aliasMeta = {
    columns: (await client.query(`SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name='atlas_packet_identity_aliases' ORDER BY ordinal_position`)).rows,
    constraints: (await client.query(`SELECT conname, contype, pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conrelid='public.atlas_packet_identity_aliases'::regclass`)).rows,
    indexes: (await client.query(`SELECT indexdef FROM pg_indexes WHERE tablename='atlas_packet_identity_aliases'`)).rows.map((r) => r.indexdef),
    triggers: (await client.query(`SELECT tgname FROM pg_trigger WHERE tgrelid='public.atlas_packet_identity_aliases'::regclass AND NOT tgisinternal`)).rows.map((r) => r.tgname),
    kinds: (await client.query(`SELECT alias_kind, count(*)::integer AS n FROM public.atlas_packet_identity_aliases GROUP BY 1`)).rows,
    inboundForeignKeys: (await client.query(`SELECT conrelid::regclass::text AS from_table, pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE confrelid='public.atlas_packet_identity_aliases'::regclass`)).rows,
  };
  await client.query('ROLLBACK');

  const classes: Record<string, number> = {};
  const bump = (name: string) => { classes[name] = (classes[name] ?? 0) + 1; };
  const byV2 = new Map<string, string[]>();
  const examples: Record<string, string[]> = {};
  const note = (name: string, sample: string) => { (examples[name] ??= []).length < 5 && examples[name].push(sample); };
  for (const row of packets) {
    if (row.source_kind !== null && row.source_kind !== 'codebase_chunk') { bump(`NON_FILE_KIND:${row.source_kind}`); continue; }
    if (!row.repos) { bump('NO_MEMBERSHIP_IN_ANY_EXECUTION'); note('NO_MEMBERSHIP_IN_ANY_EXECUTION', row.source_ref); continue; }
    if (row.repos.length !== 1) { bump('REPOSITORY_SCOPE_AMBIGUOUS'); note('REPOSITORY_SCOPE_AMBIGUOUS', row.source_ref); continue; }
    try {
      const key = computePacketKeyV2({ repositoryScope: row.repos[0], sourceRef: row.source_ref, packetKind: 'SOURCE_FILE' });
      bump('V2_DERIVABLE');
      bump(/^packet:[0-9a-f]{12}$/.test(row.packet_key) ? 'V2_DERIVABLE_STORAGE_V1_12HEX' : row.packet_key.startsWith('ace:packet:') ? 'V2_DERIVABLE_STORAGE_ACE_PREFIX' : 'V2_DERIVABLE_STORAGE_OTHER');
      byV2.set(key, [...(byV2.get(key) ?? []), row.packet_key]);
    } catch (error) {
      bump(error instanceof PacketKeyV2InputError ? `SOURCE_REF_REJECTED:${error.code}` : 'DERIVATION_ERROR');
    }
  }
  const collisions = [...byV2].filter(([, storage]) => storage.length > 1);
  const aliasByKind = Object.fromEntries(aliasMeta.kinds.map((k) => [k.alias_kind, k.n]));
  const receipt = {
    schema: 'atlas.packet-key-v2-legacy-population-census.v1', mode: 'READ_ONLY', writesPerformed: false, generatedAt: new Date().toISOString(),
    atlasPacketsTotal: packets.length,
    classes,
    v2: { derivableRows: classes.V2_DERIVABLE ?? 0, distinctV2Keys: byV2.size, canonicalCollisions: collisions.length, collisionSamples: collisions.slice(0, 10).map(([v2, storage]) => ({ v2, storage })) },
    gate: collisions.length === 0 ? 'NO_PACKET_KEY_CANONICAL_COLLISION' : 'PACKET_KEY_CANONICAL_COLLISION',
    expectedAliasRows: classes.V2_DERIVABLE_STORAGE_V1_12HEX ?? 0,
    aliasCoverage: { v1StorageRowsAliasedByNewKind: classes.V2_DERIVABLE_STORAGE_V1_12HEX ?? 0, acePrefixRowsResolveViaExistingAceAliasThenNewKind: classes.V2_DERIVABLE_STORAGE_ACE_PREFIX ?? 0, otherStorageRows: classes.V2_DERIVABLE_STORAGE_OTHER ?? 0, notInSourceMembershipLegacyOnly: classes.NO_MEMBERSHIP_IN_ANY_EXECUTION ?? 0, nonFileKinds: (classes['NON_FILE_KIND:rpc_method'] ?? 0) + (classes['NON_FILE_KIND:cluster-summary'] ?? 0) },
    unresolvedExamples: examples,
    aliasOwner: {
      table: 'public.atlas_packet_identity_aliases', ownerDdl: 'sveltekit-frontend/drizzle/manual/atlas_packet_identity_aliases.sql',
      resolver: 'sveltekit-frontend/src/lib/server/atlas/identity/packet-identity-resolver.ts::resolveCanonicalPacketKey',
      ...aliasMeta, existingAliasRows: aliases.length, aliasByKind,
      sourceKeyUniqueness: aliasMeta.constraints.some((c) => /PRIMARY KEY \(alias_key\)/.test(c.def)),
      targetKeyUniqueness: false,
      activeInactiveSemantics: 'none (no status/valid-to column)',
      reverseLookup: aliasMeta.indexes.some((d) => /\(canonical_packet_key\)/.test(d)),
      canPointAtKeysNotStoredInAtlasPackets: !aliasMeta.constraints.some((c) => /REFERENCES atlas_packets\(packet_key\)/.test(c.def)),
    },
  };
  fs.writeFileSync(path.join(REPO_ROOT, 'docs/reports/packet-key-v2-legacy-population-census-v1.json'), `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ atlasPacketsTotal: receipt.atlasPacketsTotal, classes, v2: receipt.v2, gate: receipt.gate, alias: { existing: aliases.length, byKind: aliasByKind, canPointAtUnstored: receipt.aliasOwner.canPointAtKeysNotStoredInAtlasPackets, reverseLookup: receipt.aliasOwner.reverseLookup, triggers: aliasMeta.triggers, inboundFks: aliasMeta.inboundForeignKeys } }, null, 2));
} finally {
  client.release();
  await pool.end();
}
