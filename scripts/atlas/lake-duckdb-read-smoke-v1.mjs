#!/usr/bin/env node
// Read-only: DuckDB (CLI, httpfs) reads the Parquet written by lake-roundtrip-smoke-v1 directly from SeaweedFS S3. Writes nothing.
// Credentials are loaded from sveltekit-frontend/.env and sent to DuckDB over stdin only; they are never printed or put on a command line.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const env = {};
for (const line of fs.readFileSync(path.join(root, 'sveltekit-frontend/.env'), 'utf8').split(/\r?\n/)) {
  const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}
for (const k of ['SEAWEED_ACCESS_KEY', 'SEAWEED_SECRET_KEY']) if (!env[k]) { console.error(`MISSING_ENV ${k}`); process.exit(2); }
const q = (s) => `'${String(s).replace(/'/g, "''")}'`;
const host = (env.SEAWEED_S3_ENDPOINT || 'localhost').replace(/^https?:\/\//, '').replace(/:\d+$/, '');
const endpoint = `${host}:${env.SEAWEED_S3_PORT || '8333'}`;
const glob = 's3://atlas-lake-dev/v1/source_file_inventory/scope=sveltekit-frontend/*/part-*.parquet';
const sql = `
INSTALL httpfs; LOAD httpfs;
CREATE SECRET lake_dev (TYPE S3, KEY_ID ${q(env.SEAWEED_ACCESS_KEY)}, SECRET ${q(env.SEAWEED_SECRET_KEY)}, ENDPOINT ${q(endpoint)}, URL_STYLE 'path', USE_SSL false, REGION ${q(env.SEAWEED_S3_REGION || 'us-east-1')});
.mode json
SELECT count(*) AS files, count(*) FILTER (WHERE extension = '.svelte') AS svelte_files, sum(byte_length) AS total_bytes, count(DISTINCT source_digest) AS distinct_digests, min(snapshot) AS snapshot
FROM read_parquet(${q(glob)}, hive_partitioning = true);
SELECT extension, count(*) AS n FROM read_parquet(${q(glob)}) GROUP BY 1 ORDER BY n DESC LIMIT 5;
`;
const r = spawnSync('duckdb', [':memory:'], { input: sql, encoding: 'utf8', timeout: 90000 });
const scrub = (s) => String(s).split(env.SEAWEED_SECRET_KEY).join('***').split(env.SEAWEED_ACCESS_KEY).join('***');
if (r.status !== 0) { console.error(scrub(r.stderr).slice(0, 600)); process.exit(1); }
console.log(scrub(r.stdout));
