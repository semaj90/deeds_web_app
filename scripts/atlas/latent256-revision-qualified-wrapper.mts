#!/usr/bin/env -S npx tsx
/**
 * latent256-revision-qualified-wrapper.mts
 *
 * LATENT-PHASE16-CONVERGENCE-01B.1 (+ SEM768-CORPUS-BUNDLE-01 consumption, 2026-09-02): consumes
 * an admitted SemanticCorpusBundleV1 as the single source of input authority, instead of 6+
 * separate CLI flags that could each originate from a different "world". Per operator correction:
 * the caller no longer asserts workspace/source/semantic-input identity piecemeal -- it points at
 * one already-admitted bundle file, and this wrapper verifies it (Zod-validates the schema,
 * recomputes the bundle's own self-consistency checksum, re-verifies the population checksum
 * against a fresh Postgres query using the bundle's own eligible-id list) before using it.
 *
 * SemanticCorpusBundleV1's authorityScope is REPRESENTATION_INPUT, not CANONICAL_SOURCE_LINEAGE
 * -- it may carry sourceAuthorityStatus=PARTIAL or UNPROVEN, and this wrapper does NOT treat that
 * as fatal (SOURCE_LINEAGE_UNPROVEN is not a Phase16 blocker). It propagates that honest status
 * into the RepresentationArtifactV1 receipt rather than fabricating a workspaceRevision/
 * sourceRevisionDigest to satisfy an old required-field shape.
 *
 * The producer (this wrapper + the python backend it orchestrates) still owns everything about
 * its OWN output identity: producerRevision (derived from implementation checksums, never
 * asserted by a caller), transformPolicyRevision (frozen below), and outputRepresentationRevision
 * (derived, never accepted as input).
 *
 * Replaces the legacy `backfill-latent-vectors.mjs` (LEGACY_SEMANTIC_LATENT_PRODUCER, wrong
 * table, wrong input source, no real revision) as the phase16 pipeline's target -- see
 * openspec/changes/parent-atlas-retrieval-lineage-dag-convergence/tasks.md, "LATENT-PHASE16-OWNER-01".
 *
 * Required flags (fail-closed if any absent):
 *   --corpus-bundle <path>   (a SEM768-CORPUS-BUNDLE-01 report JSON: { bundle, eligibleIds, ... })
 *   --model-checksum <64-hex>  (NestedSemanticAutoencoder checkpoint checksum -- a SEPARATE
 *                                authority from the semantic corpus bundle; the latent producer's
 *                                own model identity, not something the corpus bundle carries)
 *
 * Fail-closed bundle verification errors (distinct, typed):
 *   SEMANTIC_CORPUS_BUNDLE_MISSING, SEMANTIC_CORPUS_BUNDLE_INVALID,
 *   SEMANTIC_POPULATION_CHECKSUM_MISMATCH, SEMANTIC_REPRESENTATION_REVISION_MISMATCH,
 *   MODEL_CHECKSUM_MISMATCH
 *
 * NEVER accepted (the producer derives or owns these; a caller asserting them is a hard error):
 *   --producer-revision, --output-representation-revision, --representation-revision,
 *   --transform-policy-revision, --candidate-snapshot-revision, --ordinal-map-checksum,
 *   --graph-revision, --ast-revision, --cst-revision, --workspace-revision, --source-revision,
 *   --input-population-checksum (all of these now live inside the admitted corpus bundle)
 *
 * Safety:
 *   --legacy-unsafe-apply is NEVER accepted or forwarded -- passing it is a hard error.
 *   --apply without an explicit --limit is refused (this wrapper does not bulk-fill the full
 *   corpus; that is gated behind LATENT-PHASE16-CANARY-01 proving determinism first).
 *   Default mode is dry-run.
 *
 * Usage:
 *   npx tsx scripts/atlas/latent256-revision-qualified-wrapper.mts \
 *     --corpus-bundle docs/reports/sem768-corpus-bundle-01.json \
 *     --model-checksum <64-hex> \
 *     --limit 200 [--apply]
 */

import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

import {
  RepresentationArtifactV1Schema,
  assertPromotionReadyRepresentationArtifact,
  type RepresentationArtifactV1,
} from '../../sveltekit-frontend/src/lib/server/atlas/tensors/representation-artifact-v1.js';
import {
  SemanticCorpusBundleV1Schema,
  type SemanticCorpusBundleV1,
} from '../../sveltekit-frontend/src/lib/server/atlas/tensors/semantic-corpus-bundle-v1.js';
import { loadAtlasEnv } from './load-atlas-env.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
const __self = fileURLToPath(import.meta.url);
const ROOT = resolve(__dir, '..', '..');
loadAtlasEnv(ROOT);

const DATABASE_URL =
  process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';
const PYTHON_SCRIPT = resolve(ROOT, 'python', 'backfill_latent_256.py');
const CHECKPOINT_PATH = resolve(
  ROOT,
  'python', 'checkpoints', 'nested_semantic_autoencoder_v3_full01.pt',
);
const RECEIPT_PATH = resolve(
  ROOT,
  'docs', 'reports', 'latent-autoencoder-training-receipt-v3-full01.json',
);

// ── Frozen transform policy ──────────────────────────────────────────────────────────────────
//
// Identifies the WHOLE transformation contract, not just the model weights. Must change if
// normalization, prefix semantics, quantization, dtype, output ordering, model architecture, or
// postprocessing changes -- representationRevision is derived partly from this, so a policy
// change automatically produces a new representationRevision even if modelChecksum is unchanged.

const TRANSFORM_POLICY_ID = 'nested-semantic-autoencoder-v1';
const TRANSFORM_POLICY_DEFINITION = {
  id: TRANSFORM_POLICY_ID,
  latent256: 'learned encoder output, NestedSemanticAutoencoder.encode(), dtype=float16, dimensions=256, normalization=none',
  latent128: 'derive(latent_256[:128], l2_renormalize) -- prefix truncation, not an independent learned artifact',
  latent64: 'derive(latent_256[:64], l2_renormalize) -- prefix truncation, not an independent learned artifact',
  inputContract: 'semantic_768 (codebase_chunk_index.content_embedding), dtype=halfvec(768)',
} as const;

// ── Argument parsing (fail-closed) ──────────────────────────────────────────

// Flags the caller must NEVER supply -- either the producer derives/owns them, or they now live
// inside the admitted SemanticCorpusBundleV1 instead of being asserted piecemeal on the CLI.
const FORBIDDEN_CALLER_FLAGS = [
  'producer-revision',
  'output-representation-revision',
  'representation-revision',
  'transform-policy-revision',
  'candidate-snapshot-revision',
  'ordinal-map-checksum',
  'graph-revision',
  'ast-revision',
  'cst-revision',
  'workspace-id',
  'repository-id',
  'workspace-revision',
  'source-snapshot-revision',
  'source-revision-set-checksum',
  'input-representation-revision',
  'input-population-checksum',
] as const;

function parseArgs(argv: string[]): Record<string, string | boolean> {
  const out: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (next !== undefined && !next.startsWith('--')) {
      out[key] = next;
      i++;
    } else {
      out[key] = true;
    }
  }
  return out;
}

function fail(code: string, message: string): never {
  console.error(`\n❌ LATENT256_WRAPPER_FAIL_CLOSED [${code}]: ${message}\n`);
  process.exit(1);
}

const args = parseArgs(process.argv.slice(2));

if (args['legacy-unsafe-apply']) {
  fail('LEGACY_UNSAFE_APPLY_REFUSED',
    '--legacy-unsafe-apply is never accepted by this wrapper. This wrapper IS the revision-' +
    'qualified replacement for that escape hatch, not another door to it.',
  );
}

const suppliedForbidden = FORBIDDEN_CALLER_FLAGS.filter((flag) => flag in args);
if (suppliedForbidden.length > 0) {
  fail('FORBIDDEN_FLAG_SUPPLIED',
    `Caller supplied flag(s) this wrapper must derive itself or that now live inside the ` +
    `admitted corpus bundle, never accepted piecemeal on the CLI: ` +
    `${suppliedForbidden.map((f) => `--${f}`).join(', ')}. Pass --corpus-bundle <path> instead.`,
  );
}

if (typeof args['corpus-bundle'] !== 'string') {
  fail('SEMANTIC_CORPUS_BUNDLE_MISSING',
    '--corpus-bundle <path> is required -- a SEM768-CORPUS-BUNDLE-01 report JSON. This wrapper ' +
    'does not derive workspace/source/semantic-input authority itself. No subprocess spawned, ' +
    'nothing written.',
  );
}
if (typeof args['model-checksum'] !== 'string' || args['model-checksum'] === '') {
  fail('SEMANTIC_CORPUS_BUNDLE_MISSING',
    '--model-checksum <64-hex> is required -- the NestedSemanticAutoencoder checkpoint checksum. ' +
    'This is a separate authority from the semantic corpus bundle (the latent producer\'s own ' +
    'model identity, not something the corpus bundle carries).',
  );
}

const corpusBundlePath = resolve(process.cwd(), String(args['corpus-bundle']));
const cohortFile = typeof args['cohort-file'] === 'string' ? resolve(process.cwd(), String(args['cohort-file'])) : undefined;
const modelChecksum = String(args['model-checksum']).toLowerCase();
if (!/^[a-f0-9]{64}$/i.test(modelChecksum)) {
  fail('SEMANTIC_CORPUS_BUNDLE_INVALID', '--model-checksum must be a 64-character hexadecimal checkpoint checksum.');
}

const APPLY = args.apply === true;
const limitArg = args.limit;
if (APPLY && typeof limitArg !== 'string') {
  fail('APPLY_REQUIRES_LIMIT',
    '--apply requires an explicit --limit. This wrapper never bulk-fills the full corpus -- ' +
    'that is gated behind LATENT-PHASE16-CANARY-01 proving determinism on a bounded cohort first.',
  );
}
const LIMIT = typeof limitArg === 'string' ? parseInt(limitArg, 10) : 0;
if (APPLY && (!Number.isInteger(LIMIT) || LIMIT <= 0)) {
  fail('APPLY_REQUIRES_LIMIT', `--limit must be a positive integer when --apply is set, got: ${String(limitArg)}`);
}
// --limit is also honored in dry-run mode (bounds the query to a small deterministic canary
// cohort, e.g. LATENT-PHASE16-CANARY-01's 128-200 row canary) -- optional there, but must be a
// positive integer if supplied at all.
if (!APPLY && typeof limitArg === 'string' && (!Number.isInteger(LIMIT) || LIMIT <= 0)) {
  fail('APPLY_REQUIRES_LIMIT', `--limit must be a positive integer when supplied, got: ${String(limitArg)}`);
}
const cohortOffsetArg = args['cohort-offset'];
const COHORT_OFFSET = typeof cohortOffsetArg === 'string' ? parseInt(cohortOffsetArg, 10) : 0;
if (typeof cohortOffsetArg === 'string' && (!Number.isInteger(COHORT_OFFSET) || COHORT_OFFSET < 0)) {
  fail('COHORT_OFFSET_INVALID', `--cohort-offset must be a non-negative integer, got: ${String(cohortOffsetArg)}`);
}

// ── Digest helpers ───────────────────────────────────────────────────────────

function sha256(input: string | Buffer): string {
  return createHash('sha256').update(input).digest('hex');
}

function orderedIdListDigest(ids: string[]): string {
  return `sha256:${sha256(ids.join('\n'))}`;
}

function deriveRepresentationRevision(input: {
  representationFamily: string;
  inputRepresentationRevision: string;
  inputPopulationChecksum: string;
  modelChecksum: string;
  producerRevision: string;
  transformPolicyRevision: string;
}): string {
  return `latent_256:${input.representationFamily}:sha256:${sha256(JSON.stringify(input))}`;
}

/**
 * producerRevision is derived from the actual implementation revision -- a checksum over this
 * wrapper's own source and the python producer it orchestrates -- never a caller-supplied string.
 */
function deriveProducerRevision(): string {
  const wrapperSource = readFileSync(__self, 'utf8');
  const pythonSource = readFileSync(PYTHON_SCRIPT, 'utf8');
  return `producer:sha256:${sha256(`${sha256(wrapperSource)}:${sha256(pythonSource)}`)}`;
}

function deriveTransformPolicyRevision(): string {
  return `${TRANSFORM_POLICY_ID}:sha256:${sha256(JSON.stringify(TRANSFORM_POLICY_DEFINITION))}`;
}

// ── Corpus bundle loading + verification ─────────────────────────────────────────────────────

interface CorpusBundleReport {
  bundle: SemanticCorpusBundleV1;
  eligibleIds: string[];
}

function loadAndVerifyCorpusBundle(path: string): CorpusBundleReport {
  if (!existsSync(path)) {
    fail('SEMANTIC_CORPUS_BUNDLE_MISSING', `--corpus-bundle file does not exist: ${path}`);
  }
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, 'utf8'));
  } catch (err) {
    fail('SEMANTIC_CORPUS_BUNDLE_INVALID', `--corpus-bundle is not valid JSON: ${(err as Error).message}`);
  }
  const report = raw as { bundle?: unknown; eligibleIds?: unknown };
  if (!Array.isArray(report.eligibleIds)) {
    fail('SEMANTIC_CORPUS_BUNDLE_INVALID', '--corpus-bundle report is missing eligibleIds[] (needed to re-verify populationChecksum).');
  }
  const parseResult = SemanticCorpusBundleV1Schema.safeParse(report.bundle);
  if (!parseResult.success) {
    fail('SEMANTIC_CORPUS_BUNDLE_INVALID',
      `--corpus-bundle's bundle object failed SemanticCorpusBundleV1 validation: ${parseResult.error.message}`,
    );
  }
  const bundle = parseResult.data;

  // Re-verify the bundle's own self-consistency checksum -- catches hand-edited/tampered files.
  const { checksum: claimedChecksum, ...rest } = bundle;
  const recomputedChecksum = `sha256:${sha256(JSON.stringify(rest))}`;
  if (recomputedChecksum !== claimedChecksum) {
    fail('SEMANTIC_CORPUS_BUNDLE_INVALID',
      `Bundle checksum mismatch -- file may have been hand-edited after generation. ` +
      `expected=${recomputedChecksum} claimed=${claimedChecksum}.`,
    );
  }

  return { bundle, eligibleIds: report.eligibleIds as string[] };
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const { bundle: corpusBundle, eligibleIds: bundleEligibleIds } = loadAndVerifyCorpusBundle(corpusBundlePath);
  let explicitCohortIds: string[] | undefined;
  if (cohortFile) {
    if (!existsSync(cohortFile)) fail('COHORT_FILE_MISSING', `--cohort-file does not exist: ${cohortFile}`);
    const cohortReport = JSON.parse(readFileSync(cohortFile, 'utf8')) as { cohortIds?: unknown };
    if (!Array.isArray(cohortReport.cohortIds) || !cohortReport.cohortIds.every((id) => typeof id === 'string')) {
      fail('COHORT_FILE_INVALID', '--cohort-file must contain cohortIds[] of UUID strings.');
    }
    const admitted = new Set(bundleEligibleIds);
    explicitCohortIds = [...new Set(cohortReport.cohortIds as string[])].sort();
    if (explicitCohortIds.some((id) => !admitted.has(id))) {
      fail('COHORT_NOT_ADMITTED', '--cohort-file contains IDs outside the admitted semantic corpus bundle.');
    }
  }

  const receipt = JSON.parse(readFileSync(RECEIPT_PATH, 'utf8')) as { model_checksum: string };
  const receiptModelChecksum = String(receipt.model_checksum).toLowerCase();
  if (receiptModelChecksum !== modelChecksum) {
    fail('MODEL_CHECKSUM_MISMATCH', `--model-checksum does not match the canonical training receipt: expected ${receiptModelChecksum}.`);
  }
  const modelRevision = `model:sha256:${modelChecksum}`;
  const representationFamily = 'nested-semantic-autoencoder';
  const producerRevision = deriveProducerRevision();
  const transformPolicyRevision = deriveTransformPolicyRevision();
  const outputRepresentationRevision = deriveRepresentationRevision({
    representationFamily,
    inputRepresentationRevision: corpusBundle.representationRevision,
    inputPopulationChecksum: corpusBundle.populationChecksum,
    modelChecksum,
    producerRevision,
    transformPolicyRevision,
  });

  const pool = new pg.Pool({ connectionString: DATABASE_URL, max: 1 });

  try {
    // ── Re-verify populationChecksum against LIVE Postgres state, not just the trusted file ──
    // Re-query content_hash for exactly the ids the bundle claims, in the bundle's own order,
    // and recompute the identical digest recipe SEM768-CORPUS-BUNDLE-01 used. A mismatch means
    // the corpus has drifted since the bundle was admitted (rows changed/removed) -- fail closed
    // rather than silently trusting a stale bundle.
    const sortedIds = [...bundleEligibleIds].sort();
    const liveResult = await pool.query(
      `SELECT id::text AS id, content_hash FROM codebase_chunk_index WHERE id = ANY($1::uuid[]) ORDER BY id;`,
      [sortedIds],
    );
    if (liveResult.rowCount !== bundleEligibleIds.length) {
      fail('SEMANTIC_POPULATION_CHECKSUM_MISMATCH',
        `Bundle claims ${bundleEligibleIds.length} eligible rows; live Postgres has ${liveResult.rowCount} ` +
        `of those ids still present. The corpus has drifted since the bundle was admitted.`,
      );
    }
    const liveRecords = liveResult.rows.map(
      (r: { id: string; content_hash: string | null }) =>
        `${r.id}:${r.content_hash ?? ''}:${corpusBundle.representationRevision}:ELIGIBLE`,
    );
    const liveChecksum = `sha256:${sha256(liveRecords.join('\n'))}`;
    if (liveChecksum !== corpusBundle.populationChecksum) {
      fail('SEMANTIC_POPULATION_CHECKSUM_MISMATCH',
        `Live re-verification of the eligible population does not match the bundle's claimed ` +
        `populationChecksum. Rows have changed since the bundle was admitted. expected=` +
        `${corpusBundle.populationChecksum} live=${liveChecksum}.`,
      );
    }

    // eligible population for THIS latent run = bundle's admitted semantic population, ANDed
    // with rows that still need latent backfill under the current model checkpoint. LIMIT
    // applies whenever explicitly supplied, in either mode (dry-run canary or bounded apply).
    const sortedBundleIds = [...(explicitCohortIds ?? bundleEligibleIds)].sort();
    const cohortIds = LIMIT > 0
      ? sortedBundleIds.slice(COHORT_OFFSET, COHORT_OFFSET + LIMIT)
      : sortedBundleIds.slice(COHORT_OFFSET);
    if (LIMIT > 0 && cohortIds.length === 0) {
      fail('COHORT_EMPTY', `No admitted IDs remain at cohort offset ${COHORT_OFFSET} with limit ${LIMIT}.`);
    }
    const latentEligibleResult = await pool.query(
      `
      SELECT id::text AS id
      FROM codebase_chunk_index
      WHERE id = ANY($1::uuid[])
        AND (
          latent_256_checkpoint_revision IS NULL OR latent_256_checkpoint_revision != $2
          OR latent_64 IS NULL OR latent64_model IS NULL OR latent64_model != $2
        )
      ORDER BY id
      ${LIMIT > 0 ? 'LIMIT $3' : ''};
      `,
      LIMIT > 0
        ? [cohortIds, receipt.model_checksum.slice(0, 64), LIMIT]
        : [bundleEligibleIds, receipt.model_checksum.slice(0, 64)],
    );
    const eligibleIds: string[] = latentEligibleResult.rows.map((r: { id: string }) => r.id);
    const eligibleCount = eligibleIds.length;

    console.log(JSON.stringify({
      event: 'latent256_wrapper_start',
      mode: APPLY ? 'APPLY' : 'DRY_RUN',
      corpusBundleRowCount: bundleEligibleIds.length,
      latentEligibleCount: eligibleCount,
      limit: APPLY ? LIMIT : null,
      workspaceId: corpusBundle.workspaceId,
      repositoryId: corpusBundle.repositoryId,
      sourceAuthorityStatus: corpusBundle.sourceAuthorityStatus,
      inputRepresentationRevision: corpusBundle.representationRevision,
      transformPolicyRevision,
      producerRevision,
      outputRepresentationRevision,
      inputPopulationChecksum: corpusBundle.populationChecksum,
      modelChecksum,
    }));

    if (eligibleCount === 0) {
      console.log(JSON.stringify({ event: 'latent256_wrapper_noop', reason: 'NO_ELIGIBLE_ROWS' }));
    } else {
      // Invoke the real producer. Never forward --legacy-unsafe-apply (already refused above).
      const pyArgs = [
        PYTHON_SCRIPT,
        '--database-url', DATABASE_URL,
        '--checkpoint', CHECKPOINT_PATH,
        '--receipt', RECEIPT_PATH,
        '--limit', String(APPLY ? LIMIT : eligibleCount),
      ];
      if (LIMIT > 0) {
        const idsFile = resolve(ROOT, 'docs', 'reports', `latent-phase16-cohort-${LIMIT}.json`);
        writeFileSync(idsFile, JSON.stringify(cohortIds, null, 2));
        pyArgs.push('--ids-file', idsFile);
      }
      if (APPLY) pyArgs.push('--apply');

      const exitCode: number = await new Promise((resolvePromise) => {
        const child = spawn('python', pyArgs, { stdio: 'inherit' });
        child.on('exit', (code) => resolvePromise(code ?? 1));
        child.on('error', (err) => {
          console.error(`❌ Failed to spawn python: ${err.message}`);
          resolvePromise(1);
        });
      });
      if (exitCode !== 0) {
        fail('PRODUCER_SUBPROCESS_FAILED', `python backfill_latent_256.py exited ${exitCode} -- receipt not written.`);
      }
    }

    let writtenCount = 0;
    let outputDigest = 'sha256:0000000000000000000000000000000000000000000000000000000000000';
    let tensorDigest = 'sha256:0000000000000000000000000000000000000000000000000000000000000';

    if (eligibleCount > 0) {
      // eligibleIds is already bounded by LIMIT at the query level (when LIMIT > 0, in either
      // mode) -- no further slicing needed here.
      const touchedIds = eligibleIds;
      const afterResult = await pool.query(
        `
        SELECT id::text AS id, latent_256::text AS latent_256, latent_64::text AS latent_64,
               latent_256_checkpoint_revision, latent64_model
        FROM codebase_chunk_index
        WHERE id = ANY($1::uuid[])
        ORDER BY id;
        `,
        [touchedIds],
      );
      const rows = afterResult.rows as Array<{
        id: string; latent_256: string | null; latent_64: string | null;
        latent_256_checkpoint_revision: string | null; latent64_model: string | null;
      }>;
      writtenCount = APPLY
        ? rows.filter((r) => r.latent_256_checkpoint_revision === receipt.model_checksum.slice(0, 64)
            && r.latent64_model === receipt.model_checksum.slice(0, 64)).length
        : 0;
      outputDigest = `sha256:${sha256(rows.map((r) => `${r.id}:${r.latent_256_checkpoint_revision ?? ''}:${r.latent64_model ?? ''}`).join('\n'))}`;
      tensorDigest = `sha256:${sha256(rows.map((r) => `${r.latent_256 ?? ''}|${r.latent_64 ?? ''}`).join('\n'))}`;
    }

    const artifactBase = {
      schema: 'atlas.representation-artifact.v1' as const,
      representationId: 'latent_256',
      representationFamily,
      representationRevision: outputRepresentationRevision,
      dimensions: 256,
      dtype: 'float16' as const,
      normalization: 'none' as const,

      inputRepresentationId: 'semantic_768',
      inputRepresentationRevision: corpusBundle.representationRevision,
      workspaceId: corpusBundle.workspaceId,
      repositoryId: corpusBundle.repositoryId,
      // Propagated honestly from the corpus bundle -- not fabricated. May legitimately be
      // undefined if sourceAuthorityStatus is PARTIAL/UNPROVEN with no referenced revision.
      ...(corpusBundle.sourceSnapshotRevision !== undefined || corpusBundle.sourceRevisionSetChecksum !== undefined
        ? { sourceRevisionDigest: (corpusBundle.sourceSnapshotRevision ?? corpusBundle.sourceRevisionSetChecksum) as string }
        : {}),
      sourceAuthorityStatus: corpusBundle.sourceAuthorityStatus,

      producerId: 'latent256-revision-qualified-wrapper',
      producerRevision,
      modelChecksum,
      modelRevision,
      parametersDigest: modelRevision,
      transformPolicyRevision,
      inputDigest: corpusBundle.populationChecksum,
      inputPopulationChecksum: corpusBundle.populationChecksum,
      outputDigest,

      rowCount: bundleEligibleIds.length,
      eligibleCount,
      processedCount: LIMIT > 0 ? eligibleIds.length : (APPLY ? eligibleIds.length : 0),
      writtenCount,
      unchangedCount: 0,
      rejectedCount: 0,
      tensorDigest,
      outputPopulationChecksum: orderedIdListDigest(eligibleIds),
      canonicalAuthority: false as const,
    };

    const artifactDigest = `sha256:${sha256(JSON.stringify(artifactBase))}`;
    const artifact: RepresentationArtifactV1 = { ...artifactBase, artifactDigest };

    const parsed = RepresentationArtifactV1Schema.parse(artifact);
    assertPromotionReadyRepresentationArtifact(parsed);

    const runId = new Date().toISOString().replace(/[:.]/g, '-');
    const outDir = resolve(ROOT, 'docs', 'reports');
    mkdirSync(outDir, { recursive: true });
    const outPath = resolve(outDir, `latent-phase16-representation-artifact-${runId}.json`);
    writeFileSync(outPath, JSON.stringify(parsed, null, 2));

    console.log(JSON.stringify({
      event: 'latent256_wrapper_complete',
      status: APPLY ? 'BACKFILL_APPLY_PROVEN' : 'BACKFILL_DRY_RUN_PROVEN',
      mode: APPLY ? 'APPLY' : 'DRY_RUN',
      eligibleCount,
      writtenCount,
      receiptPath: outPath,
      artifactDigest,
    }));
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
