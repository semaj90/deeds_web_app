#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import process from 'node:process';
import pg from 'pg';

const { Pool } = pg;
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const PACKAGE = path.join(ROOT, 'packages', 'parent-atlas');
const APPLY = process.argv.includes('--apply');
const ALLOW_CREATE = process.argv.includes('--allow-create');
const DATABASE_URL = process.env.DATABASE_URL_MIGRATOR || process.env.DATABASE_URL || '';
if (!DATABASE_URL) { console.error('DATABASE_URL_MIGRATOR or DATABASE_URL is required'); process.exit(2); }
if (ALLOW_CREATE && !APPLY) { console.error('--allow-create requires --apply'); process.exit(2); }

function arg(name, fallback) {
  const hit = process.argv.find((item) => item.startsWith(`${name}=`));
  return hit ? hit.slice(name.length + 1) : fallback;
}
function checksum(value) { return createHash('sha256').update(JSON.stringify(value), 'utf8').digest('hex'); }

const schemaNames = arg('--schemas', 'public').split(',').map((v) => v.trim()).filter(Boolean);
const databaseKey = arg('--database-key', 'database:legal_ai_db');
const schemaRevision = arg('--schema-revision', `schema-proof:${Date.now()}`);
const sourceRevision = arg('--source-revision', schemaRevision);
const registryRevision = arg('--registry-revision', schemaRevision);
const producerRevision = arg('--producer-revision', 'schema-proof-r1');

execFileSync(process.execPath, [path.join(ROOT, 'node_modules', 'typescript', 'bin', 'tsc'), '-p', path.join(PACKAGE, 'tsconfig.json')], { stdio: 'inherit', cwd: ROOT });
const atlas = await import(pathToFileURL(path.join(PACKAGE, 'dist', 'index.js')).href);
const pool = new Pool({ connectionString: DATABASE_URL, max: 2 });
const results = [];
try {
  const introspection = await atlas.introspectPostgresSchema(pool, {
    database_key: databaseKey,
    source_ref: `postgres://${databaseKey}/catalog`,
    source_revision: sourceRevision,
    schema_revision: schemaRevision,
    schema_names: schemaNames,
    producer_revision: producerRevision,
  });
  const registry = atlas.createSchemaObjectRegistryRepository(pool);
  for (const nomination of introspection.nominations) {
    let resolution = await registry.resolveNomination({ nomination, registry_revision: registryRevision });
    let created = false;
    let readback = null;
    if (resolution.status === 'unresolved' && APPLY && ALLOW_CREATE) {
      const promoted = await registry.promoteNomination({ nomination, registry_revision: registryRevision, producer_revision: producerRevision, allow_create: true, evidence_refs: [`schema-introspection:${introspection.receipt.output_checksum}`] });
      resolution = promoted.resolution;
      created = true;
      readback = await registry.readback({ stable_schema_object_id: promoted.resolution.stable_schema_object_id, producer_revision: producerRevision });
    } else if (resolution.status === 'canonical') {
      readback = await registry.readback({ stable_schema_object_id: resolution.stable_schema_object_id, producer_revision: producerRevision });
    }
    results.push({ nomination_id: nomination.nomination_id, kind: nomination.kind, qualified_name: nomination.qualified_name, resolution, created, readback });
  }

  const counts = results.reduce((acc, row) => { acc[row.resolution.status] = (acc[row.resolution.status] ?? 0) + 1; if (row.created) acc.created += 1; return acc; }, { canonical: 0, ambiguous: 0, unresolved: 0, created: 0 });
  const receipt = {
    schema: 'atlas.live-schema-introspection-proof.v1',
    generated_at: new Date().toISOString(),
    apply_requested: APPLY,
    allow_create: ALLOW_CREATE,
    introspection: introspection.receipt,
    counts,
    results,
  };
  receipt.checksum = checksum(receipt);
  receipt.status = counts.ambiguous === 0 && (ALLOW_CREATE ? counts.unresolved === 0 : true) ? 'OBSERVED' : 'DEGRADED';
  console.log(JSON.stringify(receipt, null, 2));
  if (receipt.status === 'DEGRADED') process.exitCode = 2;
} finally { await pool.end(); }
