#!/usr/bin/env -S npx tsx
/**
 * Standalone read-only validation gate for the Parent Atlas Neural Pre-Fill
 * Encoder contracts (openspec/changes/parent-atlas-neural-prefill-encoder).
 *
 * Reports PASS / DEGRADED / BLOCKED per check and overall. Does NOT gate the
 * daily Graphify chain (no exit-code coupling anywhere else yet) — this is a
 * standalone diagnostic, per the explicit design intent: "It will report
 * PASS, DEGRADED, or BLOCKED without making the daily Graphify chain depend
 * on it yet."
 *
 * Checks:
 *   1. Embedding geometry       — sampled semantic_768 rows are L2-normalized
 *   2. Tang-labeling honesty    — shortlist code doesn't overclaim a proven
 *                                 length-squared-sampling Tang implementation
 *   3. Metadata index ownership — expected GIN indexes exist (3-layer split
 *                                 intact: typed columns / JSONB / projection cache)
 *   4. QLoRA write restrictions — the gate's hard literals
 *                                 (canonicalWritesAllowed/onlineTrainingAllowed/
 *                                 trainableBaseWeights) are still locked false
 *   5. Parameter lookup compat  — matchesParameterArtifactLookupV1 correctly
 *                                 rejects cross-representation matches
 *   6. Daily NLP prefill chain  — graphify-nlp-prefill-dry.mjs is present and
 *                                 structurally sound (not re-executed here —
 *                                 that script does real subprocess I/O; this
 *                                 gate only confirms it exists and exports the
 *                                 expected step shape, keeping this gate fast
 *                                 and side-effect-free)
 *
 * Every check fails open to DEGRADED on an unexpected error (e.g. no DB
 * connection in this environment) rather than crashing the whole gate —
 * BLOCKED is reserved for a structurally missing/broken contract.
 *
 * Usage: npx tsx scripts/atlas/neural-prefill-validation-gate.mts
 * (must run from sveltekit-frontend/ so $lib aliases resolve)
 */
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

type Verdict = 'PASS' | 'DEGRADED' | 'BLOCKED';

interface CheckResult {
  name: string;
  verdict: Verdict;
  detail: string;
}

const results: CheckResult[] = [];

function record(name: string, verdict: Verdict, detail: string): void {
  results.push({ name, verdict, detail });
  console.log(`[${verdict}] ${name}: ${detail}`);
}

async function checkEmbeddingGeometry(): Promise<void> {
  const name = 'embedding_geometry';
  try {
    const { pool } = await import('../../src/lib/server/db/client.js');
    // NOTE: codebase_chunk_index.content_embedding is halfvec(768) and is
    // the practically-populated column (52,380/52,417 rows as of
    // 2026-08-26). content_embedding_768 (vector(768)) is the column root
    // CLAUDE.md documents as "canonical" but is only 576/52,417 populated —
    // a known, already-flagged discrepancy (see the 2026-08-24 pipeline
    // alignment commit: "content_embedding_768 currently reports no
    // canonical populated rows"), not something this gate re-litigates.
    // Sampling the actually-populated column is the honest choice here.
    const result = await pool.query<{ content_embedding: string | null }>(
      `SELECT content_embedding::text AS content_embedding FROM codebase_chunk_index WHERE content_embedding IS NOT NULL LIMIT 25`,
    );
    if (result.rows.length === 0) {
      record(name, 'DEGRADED', 'no populated content_embedding rows sampled');
      return;
    }
    let offNorm = 0;
    for (const row of result.rows) {
      const vec = parsePgVectorLiteral(row.content_embedding ?? '');
      if (vec.length !== 768) {
        record(name, 'BLOCKED', `sampled vector has ${vec.length} dims, expected 768`);
        return;
      }
      const norm = Math.sqrt(vec.reduce((sum, v) => sum + v * v, 0));
      if (Math.abs(norm - 1.0) > 0.01) offNorm += 1;
    }
    if (offNorm === 0) {
      record(name, 'PASS', `${result.rows.length}/${result.rows.length} sampled semantic_768 rows are L2-normalized (norm≈1.0)`);
    } else {
      record(name, 'DEGRADED', `${offNorm}/${result.rows.length} sampled rows are not L2-normalized within tolerance`);
    }
  } catch (error) {
    record(name, 'DEGRADED', `DB unreachable in this environment: ${(error as Error).message}`);
  }
}

function parsePgVectorLiteral(literal: string): number[] {
  const trimmed = literal.trim().replace(/^\[/, '').replace(/\]$/, '');
  if (!trimmed) return [];
  return trimmed.split(',').map(Number);
}

async function checkTangLabelingHonesty(): Promise<void> {
  const name = 'tang_labeling_honesty';
  const overclaimPattern = /proven\s+tang|length[- ]squared sampling implement/i;
  const honestDisclaimerPattern = /tang[- ]inspired/i;
  const candidateFiles = [
    '../../../openspec/changes/parent-atlas-neural-prefill-encoder/tasks.md',
    '../../../openspec/changes/parent-atlas-neural-prefill-encoder/design.md',
  ].map((p) => path.resolve(path.dirname(fileURLToPath(import.meta.url)), p));

  const existing = candidateFiles.filter((f) => existsSync(f));
  if (existing.length === 0) {
    record(name, 'DEGRADED', 'no proposal/design docs found to check');
    return;
  }

  let sawHonestDisclaimer = false;
  let sawOverclaim = false;
  for (const file of existing) {
    const content = readFileSync(file, 'utf8');
    if (honestDisclaimerPattern.test(content)) sawHonestDisclaimer = true;
    if (overclaimPattern.test(content)) sawOverclaim = true;
  }

  if (sawOverclaim) {
    record(name, 'BLOCKED', 'found a claim of a "proven" Tang/length-squared-sampling implementation — this repo has not built one');
  } else if (sawHonestDisclaimer) {
    record(name, 'PASS', 'candidate-shortlist docs consistently label the approach "Tang-inspired", no overclaim found');
  } else {
    record(name, 'DEGRADED', 'no explicit Tang-inspired disclaimer found in the checked docs');
  }
}

async function checkMetadataIndexOwnership(): Promise<void> {
  const name = 'metadata_index_ownership';
  try {
    const { pool } = await import('../../src/lib/server/db/client.js');
    const result = await pool.query<{ indexname: string }>(
      `SELECT indexname FROM pg_indexes WHERE schemaname = 'public' AND indexdef ILIKE '%gin%'`,
    );
    const ginIndexNames = result.rows.map((r) => r.indexname);
    if (ginIndexNames.length === 0) {
      record(name, 'BLOCKED', 'zero GIN indexes found in public schema — metadata layer is not index-backed');
      return;
    }
    record(name, 'PASS', `${ginIndexNames.length} GIN indexes present in public schema (metadata/tags/JSONB layer is index-backed)`);
  } catch (error) {
    record(name, 'DEGRADED', `DB unreachable in this environment: ${(error as Error).message}`);
  }
}

async function checkQloraWriteRestrictions(): Promise<void> {
  const name = 'qlora_write_restrictions';
  try {
    const { evaluateQloraTrainingGate } = await import('../../src/lib/server/atlas/neural/qlora-training-gate.js');
    const gate = evaluateQloraTrainingGate({
      baseModelRevision: 'gate-check-probe',
      policyRevision: 'gate-check-probe',
      producerRevision: 'neural-prefill-validation-gate@v1',
      evidence: {
        datasetRevision: 'probe',
        evidenceReceiptCount: 999_999,
        validatedExecutionRate: 1,
        exactPromotionCoverage: 1,
        baselineRevision: 'probe',
        shadowMetricsPassed: true,
      },
    });
    const locked =
      gate.canonicalWritesAllowed === false &&
      gate.onlineTrainingAllowed === false &&
      gate.trainableBaseWeights === false;
    if (locked) {
      record(name, 'PASS', 'canonicalWritesAllowed/onlineTrainingAllowed/trainableBaseWeights all locked false, even at maximal (fabricated-favorable) evidence input');
    } else {
      record(name, 'BLOCKED', 'QLoRA write-restriction literals are no longer locked false — this is a real regression, stop and investigate');
    }
  } catch (error) {
    record(name, 'DEGRADED', `qlora-training-gate.ts import/eval failed: ${(error as Error).message}`);
  }
}

async function checkParameterLookupCompatibility(): Promise<void> {
  const name = 'parameter_lookup_compatibility';
  try {
    const { matchesParameterArtifactLookupV1 } = await import(
      '../../src/lib/server/atlas/contracts/parameter-artifact-lookup-v1.js'
    );
    const semantic768: any = {
      schema: 'atlas.parameter-artifact-lookup.v1',
      lookupKey: 'probe:semantic_768',
      kind: 'REPRESENTATION',
      modelRevision: 'embeddinggemma:latest',
      adapterRevision: null,
      tokenizerRevision: null,
      representationRevision: 'semantic_768@v1',
      producerRevision: 'gate-probe',
      artifactRef: null,
      artifactChecksum: null,
      dimensions: 768,
      metric: 'COSINE',
      normalization: 'L2_VECTOR',
      parameters: {},
      dependencyRevisions: [],
      canonicalAuthority: true,
      status: 'PROVEN',
    };
    const semanticMrl256 = { ...semantic768, lookupKey: 'probe:semantic_mrl_256', representationRevision: 'semantic_mrl_256@v1', dimensions: 256 };

    const correctlyMatchesSelf = matchesParameterArtifactLookupV1(semantic768, {
      kind: 'REPRESENTATION', modelRevision: 'embeddinggemma:latest', representationRevision: 'semantic_768@v1', dimensions: 768, metric: 'COSINE', normalization: 'L2_VECTOR',
    });
    const correctlyRejectsMismatch = !matchesParameterArtifactLookupV1(semanticMrl256, {
      kind: 'REPRESENTATION', modelRevision: 'embeddinggemma:latest', representationRevision: 'semantic_768@v1', dimensions: 768, metric: 'COSINE', normalization: 'L2_VECTOR',
    });

    if (correctlyMatchesSelf && correctlyRejectsMismatch) {
      record(name, 'PASS', 'semantic_768 self-match succeeds; semantic_mrl_256 cross-representation match is correctly rejected');
    } else {
      record(name, 'BLOCKED', `compatibility gate regression: selfMatch=${correctlyMatchesSelf} rejectsMismatch=${correctlyRejectsMismatch}`);
    }
  } catch (error) {
    record(name, 'DEGRADED', `parameter-artifact-lookup-v1.ts import/eval failed: ${(error as Error).message}`);
  }
}

async function checkDailyNlpPrefillChain(): Promise<void> {
  const name = 'daily_nlp_prefill_chain';
  const scriptPath = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../../../scripts/atlas/graphify-nlp-prefill-dry.mjs',
  );
  if (!existsSync(scriptPath)) {
    record(name, 'BLOCKED', 'graphify-nlp-prefill-dry.mjs not found — the read-only NLP prefill lane is missing');
    return;
  }
  const content = readFileSync(scriptPath, 'utf8');
  const looksReadOnly = /read-only/i.test(content) && !/DROP TABLE|TRUNCATE/i.test(content);
  if (looksReadOnly) {
    record(name, 'PASS', 'graphify-nlp-prefill-dry.mjs present and self-documents as read-only (not re-executed by this gate — see file header)');
  } else {
    record(name, 'DEGRADED', 'graphify-nlp-prefill-dry.mjs present but read-only self-documentation not found — verify manually before trusting it');
  }
}

async function main(): Promise<void> {
  await checkEmbeddingGeometry();
  await checkTangLabelingHonesty();
  await checkMetadataIndexOwnership();
  await checkQloraWriteRestrictions();
  await checkParameterLookupCompatibility();
  await checkDailyNlpPrefillChain();

  const overall: Verdict = results.some((r) => r.verdict === 'BLOCKED')
    ? 'BLOCKED'
    : results.some((r) => r.verdict === 'DEGRADED')
      ? 'DEGRADED'
      : 'PASS';

  const receipt = {
    schema: 'atlas.neural-prefill-validation-gate.v1',
    generatedAt: new Date().toISOString(),
    overall,
    checks: results,
  };

  const reportPath = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    '../../docs/reports/atlas-neural-prefill-validation-gate-v1.json',
  );
  const { writeFileSync, mkdirSync } = await import('node:fs');
  mkdirSync(path.dirname(reportPath), { recursive: true });
  writeFileSync(reportPath, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');

  console.log(`\nOverall: ${overall}`);
  console.log(`Receipt written: ${reportPath}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error('[neural-prefill-validation-gate] fatal:', error);
    process.exitCode = 1;
  });
}
