#!/usr/bin/env node
/**
 * materialize-observation-feature-rows.mjs
 *
 * ORF-2 continuation: takes the read-only aggregated plan
 * (.tmp/atlas/graphify-file-index-v1/observation-feature-projection-plan.jsonl,
 * 1,808 packet-level rows, produced by aggregate-observation-feature-plan.mjs
 * with canonicalWrite:false) and actually calls the real materializer
 * (sveltekit-frontend/src/lib/server/atlas/materializers/observation-feature-materializer.ts
 * ::materializeObservationFeatureProjectionV1, via
 * buildObservationFeatureProjectionV1) to upsert into the live
 * atlas_observation_feature_rows table (applied this session, ORF-2).
 *
 * Deliberately maps ONLY `astObservationKinds` from the plan — those values
 * (`FUNCTION_DECL`, `VARIABLE_DECL`, ...) already match ORF_AST_OBSERVATION_KINDS
 * exactly. `ontologyClasses` is left EMPTY: the plan's `primaryDomains`
 * (`ml`, `agent`, `general`, ...) are domain-classifier labels, not members
 * of the schema's fixed ORF_ONTOLOGY_CLASSES enum (`DATABASE`, `RETRIEVAL`,
 * `API`, ...) — ORF-2Q's own plan output explicitly says "domain,
 * aggregation, and identity review remain required before any apply."
 * Guessing a domain->ontology mapping here would be exactly that
 * unreviewed promotion; this script does not do it. `langextractClasses`
 * is empty for the same reason (this plan has no LangExtract data).
 *
 * Must run from sveltekit-frontend/ via tsx (for the `buildObservationFeatureProjectionV1`
 * import). The DB write does NOT go through the real
 * observation-feature-materializer.ts::materializeObservationFeatureProjectionV1
 * — that imports `$lib/server/db/client.js`, which reads `ENV.DATABASE_URL`
 * via SvelteKit's `$env/dynamic/private`, which is unpopulated outside a
 * real Vite/SvelteKit runtime (confirmed live: `SASL: ... client password
 * must be a string`, i.e. DATABASE_URL resolved empty). Writes the
 * identical SQL directly via `pg.Pool` + `loadAtlasEnv`, the pattern that
 * worked reliably for every other live write this session (NE-07, NE-28,
 * symbol-registry promotion).
 *
 * Usage (run from sveltekit-frontend/):
 *   npx tsx ../scripts/atlas/materialize-observation-feature-rows.mjs                    # dry-run
 *   npx tsx ../scripts/atlas/materialize-observation-feature-rows.mjs --apply --limit=50  # bounded apply
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import {
  buildObservationFeatureProjectionV1,
} from './../../sveltekit-frontend/src/lib/server/atlas/contracts/observation-feature-projection-v1.js';
import { loadAtlasEnv } from './load-atlas-env.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
loadAtlasEnv(ROOT);
const DATABASE_URL = process.env.DATABASE_URL
  || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';
const INPUT = path.resolve(ROOT, '.tmp/atlas/graphify-file-index-v1/observation-feature-projection-plan.jsonl');

async function materializeDirect(pool, projection) {
  const structuralFlags = {
    hasFunction: projection.hasFunction,
    hasCall: projection.hasCall,
    hasDatabaseAccess: projection.hasDatabaseAccess,
    hasNetworkCall: projection.hasNetworkCall,
    hasTest: projection.hasTest,
    hasErrorHandler: projection.hasErrorHandler,
  };
  await pool.query(
    `INSERT INTO atlas_observation_feature_rows (
       packet_key, feature_revision, source_ref, source_version_receipt_id,
       workspace_revision, representation_id, representation_revision, tree_node_id,
       ontology_classes, ast_observation_kinds, langextract_classes, flattened_tags,
       ontology_mask, ast_pattern_mask, structural_flags, evidence_refs,
       kmeans_cluster_id, som_row, som_col, community_id,
       producer_revision, input_digest, updated_at
     ) VALUES (
       $1,$2,$3,$4,$5,$6,$7,$8,
       $9::text[],$10::text[],$11::text[],$12::text[],
       $13::jsonb,$14::jsonb,$15::jsonb,$16::text[],
       $17,$18,$19,$20,$21,$22,now()
     )
     ON CONFLICT (packet_key, feature_revision) DO UPDATE SET
       source_ref = EXCLUDED.source_ref,
       source_version_receipt_id = EXCLUDED.source_version_receipt_id,
       workspace_revision = EXCLUDED.workspace_revision,
       representation_id = EXCLUDED.representation_id,
       representation_revision = EXCLUDED.representation_revision,
       tree_node_id = EXCLUDED.tree_node_id,
       ontology_classes = EXCLUDED.ontology_classes,
       ast_observation_kinds = EXCLUDED.ast_observation_kinds,
       langextract_classes = EXCLUDED.langextract_classes,
       flattened_tags = EXCLUDED.flattened_tags,
       ontology_mask = EXCLUDED.ontology_mask,
       ast_pattern_mask = EXCLUDED.ast_pattern_mask,
       structural_flags = EXCLUDED.structural_flags,
       evidence_refs = EXCLUDED.evidence_refs,
       kmeans_cluster_id = EXCLUDED.kmeans_cluster_id,
       som_row = EXCLUDED.som_row,
       som_col = EXCLUDED.som_col,
       community_id = EXCLUDED.community_id,
       producer_revision = EXCLUDED.producer_revision,
       input_digest = EXCLUDED.input_digest,
       updated_at = now()`,
    [
      projection.packetKey, projection.featureRevision, projection.sourceRef,
      projection.sourceVersionReceiptId, null, projection.representationId,
      projection.representationRevision, projection.treeNodeId,
      projection.ontologyClasses, projection.astObservationKinds,
      projection.langextractClasses, projection.flattenedTags,
      JSON.stringify(projection.ontologyMask), JSON.stringify(projection.astPatternMask),
      JSON.stringify(structuralFlags), projection.evidenceRefs,
      null, null, null, null,
      projection.producerRevision, projection.inputDigest,
    ],
  );
}

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const LIMIT = Number((args.find((a) => a.startsWith('--limit=')) || '').split('=')[1] || 0) || null;
const PRODUCER_REVISION = 'materialize-observation-feature-rows:v1';

async function main() {
  if (APPLY && !LIMIT) {
    console.error('Refusing --apply without --limit=N.');
    process.exit(1);
  }

  const lines = (await fs.readFile(INPUT, 'utf8')).split(/\r?\n/).filter(Boolean);
  const report = {
    schema: 'atlas.observation-feature-row-materialization-report.v1',
    mode: APPLY ? 'APPLY' : 'DRY_RUN',
    input: INPUT,
    limit: LIMIT,
    planRows: lines.length,
    rowsAttempted: 0,
    rowsMaterialized: 0,
    validationErrors: [],
    sample: [],
  };

  const rowsToProcess = APPLY ? lines.slice(0, LIMIT) : lines;
  const pool = APPLY ? new pg.Pool({ connectionString: DATABASE_URL }) : null;

  for (const line of rowsToProcess) {
    const planRow = JSON.parse(line);
    report.rowsAttempted++;
    let projection;
    try {
      projection = buildObservationFeatureProjectionV1({
        packetKey: planRow.packetKey,
        sourceRef: planRow.sourceRef,
        treeNodeId: planRow.treeNodeId ?? null,
        sourceVersionReceiptId: null,
        representationId: null,
        representationRevision: null,
        ontologyClasses: [], // deliberately empty — see file header
        astObservationKinds: planRow.astObservationKinds ?? [],
        langextractClasses: [], // deliberately empty — see file header
        evidenceRefs: [planRow.packetKey],
        featureRevision: planRow.featureRevision,
        producerRevision: PRODUCER_REVISION,
      });
    } catch (err) {
      report.validationErrors.push({ packetKey: planRow.packetKey, error: err.message });
      continue;
    }

    if (report.sample.length < 3) {
      report.sample.push({
        packetKey: projection.packetKey,
        astObservationKinds: projection.astObservationKinds,
        hasFunction: projection.hasFunction,
        hasDatabaseAccess: projection.hasDatabaseAccess,
        inputDigest: projection.inputDigest,
      });
    }

    if (APPLY) {
      await materializeDirect(pool, projection);
      report.rowsMaterialized++;
    }
  }

  if (pool) await pool.end();

  const outDir = path.resolve(ROOT, 'docs/reports');
  await fs.mkdir(outDir, { recursive: true });
  const outPath = path.resolve(outDir, 'observation-feature-row-materialization.json');
  await fs.writeFile(outPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
  console.log(`Report written to ${outPath}`);
}

main().catch((err) => {
  console.error(`fatal: ${err.stack || err.message}`);
  process.exit(1);
});
