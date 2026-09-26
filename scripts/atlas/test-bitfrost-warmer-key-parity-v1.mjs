#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const warmerPath = path.join(root, 'scripts', 'atlas', 'warm-bitfrost-semantic-cache.mjs');
const builderPath = path.join(root, 'sveltekit-frontend', 'src', 'lib', 'server', 'cache-keys.ts');
const warmer = fs.readFileSync(warmerPath, 'utf8');
const builder = fs.readFileSync(builderPath, 'utf8');

const checks = [
  ['WARM_KEY_01', warmer.includes('`bifrost:warm:v1:packet:${packetKey}`'), builder.includes('`bifrost:sem:packet:${packetKey}`')],
  ['WARM_KEY_02', warmer.includes('`bifrost:warm:v1:feature:${featureId}`'), builder.includes('`bifrost:sem:feature:${featureId}`')],
  ['WARM_VALUE_NAMESPACE_SEPARATED', !warmer.includes('key: `bifrost:sem:packet:${packetKey}`') && !warmer.includes('key: `bifrost:sem:feature:${featureId}`')],
  ['WARM_SOM_SOURCE', warmer.includes("col('som_cell_x')") && warmer.includes("col('som_cell_y')")],
  ['WARM_SOM_LEGACY_NOT_ROUTING', !warmer.includes('packetFieldValue(row, \'som_cluster\')') && !warmer.includes('row.som_cluster ??')],
  ['WARM_PACKET_SOURCE', warmer.includes("table_name = 'atlas_packets'")],
  ['WARM_LINEAGE_REQUIRED', warmer.includes("lineageColumns = ['source_revision', 'workspace_revision', 'canonical_source_ref']") && warmer.includes('BITFROST_WARM_SOURCE_LINEAGE_COLUMNS_MISSING')],
  ['WARM_EMPTY_CENTROID_REJECTED', warmer.includes("!/:$/.test(key)")],
];

const failures = checks.filter(([, ...values]) => values.some((value) => !value));
const report = {
  schema: 'atlas.bitfrost-warmer-key-parity.v1',
  status: failures.length === 0 ? 'PROVEN_STATIC_PARITY' : 'FAILED_STATIC_PARITY',
  checks: Object.fromEntries(checks.map(([name, ...values]) => [name, values.every(Boolean)])),
  canonicalAuthority: false,
  writesPerformed: false,
  promotionAuthorized: false,
};
console.log(JSON.stringify(report, null, 2));
if (failures.length > 0) process.exitCode = 1;
