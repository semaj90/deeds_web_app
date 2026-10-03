#!/usr/bin/env node
/**
 * SOURCE-REF-CONTRACT-01 step 4 — live inventory of `atlas_packets.source_ref` forms. READ ONLY: one REPEATABLE READ READ ONLY transaction,
 * SELECTs only, always ROLLBACK; no Redis/NATS/Qdrant/Graphify. The inventory exists so the replacement rule is derived from data, not assumed.
 *
 * Three distinct concepts are inventoried side by side and never merged:
 *   source_ref            original producer reference; spelling/case preserved
 *   source_ref_key        normalized comparison key (only if the column exists)
 *   canonical_source_ref  admitted authority-selected reference (lowercased today; NOT the same thing as source_ref)
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const sha = (b: string | Buffer) => `sha256:${crypto.createHash('sha256').update(b).digest('hex')}`;
const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');

// The LEGACY GAN rule, kept only to measure what it rejected. Never used to validate anything.
const LEGACY_REGEX_SQL = String.raw`^[a-z0-9/_\-.]+\.(ts|tsx)$`;

const pool = new pg.Pool({ connectionString: resolveDatabaseUrl(loadRepoEnv(process.env)), max: 1, statement_timeout: 120000 });
const client = await pool.connect();
try {
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  const cols = (await client.query(`SELECT column_name FROM information_schema.columns WHERE table_name = 'atlas_packets' AND column_name IN ('source_ref','source_ref_key','canonical_source_ref')`)).rows.map((r: { column_name: string }) => r.column_name);
  const hasKey = cols.includes('source_ref_key');

  const totals = (await client.query(`
    SELECT count(*)::int AS total,
      count(*) FILTER (WHERE source_ref IS NULL)::int AS null_refs,
      count(*) FILTER (WHERE source_ref IS NOT NULL AND btrim(source_ref) = '')::int AS blank_refs,
      count(*) FILTER (WHERE source_ref ~ '[[:upper:]]')::int AS uppercase_refs,
      count(*) FILTER (WHERE source_ref ~ '\\[[^/]*\\]')::int AS bracket_route_refs,
      count(*) FILTER (WHERE source_ref ~ '\\(.*\\)')::int AS paren_group_refs,
      count(*) FILTER (WHERE source_ref LIKE '%+%')::int AS plus_refs,
      count(*) FILTER (WHERE source_ref ~ '[^ -~]')::int AS non_ascii_or_control_refs,
      count(*) FILTER (WHERE source_ref LIKE '% %')::int AS refs_with_space,
      count(*) FILTER (WHERE source_ref LIKE '%..%')::int AS contains_dotdot_text_census_only,
      count(*) FILTER (WHERE source_ref !~ $1)::int AS rejected_by_legacy_rule
    FROM atlas_packets`, [LEGACY_REGEX_SQL])).rows[0];

  const forms = (await client.query(`
    SELECT form, count(*)::int AS n FROM (
      SELECT CASE
        WHEN source_ref IS NULL THEN 'NULL'
        WHEN btrim(source_ref) = '' THEN 'BLANK'
        WHEN source_ref <> btrim(source_ref) THEN 'LEADING_OR_TRAILING_WHITESPACE'
        WHEN source_ref ~ '[[:cntrl:]]' THEN 'CONTROL_CHARACTER'
        WHEN strpos(source_ref, chr(92)) > 0 THEN 'BACKSLASH'
        WHEN source_ref LIKE '/%' THEN 'ABSOLUTE_UNIX'
        WHEN source_ref ~ '^[A-Za-z]:' THEN 'ABSOLUTE_WINDOWS_DRIVE'
        WHEN source_ref ~ '(^|/)\\.\\.(/|$)' THEN 'DOTDOT_SEGMENT'
        WHEN source_ref ~ '(^|/)\\.(/|$)' THEN 'DOT_SEGMENT'
        WHEN source_ref LIKE '%//%' AND source_ref !~ '^[a-z][a-z0-9+.-]*://' THEN 'DOUBLE_SLASH'
        WHEN source_ref ~ '^[a-z][a-z0-9+.-]*://' THEN 'URL_LIKE'
        WHEN source_ref ~ '^[a-z][a-z0-9+.-]+:' THEN 'SCHEME_NAMESPACE'
        WHEN source_ref LIKE '%/%' THEN 'PATH_WITH_DIRECTORY'
        WHEN source_ref ~ '\\.[A-Za-z0-9]+$' THEN 'ROOT_LEVEL_FILE_WITH_EXTENSION'
        ELSE 'NO_PATH_STRUCTURE' END AS form
      FROM atlas_packets) t GROUP BY form ORDER BY n DESC`)).rows;

  const schemes = (await client.query(`SELECT substring(source_ref from '^([a-z][a-z0-9+.-]+):') AS scheme, count(*)::int AS n FROM atlas_packets WHERE source_ref ~ '^[a-z][a-z0-9+.-]+:' GROUP BY 1 ORDER BY 2 DESC LIMIT 20`)).rows;
  const extensions = (await client.query(`
    SELECT coalesce(lower(substring(source_ref from '\\.([^./]+)$')), '<none>') AS extension, count(*)::int AS n
    FROM atlas_packets WHERE source_ref IS NOT NULL GROUP BY 1 ORDER BY 2 DESC LIMIT 60`)).rows;
  const extensionDistinct = (await client.query(`SELECT count(DISTINCT coalesce(lower(substring(source_ref from '\\.([^./]+)$')), '<none>'))::int AS n FROM atlas_packets WHERE source_ref IS NOT NULL`)).rows[0].n;
  const firstSegments = (await client.query(`SELECT split_part(source_ref, '/', 1) AS segment, count(*)::int AS n FROM atlas_packets WHERE source_ref IS NOT NULL GROUP BY 1 ORDER BY 2 DESC LIMIT 25`)).rows;

  const legacyRejected = (await client.query(`SELECT source_ref, count(*)::int AS n FROM atlas_packets WHERE source_ref IS NOT NULL AND source_ref !~ $1 GROUP BY source_ref ORDER BY source_ref LIMIT 500`, [LEGACY_REGEX_SQL])).rows;

  const roles = (await client.query(`
    SELECT count(*) FILTER (WHERE canonical_source_ref IS NULL)::int AS canonical_null,
      count(*) FILTER (WHERE canonical_source_ref IS NOT NULL AND canonical_source_ref = lower(source_ref))::int AS canonical_equals_lower_source_ref,
      count(*) FILTER (WHERE canonical_source_ref IS NOT NULL AND canonical_source_ref <> lower(source_ref))::int AS canonical_differs_from_lower_source_ref,
      count(*) FILTER (WHERE source_ref ~ '[[:upper:]]' AND canonical_source_ref = source_ref)::int AS uppercase_source_ref_equal_to_canonical
    FROM atlas_packets`)).rows[0];
  const keyRoles = hasKey
    ? (await client.query(`SELECT count(*) FILTER (WHERE source_ref_key IS NULL)::int AS key_null, count(*) FILTER (WHERE source_ref_key = lower(source_ref))::int AS key_equals_lower_source_ref, count(*) FILTER (WHERE source_ref_key IS NOT NULL AND source_ref_key <> lower(source_ref))::int AS key_differs_from_lower_source_ref FROM atlas_packets`)).rows[0]
    : null;
  await client.query('ROLLBACK');

  const outDir = path.join(ROOT, '.tmp/atlas/source-ref-inventory-v1', stamp);
  fs.mkdirSync(outDir, { recursive: true });
  const sampleBody = JSON.stringify(legacyRejected);
  fs.writeFileSync(path.join(outDir, 'legacy-rejected-sample.json'), sampleBody, { flag: 'wx' });

  const receipt = {
    schema: 'atlas.source-ref-inventory.v1', status: 'SOURCE_REF_INVENTORY_LIVE_READ_ONLY', generatedAt: new Date().toISOString(), proofLevel: 'LIVE_READ_ONLY',
    transaction: { isolation: 'REPEATABLE READ', readOnly: true, rolledBack: true },
    columnsPresent: cols, sourceRefKeyColumnExists: hasKey,
    conceptsKeptDistinct: { source_ref: 'original producer reference; spelling/case preserved', source_ref_key: 'normalized comparison key (not authority)', canonical_source_ref: 'admitted authority-selected reference (lowercased today)' },
    totals, forms, schemes, extensions: { distinct: extensionDistinct, top: extensions }, firstSegments, roles, keyRoles,
    legacyRejectedSample: { groupedDistinctInSample: legacyRejected.length, artifact: { path: path.relative(ROOT, path.join(outDir, 'legacy-rejected-sample.json')), sha256: sha(sampleBody) }, first25: legacyRejected.slice(0, 25) },
    canonicalAuthority: false, writesPerformed: false, writes: { postgres: 0, redis: 0, nats: 0, qdrant: 0, valkey: 0, rabbitmq: 0, graphify: 0 },
  };
  const out = path.join(ROOT, 'docs/reports', `source-ref-inventory-v1-${stamp}.json`);
  fs.writeFileSync(out, JSON.stringify(receipt, null, 2), { flag: 'wx' });
  console.log(JSON.stringify({ receipt: path.relative(ROOT, out), totals, forms, schemes, roles, keyRoles, extensionDistinct, topExtensions: extensions.slice(0, 14) }, null, 2));
} finally {
  client.release();
  await pool.end().catch(() => undefined);
}
