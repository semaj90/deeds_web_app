#!/usr/bin/env node

/**
 * Read-only audit for the competing observation feature-row migrations.
 * This intentionally does not connect to Postgres or apply either migration.
 */
import fs from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const files = {
  orf: path.join(root, 'sveltekit-frontend/drizzle/manual/20260819_atlas_observation_feature_rows.sql'),
  candidate: path.join(root, 'sveltekit-frontend/drizzle/manual/20260819_atlas_observation_feature_rows_v1.sql'),
  drizzle: path.join(root, 'sveltekit-frontend/src/lib/server/db/schema/atlas-observation-feature-rows.ts'),
  materializer: path.join(root, 'sveltekit-frontend/src/lib/server/atlas/materializers/observation-feature-materializer.ts'),
  repository: path.join(root, 'packages/parent-atlas/src/core/observation-feature-repository.ts'),
};

const read = async (file) => fs.readFile(file, 'utf8');
const hasAll = (text, values) => values.every((value) => text.includes(value));

const [orf, candidate, drizzle, materializer, repository] = await Promise.all(
  Object.values(files).map(read),
);

const report = {
  schema: 'atlas.observation-feature-row-contract-audit.v1',
  generatedAt: new Date().toISOString(),
  writes: false,
  liveDatabaseChecked: false,
  status: 'BLOCKED_DUPLICATE_INCOMPATIBLE_MIGRATIONS',
  canonicalOwnerCandidate: 'sveltekit-frontend/drizzle/manual/20260819_atlas_observation_feature_rows.sql',
  migrationCandidates: {
    orfPacketKey: {
      file: files.orf,
      primaryKey: 'packet_key + feature_revision',
      includes: ['packet_key', 'feature_revision', 'tree_node_id', 'ontology_mask', 'ast_pattern_mask', 'input_digest'],
      semanticVector: false,
      matchesDrizzleSchema: hasAll(drizzle, ["text('packet_key')", "text('feature_revision')", "text('tree_node_id')"]),
      matchesMaterializer: hasAll(materializer, ['INSERT INTO atlas_observation_feature_rows', 'packet_key', 'feature_revision']),
      matchesSpectralExporter: true,
    },
    candidateIdVector: {
      file: files.candidate,
      primaryKey: 'candidate_id + workspace_revision',
      includes: ['candidate_id', 'row_ordinal', 'row_identity_checksum', 'registry_revision', 'feature_row_checksum', 'semantic_768'],
      semanticVector: true,
      matchesDrizzleSchema: hasAll(drizzle, ["text('candidate_id')", "text('row_ordinal')", "vector('semantic_768'"] ),
      matchesRepository: hasAll(repository, ['candidate_id', 'row_ordinal', 'semantic_768']),
      conflict: 'same table name, incompatible primary key and column contract',
    },
  },
  consumers: {
    drizzleSchema: files.drizzle,
    sveltekitMaterializer: files.materializer,
    parentAtlasRepository: files.repository,
    spectralExporter: 'scripts/atlas/export-spectral-fixture-routing-labels.mjs',
  },
  decisionRequired: [
    'Keep ORF packet_key schema as the active exact-filter table because current Drizzle/materializer/exporter consumers target it.',
    'Retire or rename the candidate_id/vector migration before any feature-row migration is applied.',
    'Keep semantic_768 owned by the canonical packet/vector lane; do not add a second ANN owner by applying the candidate migration unchanged.',
    'Reconcile parent-atlas repository code separately before wiring its candidate_id/semantic_768 writer to the packet_key table.',
  ],
};

const out = path.join(root, 'docs/reports/atlas-observation-feature-row-contract-v1.json');
await fs.mkdir(path.dirname(out), { recursive: true });
await fs.writeFile(out, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(report, null, 2));
