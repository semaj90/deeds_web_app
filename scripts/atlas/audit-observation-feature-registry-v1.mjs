import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';
import { buildObservationFeatureRegistryCensusV1 } from './lib/observation-feature-registry-census-v1.mjs';

const require = createRequire(import.meta.url);
const { Pool } = require('pg');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const defaultReport = path.join(root, `.tmp/atlas/observation-feature-registry-census-v1-${new Date().toISOString().replaceAll(':', '').replaceAll('.', '')}.json`);
const outputPath = path.resolve(process.env.ATLAS_ORF_CENSUS_REPORT ?? defaultReport);
const pool = new Pool({ connectionString: resolveDatabaseUrl(loadRepoEnv(process.env)), max: 1, statement_timeout: 10000, application_name: 'atlas-observation-feature-registry-census-v1' });

try {
  const client = await pool.connect();
  let report;
  try {
    await client.query('BEGIN TRANSACTION READ ONLY ISOLATION LEVEL REPEATABLE READ');
    await client.query("SET LOCAL statement_timeout = '10000ms'");
    const columns = await client.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'atlas_observation_feature_rows'
      ORDER BY ordinal_position
    `);
    const schemaColumns = columns.rows.map((row) => row.column_name);
    if (schemaColumns.length === 0) throw new Error('ORF_FEATURE_ROWS_TABLE_MISSING');
    const producerColumns = {
      ast_observation_kinds: 'ast_observation_kinds',
      ontology_classes: 'ontology_classes',
      langextract_classes: 'langextract_classes',
    };
    const presentFields = Object.keys(producerColumns).filter((field) => schemaColumns.includes(field));
    const unionSql = presentFields.map((field) => `
      SELECT '${producerColumns[field]}' AS producer_field, value
        FROM public.atlas_observation_feature_rows
        CROSS JOIN LATERAL unnest(COALESCE(${field}, ARRAY[]::text[])) AS value
    `).join(' UNION ALL ');
    const observedValues = presentFields.length === 0 ? [] : (await client.query(`
      SELECT producer_field, value, count(*)::bigint AS count
      FROM (${unionSql}) AS observations
      WHERE value IS NOT NULL
      GROUP BY producer_field, value
      ORDER BY producer_field, value
    `)).rows.map((row) => ({ producerField: row.producer_field, value: row.value, count: row.count }));
    const population = await client.query('SELECT count(*)::bigint AS total_rows FROM public.atlas_observation_feature_rows');
    report = {
      ...buildObservationFeatureRegistryCensusV1({ observedValues, schemaColumns }),
      generated_at: new Date().toISOString(),
      database_observation: { table: 'public.atlas_observation_feature_rows', total_rows: Number(population.rows[0].total_rows), observed_definition_values: observedValues.length },
      producer_sources: [
        'packages/parent-atlas/src/core/observation-feature-compiler.ts',
        'packages/parent-atlas/src/core/ast-grep-observation-adapter.ts',
        'sveltekit-frontend/src/lib/server/retrieval/adapters/live-structural-lane-provider.ts',
        'scripts/atlas/run-ast-entity-prefill-yaml.mjs',
      ],
    };
  } finally {
    await client.query('ROLLBACK');
    client.release();
  }
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
  console.log(JSON.stringify({ status: report.status, totalRows: report.database_observation.total_rows, observedValues: report.observations.length, reportPath: path.relative(root, outputPath), persistentStoreWritesPerformed: report.persistent_store_writes_performed }, null, 2));
} finally {
  await pool.end();
}
