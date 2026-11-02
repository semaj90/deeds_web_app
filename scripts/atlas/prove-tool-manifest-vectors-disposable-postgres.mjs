#!/usr/bin/env node
import postgres from 'postgres';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');

async function main() {
  const repoEnv = loadRepoEnv();
  const baseAdminUrl = resolveDatabaseUrl({ ...repoEnv, DB_NAME: 'postgres', POSTGRES_DB: 'postgres' });
  const adminSql = postgres(baseAdminUrl, { max: 1 });

  const scratchDbName = `tool_manifest_scratch_${Date.now()}`;
  console.log(`[Rehearsal] Creating disposable scratch database: ${scratchDbName}`);
  await adminSql.unsafe(`CREATE DATABASE ${scratchDbName};`);

  const scratchUrl = resolveDatabaseUrl({ ...repoEnv, DB_NAME: scratchDbName, POSTGRES_DB: scratchDbName });
  const scratchSql = postgres(scratchUrl, { max: 1 });

  const receipt = {
    schema: 'atlas.tool-manifest-vectors-rehearsal.v1',
    timestamp: new Date().toISOString(),
    scratchDatabase: scratchDbName,
    checks: {},
  };

  try {
    // 1. Read migration file
    const migrationSqlPath = path.join(ROOT, 'sveltekit-frontend/drizzle/manual/20261101_atlas_tool_manifest_vectors_v1.sql');
    const sqlContent = fs.readFileSync(migrationSqlPath, 'utf8');

    // 2. Execute migration in scratch DB
    await scratchSql.unsafe(sqlContent);
    receipt.checks.migrationApplied = true;

    // 3. Verify table exists
    const [tableCheck] = await scratchSql`
      SELECT to_regclass('public.atlas_tool_manifest_vectors_v1') as tbl;
    `;
    receipt.checks.tableExists = Boolean(tableCheck?.tbl);

    // 4. Verify indexes
    const indexes = await scratchSql`
      SELECT indexname, indexdef
      FROM pg_indexes
      WHERE tablename = 'atlas_tool_manifest_vectors_v1';
    `;
    receipt.checks.indexes = indexes.map(i => i.indexname);

    // 5. Insert test tool vector (768-dim)
    const mockVecA = Array.from({ length: 768 }, (_, i) => Math.sin(i)).join(',');
    const mockVecB = Array.from({ length: 768 }, (_, i) => Math.cos(i)).join(',');

    await scratchSql`
      INSERT INTO public.atlas_tool_manifest_vectors_v1 (
        tool_name, namespace, description, embedding, recipe_revision, schema_checksum, payload
      ) VALUES
      (
        'test.tool_a',
        'test',
        'Test tool A for semantic search',
        ${`[${mockVecA}]`}::vector,
        'rev_1',
        'sha256:abc',
        ${JSON.stringify({ layers: ['read', 'dense'] })}::jsonb
      ),
      (
        'test.tool_b',
        'test',
        'Test tool B for code intel',
        ${`[${mockVecB}]`}::vector,
        'rev_1',
        'sha256:def',
        ${JSON.stringify({ layers: ['graph', 'ast'] })}::jsonb
      );
    `;
    receipt.checks.rowsInserted = 2;

    // 6. Execute cosine similarity query
    const results = await scratchSql`
      SELECT tool_name, namespace, description, (1 - (embedding <=> ${`[${mockVecA}]`}::vector)) as similarity
      FROM public.atlas_tool_manifest_vectors_v1
      ORDER BY embedding <=> ${`[${mockVecA}]`}::vector
      LIMIT 2;
    `;
    receipt.checks.similarityQueryReturned = results.length;
    receipt.checks.topHit = results[0]?.tool_name;
    receipt.checks.topScore = Number(results[0]?.similarity);

    console.log(`[Rehearsal] Success! Top hit: ${results[0]?.tool_name} with similarity: ${results[0]?.similarity}`);
  } finally {
    await scratchSql.end();
    console.log(`[Rehearsal] Dropping scratch database: ${scratchDbName}`);
    await adminSql.unsafe(`DROP DATABASE IF EXISTS ${scratchDbName};`);
    await adminSql.end();
  }

  const outDir = path.join(ROOT, '.tmp', 'atlas');
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, 'tool-manifest-vectors-rehearsal-receipt-v1.json');
  fs.writeFileSync(outPath, JSON.stringify(receipt, null, 2), 'utf8');
  console.log(`[Rehearsal] Receipt written to ${outPath}`);
}

main().catch(err => {
  console.error('[Rehearsal] Error:', err);
  process.exit(1);
});
