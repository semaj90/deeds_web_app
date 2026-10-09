import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const read = (relativePath) => readFile(path.join(root, relativePath), 'utf8');

test('lineage migration stays additive, nullable, and explicitly unapplied', async () => {
  const [migration, registryText, drizzleschema, ownerAudit] = await Promise.all([
    read('sveltekit-frontend/drizzle/manual/20261008_atlas_observation_feature_lineage_v1.sql'),
    read('sveltekit-frontend/drizzle/sidecar-migrations.json'),
    read('sveltekit-frontend/src/lib/server/db/schema/atlas-observation-feature-rows.ts'),
    read('scripts/atlas/audit-atlas-migration-owners.mjs'),
  ]);
  const registry = JSON.parse(registryText);
  const entry = registry.sidecars.find(({ file }) => file === 'manual/20261008_atlas_observation_feature_lineage_v1.sql');

  assert.match(migration, /ADD COLUMN IF NOT EXISTS source_revision text/i);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS registry_revision text/i);
  assert.doesNotMatch(migration, /NOT NULL|DEFAULT\s+|UPDATE\s+public\.atlas_observation_feature_rows/i);
  assert.doesNotMatch(migration, /workspace_revision/i);
  assert.equal(entry?.status, 'planned_sidecar');
  assert.equal(entry?.appliedBy, null);
  assert.equal(entry?.appliedAt, null);
  assert.match(drizzleschema, /sourceRevision:\s*text\('source_revision'\)/);
  assert.match(drizzleschema, /registryRevision:\s*text\('registry_revision'\)/);
  assert.match(ownerAudit, /20261008_atlas_observation_feature_lineage_v1\.sql/);
});

test('all existing ORF writers persist and update both lineage revisions', async () => {
  const writers = [
    {
      file: 'scripts/atlas/materialize-observation-feature-rows.mjs',
      sourceBinding: 'projection.sourceRevision',
      registryBinding: 'projection.registryRevision',
      digestBinding: 'projection.inputDigest',
    },
    {
      file: 'sveltekit-frontend/src/lib/server/atlas/materializers/observation-feature-materializer.ts',
      sourceBinding: 'projection.sourceRevision',
      registryBinding: 'projection.registryRevision',
      digestBinding: 'projection.inputDigest',
    },
    {
      file: 'packages/parent-atlas/src/core/observation-feature-repository.ts',
      sourceBinding: 'row.source_revision',
      registryBinding: 'row.registry_revision',
      digestBinding: 'featureRowChecksum',
    },
  ];

  for (const writer of writers) {
    const source = await read(writer.file);
    assert.match(source, /source_revision/);
    assert.match(source, /registry_revision/);
    assert.ok(source.includes(writer.sourceBinding), `${writer.file} binds source revision`);
    assert.ok(source.includes(writer.registryBinding), `${writer.file} binds registry revision`);
    assert.ok(source.includes(writer.digestBinding), `${writer.file} binds feature digest`);
  }
});

test('AST prefill reads packet source_revision without substituting content or workspace hashes', async () => {
  const source = await read('scripts/atlas/run-ast-entity-prefill-yaml.mjs');
  const aggregation = await read('scripts/atlas/aggregate-observation-feature-plan.mjs');
  const compiler = await read('packages/parent-atlas/src/core/observation-feature-compiler.ts');
  const projection = await read('sveltekit-frontend/src/lib/server/atlas/contracts/observation-feature-projection-v1.ts');
  const packetQuery = source.match(/const sql = `SELECT packet_key, source_ref,[\s\S]*?FROM atlas_packets/);

  assert.ok(packetQuery, 'AST packet query exists');
  assert.match(packetQuery[0], /\n\s*source_revision,/);
  assert.doesNotMatch(packetQuery[0], /COALESCE|content_hash|sha256\s*,|workspace_revision.*source_revision/i);
  assert.match(source, /sourceBytesMatchRevisionV1\(sourceBytes, packet\.source_revision\)/);
  assert.match(source, /isSha256SourceRevisionV1\(packet\.source_revision\)/);
  assert.match(source, /revisionQualifiedFiles\s*\+=\s*1/);
  assert.ok(aggregation.includes('return !/^sha256:[a-f0-9]{64}$/.test(revision);'));
  assert.match(compiler, /registry_revision:\s*revision/);
  assert.match(projection, /featureRevision:\s*z\.string\(\)\.min\(1\)/);
  assert.match(projection, /registryRevision:\s*z\.string\(\)\.min\(1\)/);
});
