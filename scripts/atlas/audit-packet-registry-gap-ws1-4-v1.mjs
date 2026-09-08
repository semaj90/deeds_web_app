#!/usr/bin/env node

/** Read-only WS1.4 registry-gap census and writer ownership inventory. */
import pg from 'pg';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const reportPath = join(root, 'docs/reports/atlas-packet-registry-gap-ws1.4.json');
const env = loadRepoEnv(process.env);
Object.assign(process.env, env);
const pool = new pg.Pool({ connectionString: resolveDatabaseUrl(env), max: 1 });

const writers = [
  'scripts/atlas/backfill-packet-registry.mjs',
  'scripts/atlas/week1-packet-registry-backfill.mjs',
  'scripts/atlas/week1-backfill-packet-registry.mjs',
  'scripts/atlas/hyperrag-packet-materializer.mjs',
  'scripts/atlas/materialize-addressable-packets.mjs',
].map((relativePath) => {
  const absolutePath = join(root, relativePath);
  const source = existsSync(absolutePath) ? readFileSync(absolutePath, 'utf8') : '';
  return {
    path: relativePath,
    exists: Boolean(source),
    insertReferences: [...source.matchAll(/INSERT\s+INTO\s+([\w.]+)/gi)].map((match) => match[1]),
    conflictSemantics: [...source.matchAll(/ON\s+CONFLICT[\s\S]{0,120}/gi)].map((match) => match[0].replace(/\s+/g, ' ').trim()).slice(0, 3),
    hasDryRun: /dry[-_ ]run/i.test(source),
    hasApply: /--apply/.test(source),
    sourceTables: [...new Set([...source.matchAll(/(?:FROM|JOIN)\s+([\w.]+)/gi)].map((match) => match[1]))],
    classification: relativePath === 'scripts/atlas/backfill-packet-registry.mjs'
      ? 'UNSAFE_DEFAULT_WRITE_REVIEW_REQUIRED'
      : relativePath === 'scripts/atlas/week1-packet-registry-backfill.mjs'
        ? 'MIXED_SOURCE_BATCH_UPSERT_REVIEW_REQUIRED'
        : relativePath === 'scripts/atlas/week1-backfill-packet-registry.mjs'
          ? 'BROKEN_OR_LEGACY_SOURCE_REVIEW_REQUIRED'
          : relativePath.includes('hyperrag-packet-materializer')
            ? 'PRODUCTION_CAPABLE_MATERIALIZER_REVIEW_REQUIRED'
            : 'UNKNOWN_WRITER_REVIEW_REQUIRED',
  };
});

async function main() {
  const client = await pool.connect();
  try {
    const tables = await client.query(`
      SELECT c.relname AS table_name, to_regclass('public.' || c.relname)::text AS relation
      FROM (VALUES ('atlas_packets'), ('atlas_packet_registry')) AS c(relname)
    `);
    const present = new Set(tables.rows.filter((row) => row.relation).map((row) => row.table_name));
    const columns = async (table) => present.has(table)
      ? new Set((await client.query(`SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=$1`, [table])).rows.map((row) => row.column_name))
      : new Set();
    const packetColumns = await columns('atlas_packets');
    const registryColumns = await columns('atlas_packet_registry');
    const result = {
      atlasPackets: 0,
      registryRows: 0,
      missingRegistry: 0,
      distinctMissingPacketKeys: 0,
      duplicateMissingPacketKeys: 0,
      orphanRegistryRows: 0,
      missingDateRange: null,
      sourceCompleteness: null,
    };
    if (present.has('atlas_packets') && present.has('atlas_packet_registry')) {
      const census = await client.query(`
        WITH missing AS (
          SELECT p.packet_key, p.created_at
          FROM atlas_packets p
          LEFT JOIN atlas_packet_registry r ON r.packet_key = p.packet_key
          WHERE r.packet_key IS NULL
        )
        SELECT count(*)::int AS missing,
               count(DISTINCT packet_key)::int AS distinct_missing,
               (count(*) - count(DISTINCT packet_key))::int AS duplicate_missing,
               min(created_at) AS earliest,
               max(created_at) AS latest
        FROM missing`);
      Object.assign(result, {
        missingRegistry: census.rows[0].missing,
        distinctMissingPacketKeys: census.rows[0].distinct_missing,
        duplicateMissingPacketKeys: census.rows[0].duplicate_missing,
        missingDateRange: { earliest: census.rows[0].earliest, latest: census.rows[0].latest },
      });
      result.atlasPackets = Number((await client.query('SELECT count(*)::int AS count FROM atlas_packets')).rows[0].count);
      result.registryRows = Number((await client.query('SELECT count(*)::int AS count FROM atlas_packet_registry')).rows[0].count);
      result.orphanRegistryRows = Number((await client.query(`SELECT count(*)::int AS count FROM atlas_packet_registry r LEFT JOIN atlas_packets p ON p.packet_key=r.packet_key WHERE p.packet_key IS NULL`)).rows[0].count);
      const fields = ['packet_key', 'source_ref', 'feature_id'].filter((field) => packetColumns.has(field));
      if (fields.length) {
        const counts = await client.query(`SELECT ${fields.map((field) => `count(${field})::int AS ${field}`).join(', ')} FROM atlas_packets`);
        result.sourceCompleteness = counts.rows[0];
      }
    }
    const report = {
      schema: 'atlas.packet-registry-gap-ws1.4.v1',
      generatedAt: new Date().toISOString(),
      mode: 'READ_ONLY',
      writesPerformed: false,
      safeToBackfill: false,
      tables: {
        atlasPacketsPresent: present.has('atlas_packets'),
        registryPresent: present.has('atlas_packet_registry'),
        packetColumns: [...packetColumns].sort(),
        registryColumns: [...registryColumns].sort(),
      },
      census: result,
      writerInventory: writers,
      classification: {
        legacyPreRegistry: 'UNPROVEN',
        writerBypass: 'UNPROVEN',
        failedBackfill: 'UNPROVEN',
        currentWriterBug: 'UNPROVEN',
        unknown: result.missingRegistry,
      },
      canonicalAuthority: 'atlas_packets',
      nextGate: 'WS1.4-WRITER-OWNERSHIP-AND-GAP-CLASSIFICATION',
    };
    mkdirSync(dirname(reportPath), { recursive: true });
    writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    console.log(JSON.stringify({ status: 'READ_ONLY_CENSUS_COMPLETE', ...result, safeToBackfill: false, reportPath: 'docs/reports/atlas-packet-registry-gap-ws1.4.json' }, null, 2));
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(JSON.stringify({ status: 'READ_ONLY_CENSUS_FAILED', error: String(error.message ?? error), writesPerformed: false }, null, 2));
  process.exitCode = 1;
});
