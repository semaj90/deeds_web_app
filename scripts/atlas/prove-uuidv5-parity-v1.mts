#!/usr/bin/env -S npx tsx
/**
 * UUIDV5-PARITY-01 (read-only, no schema/data writes)
 *
 * Proves Node's uuid.v5() and PostgreSQL's uuid-ossp uuid_generate_v5()
 * produce byte-identical results for the same (namespace, name), and that
 * the result is genuinely UUID version 5 (not a version-4-bit-forced
 * approximation, per this session's own two prior mistakes on this exact
 * point). Uses 100 real packet_key values sampled from atlas_packets, not
 * synthetic strings.
 */
import { v5 as uuidv5 } from 'uuid';
import pg from 'pg';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';
import { PACKET_AGGREGATE_NAMESPACE_V1 } from '../../sveltekit-frontend/src/lib/server/atlas/identity/atlas-uuid-namespaces-v1.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const REPORT_PATH = path.join(ROOT, 'docs', 'reports', 'uuidv5-parity-v1.json');

async function main() {
  const env = loadRepoEnv(process.env);
  const pool = new pg.Pool({ connectionString: resolveDatabaseUrl(env), max: 1 });
  const client = await pool.connect();

  const sample = await client.query(
    `SELECT packet_key FROM atlas_packets WHERE packet_key IS NOT NULL ORDER BY packet_key LIMIT 100`,
  );
  const packetKeys = sample.rows.map((r) => r.packet_key);

  const results: Array<{ packetKey: string; nodeUuid: string; pgUuid: string; exactMatch: boolean; pgVersion: number }> = [];
  for (const packetKey of packetKeys) {
    const nodeUuid = uuidv5(packetKey, PACKET_AGGREGATE_NAMESPACE_V1);
    const pgResult = await client.query(
      `SELECT uuid_generate_v5($1::uuid, $2) AS pg_uuid, uuid_extract_version(uuid_generate_v5($1::uuid, $2)) AS pg_version`,
      [PACKET_AGGREGATE_NAMESPACE_V1, packetKey],
    );
    const pgUuid = pgResult.rows[0].pg_uuid;
    const pgVersion = pgResult.rows[0].pg_version;
    results.push({ packetKey, nodeUuid, pgUuid, exactMatch: nodeUuid === pgUuid, pgVersion });
  }

  // Determinism replay: recompute the first 20 again in Node, confirm identical.
  const replayMismatches = packetKeys.slice(0, 20).filter((pk, i) => uuidv5(pk, PACKET_AGGREGATE_NAMESPACE_V1) !== results[i].nodeUuid).length;

  client.release();
  await pool.end();

  const exactMatchCount = results.filter((r) => r.exactMatch).length;
  const version5Count = results.filter((r) => r.pgVersion === 5).length;
  const distinctUuids = new Set(results.map((r) => r.nodeUuid));
  const collisionCount = results.length - distinctUuids.size;

  const report = {
    schema: 'atlas.uuidv5-parity.v1',
    gate: 'UUIDV5-PARITY-01',
    generatedAt: new Date().toISOString(),
    mode: 'READ_ONLY',
    writesPerformed: false,
    namespace: PACKET_AGGREGATE_NAMESPACE_V1,
    sampleSize: results.length,
    exactMatchCount,
    version5Count,
    replayMismatches,
    collisionCount,
    overallResult: exactMatchCount === results.length && version5Count === results.length && replayMismatches === 0 && collisionCount === 0
      ? 'PASS'
      : 'FAIL',
    sampleResults: results.slice(0, 5),
    acceptance: {
      exactMatch: `${exactMatchCount}/${results.length}`,
      version5: `${version5Count}/${results.length}`,
      deterministicReplay: `${20 - replayMismatches}/20`,
      collisionCount,
    },
  };

  fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
  fs.writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({
    status: 'UUIDV5_PARITY_READ_ONLY_COMPLETE',
    overallResult: report.overallResult,
    acceptance: report.acceptance,
    writesPerformed: false,
    reportPath: path.relative(ROOT, REPORT_PATH).replaceAll('\\', '/'),
  }, null, 2));
  process.exitCode = report.overallResult === 'PASS' ? 0 : 1;
}

main().catch((error) => {
  console.error(JSON.stringify({ status: 'UUIDV5_PARITY_FAILED', error: String(error?.stack ?? error), writesPerformed: false }, null, 2));
  process.exitCode = 1;
});
