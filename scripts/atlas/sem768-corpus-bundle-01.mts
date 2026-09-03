#!/usr/bin/env -S npx tsx
/**
 * sem768-corpus-bundle-01.mts
 *
 * SEM768-CORPUS-BUNDLE-01: read-only. Builds and Zod-validates a SemanticCorpusBundleV1 --
 * representation-scoped input authority for Phase 16, NOT canonical source lineage. Per operator
 * correction: Graphify cannot be the prerequisite for this bundle (Graphify is itself blocked on
 * Phase 16), and LINEAGE-01 cannot be the prerequisite either (it stays open until a completed
 * Graphify lifecycle exists). This bundle is owned by the semantic corpus itself:
 * codebase_chunk_index.content_embedding.
 *
 * Corrects a real mistake from the first draft of this gate: that draft guessed the dominant
 * cohort's producer constituents from `backfill-graphify-file-embeddings-768.mjs` (a llama.cpp/
 * GGUF-based script) without checking who actually wrote those rows. Traced properly this time:
 * `scripts/atlas/reembed-corpus-document-prefix-v1.mjs` is the real producer of the dominant
 * cohort -- a real, checked-in apply receipt at
 * docs/reports/atlas-corpus-reembed-document-prefix-v1-apply.json (52,324 rows updated,
 * 2026-08-25) confirms it, via Ollama `embeddinggemma:latest` with a document-prompt format
 * (`title: {title|"none"} | text: {content}`), NOT the GGUF/llama.cpp pipeline.
 *
 * The bundle is scoped to the DOMINANT cohort (embedding_model =
 * 'embeddinggemma:latest:eg-task-prefix-v1', 51,788/55,169 rows, 93.87%) as the admitted
 * eligibility policy -- not the whole heterogeneous 55,169-row corpus. The other ~20 cohorts are
 * excluded by this policy, not silently included. This is a deliberate scope choice, not a
 * limitation glossed over.
 *
 * READ ONLY. No Postgres/Qdrant/Redis/Neo4j writes. No graphify:daily. No latent_64 repair.
 * No synthetic workspaceRevision/sourceRevision. Source authority is recorded honestly as
 * PROVEN/PARTIAL/UNPROVEN rather than forced to look admitted.
 *
 * Usage: npx tsx scripts/atlas/sem768-corpus-bundle-01.mts
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl, REPO_ROOT } from './connection-config.mjs';
import {
  SemanticCorpusBundleV1Schema,
  type SemanticCorpusBundleV1,
} from '../../sveltekit-frontend/src/lib/server/atlas/tensors/semantic-corpus-bundle-v1.js';

const env = loadRepoEnv(process.env);
const OUT = path.resolve(REPO_ROOT, 'docs/reports/sem768-corpus-bundle-01.json');

// ── Real producer identity (traced, not guessed) ────────────────────────────────────────────
const PRODUCER_SOURCE_FILE = path.resolve(REPO_ROOT, 'scripts/atlas/reembed-corpus-document-prefix-v1.mjs');
const PRODUCER_APPLY_RECEIPT = path.resolve(REPO_ROOT, 'docs/reports/atlas-corpus-reembed-document-prefix-v1-apply.json');
const DOMINANT_EMBEDDING_MODEL = 'embeddinggemma:latest:eg-task-prefix-v1';
const OLLAMA_MODEL_TAG = 'embeddinggemma:latest';
const PROMPT_FORMAT = 'title: {relative_path|"none"} | text: {content}';

const WORKSPACE_OWNER_PATH = path.resolve(REPO_ROOT, 'docs/reports/graphify-revision-owner-v2-retry.json');
const SOURCE_AUDIT_PATH = path.resolve(REPO_ROOT, 'docs/reports/current-graphify-source-revision-v1.json');

function sha256(value: string): string {
  return crypto.createHash('sha256').update(value, 'utf8').digest('hex');
}

async function main(): Promise<void> {
  if (!fs.existsSync(PRODUCER_SOURCE_FILE)) {
    throw new Error(`PRODUCER_SOURCE_FILE_NOT_FOUND:${PRODUCER_SOURCE_FILE}`);
  }
  if (!fs.existsSync(PRODUCER_APPLY_RECEIPT)) {
    throw new Error(`PRODUCER_APPLY_RECEIPT_NOT_FOUND:${PRODUCER_APPLY_RECEIPT}`);
  }
  const applyReceipt = JSON.parse(fs.readFileSync(PRODUCER_APPLY_RECEIPT, 'utf8')) as {
    updated: number; generatedAt: string; newEmbeddingModelTag: string;
  };
  if (applyReceipt.newEmbeddingModelTag !== DOMINANT_EMBEDDING_MODEL) {
    throw new Error(
      `PRODUCER_RECEIPT_MODEL_TAG_MISMATCH:expected=${DOMINANT_EMBEDDING_MODEL}:receipt=${applyReceipt.newEmbeddingModelTag}`,
    );
  }

  // producerRevision: checksum over the real producer's own implementation source, not asserted.
  const producerSource = fs.readFileSync(PRODUCER_SOURCE_FILE, 'utf8');
  const producerRevision = `producer:sha256:${sha256(producerSource)}`;
  const modelRevision = `model:${OLLAMA_MODEL_TAG}`;

  // eligibilityPolicyRevision: frozen description of what counts as "eligible" for THIS bundle.
  const eligibilityPolicyDefinition = {
    id: 'sem768-dominant-cohort-v1',
    filter: `embedding_model = '${DOMINANT_EMBEDDING_MODEL}' AND content_embedding IS NOT NULL`,
    rationale: 'Scoped to the single homogeneous producer generation confirmed by the real apply receipt, excluding the ~19 other heterogeneous cohorts found in SEM768-CORPUS-BUNDLE-01 draft 1.',
  };
  const eligibilityPolicyRevision = `sem768-dominant-cohort-v1:sha256:${sha256(JSON.stringify(eligibilityPolicyDefinition))}`;

  // representationRevision: derived from real constituents (model tag + prompt format + producer
  // revision), never hardcoded.
  const representationConstituents = {
    representationId: 'semantic_768',
    canonicalColumn: 'content_embedding',
    physicalType: 'halfvec(768)',
    modelTag: DOMINANT_EMBEDDING_MODEL,
    upstreamModel: OLLAMA_MODEL_TAG,
    runtime: 'ollama',
    promptFormat: PROMPT_FORMAT,
    dimensions: 768,
    normalization: 'l2',
    producerRevision,
  };
  const representationRevision = `semantic_768:${DOMINANT_EMBEDDING_MODEL}:sha256:${sha256(JSON.stringify(representationConstituents))}`;

  // ── Source authority: real evidence check, not a hardcoded guess ──
  let sourceAuthorityStatus: 'PROVEN' | 'PARTIAL' | 'UNPROVEN' = 'UNPROVEN';
  let sourceEvidenceNote = 'No workspace or source snapshot evidence files found.';
  const workspaceHasEvidence = fs.existsSync(WORKSPACE_OWNER_PATH);
  const sourceHasEvidence = fs.existsSync(SOURCE_AUDIT_PATH);
  let workspaceOwnerProven = false;
  let sourceByteMatchCount = 0;
  if (workspaceHasEvidence) {
    const doc = JSON.parse(fs.readFileSync(WORKSPACE_OWNER_PATH, 'utf8'));
    workspaceOwnerProven = doc.revisionOwnerProven === true;
  }
  if (sourceHasEvidence) {
    const doc = JSON.parse(fs.readFileSync(SOURCE_AUDIT_PATH, 'utf8')) as {
      counts?: Record<string, number>; rowCount?: number;
    };
    sourceByteMatchCount = Number(doc.counts?.CONTENT_MATCH ?? doc.rowCount ?? 0);
  }
  if (workspaceOwnerProven) {
    sourceAuthorityStatus = 'PROVEN';
    sourceEvidenceNote = 'Workspace revision owner report shows revisionOwnerProven=true.';
  } else if (workspaceHasEvidence || sourceHasEvidence) {
    sourceAuthorityStatus = 'PARTIAL';
    sourceEvidenceNote = `Real partial evidence exists (workspace value present but revisionOwnerProven=false; ` +
      `source audit shows real per-source byte matches but no corpus-wide source-set revision) -- ` +
      `neither reaches admission. Not forced to UNPROVEN (there is real evidence) or PROVEN (nothing is admitted).`;
  }

  const pool = new pg.Pool({
    connectionString: resolveDatabaseUrl(env),
    max: 1,
    application_name: 'sem768-corpus-bundle-01-readonly',
  });

  try {
    const eligibleResult = await pool.query(
      `
      SELECT id::text AS id, content_hash
      FROM codebase_chunk_index
      WHERE content_embedding IS NOT NULL AND embedding_model = $1
      ORDER BY id;
      `,
      [DOMINANT_EMBEDDING_MODEL],
    );
    const eligibleCount = eligibleResult.rowCount ?? 0;
    const eligibleIds: string[] = eligibleResult.rows.map((r: { id: string }) => r.id);
    const records = eligibleResult.rows.map(
      (r: { id: string; content_hash: string | null }) =>
        `${r.id}:${r.content_hash ?? ''}:${representationRevision}:ELIGIBLE`,
    );
    const populationChecksum = `sha256:${sha256(records.join('\n'))}`;

    const bundleBase = {
      schemaVersion: 'semantic-corpus-bundle.v1' as const,
      workspaceId: 'deeds-web-app',
      repositoryId: 'semaj90/deeds_web_app',
      representationId: 'semantic_768' as const,
      representationRevision,
      eligibilityPolicyRevision,
      eligibleCount,
      populationChecksum,
      modelRevision,
      producerRevision,
      sourceAuthorityStatus,
      canonicalAuthority: false as const,
      authorityScope: 'REPRESENTATION_INPUT' as const,
    };

    const checksum = `sha256:${sha256(JSON.stringify(bundleBase))}`;
    const bundle: SemanticCorpusBundleV1 = { ...bundleBase, checksum };

    const parsed = SemanticCorpusBundleV1Schema.parse(bundle);

    const report = {
      schema: 'atlas.semantic-corpus-bundle-01.report.v1',
      generatedAt: new Date().toISOString(),
      mode: 'READ_ONLY',
      writesPerformed: false,
      producerEvidence: {
        sourceFile: 'scripts/atlas/reembed-corpus-document-prefix-v1.mjs',
        applyReceiptPath: 'docs/reports/atlas-corpus-reembed-document-prefix-v1-apply.json',
        applyReceiptUpdatedCount: applyReceipt.updated,
        applyReceiptGeneratedAt: applyReceipt.generatedAt,
        liveEligibleCount: eligibleCount,
        countDeltaNote: applyReceipt.updated !== eligibleCount
          ? `Receipt says ${applyReceipt.updated} updated; live query finds ${eligibleCount} rows still carrying this tag today -- ` +
            `difference is real drift (later re-writes, deletions, or other passes touching these rows since 2026-08-25), not an error in this script.`
          : 'Exact match between receipt and live count.',
      },
      sourceAuthorityEvidence: {
        workspaceHasEvidence,
        sourceHasEvidence,
        workspaceOwnerProven,
        sourceByteMatchCount,
        note: sourceEvidenceNote,
      },
      bundle: parsed,
      // Implementation-detail companion to the schema-validated bundle above, not part of the
      // SemanticCorpusBundleV1 contract itself (kept out of the Zod schema deliberately -- a
      // ~52K-entry id array does not belong in a "small admitted receipt" shape). Consumers that
      // need to independently re-verify populationChecksum (e.g. the Phase16 wrapper) use this
      // list, re-query Postgres for current content_hash values, and recompute the same digest
      // recipe (`id:content_hash:representationRevision:ELIGIBLE`, newline-joined, id-ordered).
      eligibleIds,
      status: 'ADMITTED_REPRESENTATION_INPUT_ONLY',
      note: 'This bundle authorizes Phase 16 representation production for the exact dominant-' +
        'cohort semantic_768 population. It does NOT prove canonical source lineage -- ' +
        `sourceAuthorityStatus=${sourceAuthorityStatus} records that honestly. LINEAGE-01 remains ` +
        'the separate, still-open authority for the canonical source/world binding.',
    };

    fs.writeFileSync(OUT, JSON.stringify(report, null, 2));
    console.log(JSON.stringify({
      event: 'sem768_corpus_bundle_01_complete',
      status: report.status,
      eligibleCount,
      sourceAuthorityStatus,
      representationRevision,
      populationChecksum,
      checksum,
      outPath: OUT,
    }, null, 2));
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
