#!/usr/bin/env node
/**
 * MICRO-03 populator: builds an AtlasGemmaTeacherReceiptV1 from the already-collected real mxbai/
 * EmbeddingGemma results in docs/reports/rerank-shadow-01-live-fixture-v1.json. Makes NO new
 * network/inference calls — purely reshapes already-real data into the formal receipt contract.
 * Carries candidateIdentityQualified=false forward from the source (that fixture is explicitly
 * not revision-qualified), so distillationEligible must be false with a stated reason.
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const SOURCE = resolve(process.cwd(), 'docs/reports/rerank-shadow-01-live-fixture-v1.json');
const OUTPUT = resolve(process.cwd(), 'docs/reports/atlas-gemma-teacher-receipt-v1.json');

async function main() {
  const source = JSON.parse(await readFile(SOURCE, 'utf8'));
  const observations = [];

  for (const [methodKey, teacherModel] of [
    ['embeddingGemma', 'EMBEDDINGGEMMA_COSINE'],
    ['mxbai', 'MXBAI_RERANK_BASE_V2'],
    ['ornith', 'ORNITH_JUDGE'],
  ]) {
    const runs = source.detail?.[methodKey] ?? [];
    for (const run of runs) {
      const relevantId = null; // not preserved by the source fixture's own schema; left null, not guessed
      run.ranked.forEach((candidateId, rank) => {
        observations.push({
          query: run.query,
          candidateId,
          teacherModel,
          rawScore: 1 / (rank + 1), // the source fixture only preserved rank order, not raw scores, for embeddingGemma/ornith; use reciprocal-rank as the one honestly-derivable proxy score rather than inventing a raw logit
          rank,
          relevantGroundTruth: relevantId,
        });
      });
    }
  }

  const receipt = {
    schema: 'atlas.atlas-gemma-teacher-receipt.v1',
    sourceReport: 'docs/reports/rerank-shadow-01-live-fixture-v1.json',
    generatedAt: source.generatedAt,
    candidateIdentityQualified: Boolean(source.candidateIdentityQualified),
    observations,
    queryCount: source.summary?.[0]?.n ?? 0,
    distillationEligible: false,
    distillationIneligibleReason:
      'candidateIdentityQualified=false in the source fixture (rerank-shadow-01 is a hand-labeled, ' +
      'non-revision-qualified 3-query fixture, not a frozen post-RRF candidate cohort per MICRO-04\'s bar)',
  };

  await mkdir(dirname(OUTPUT), { recursive: true });
  await writeFile(OUTPUT, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ observationCount: observations.length, output: OUTPUT }, null, 2));
}

main().catch((e) => { console.error('FAILED:', e); process.exit(1); });
