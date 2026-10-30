#!/usr/bin/env node
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';
import { packetRegistryBackfillApplyBlocker, parsePacketRegistryBackfillArgs } from './lib/packet-registry-backfill-cli-v1.mjs';

const { Pool } = pg;

async function runDryRun() {
  const env = loadRepoEnv(process.env);
  const pool = new Pool({ connectionString: resolveDatabaseUrl(env), max: 1 });
  const client = await pool.connect();

  try {
    await client.query('BEGIN READ ONLY');
    await client.query("SET LOCAL statement_timeout = '30s'");
    const count = await client.query(`
      SELECT count(*)::text AS candidate_count
      FROM public.atlas_packets ap
      WHERE NOT EXISTS (
        SELECT 1
        FROM public.atlas_packet_registry apr
        WHERE apr.packet_key = ap.packet_key
      )
    `);
    const sample = await client.query(`
      SELECT ap.packet_key
      FROM public.atlas_packets ap
      WHERE NOT EXISTS (
        SELECT 1
        FROM public.atlas_packet_registry apr
        WHERE apr.packet_key = ap.packet_key
      )
      ORDER BY ap.packet_key
      LIMIT 10
    `);
    await client.query('ROLLBACK');
    console.log(JSON.stringify({
      mode: 'dry-run',
      writesPerformed: 0,
      candidateCount: Number(count.rows[0].candidate_count),
      samplePacketKeys: sample.rows.map((row) => row.packet_key),
      applyStatus: 'BLOCKED_UNTIL_CURRENT_PACKETKEYV2_AUTHORITY_IS_ADMITTED',
    }, null, 2));
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch {}
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

async function main(args) {
  let parsed;
  try {
    parsed = parsePacketRegistryBackfillArgs(args);
  } catch (error) {
    console.error(`[Backfill] ${error.message}`);
    console.error('Usage: node scripts/atlas/backfill-packet-registry.mjs [--dry-run | --apply --execution-id=<uuid> --workspace-revision=sha256:<64-hex>]');
    process.exitCode = 2;
    return;
  }

  if (parsed.mode === 'apply') {
    console.error(`[Backfill] APPLY BLOCKED: ${packetRegistryBackfillApplyBlocker()}. No database connection or write was attempted.`);
    process.exitCode = 2;
    return;
  }

  await runDryRun();
}

main(process.argv.slice(2)).catch((error) => {
  console.error('[Backfill] Dry-run failed:', error.message);
  process.exitCode = 1;
});
