#!/usr/bin/env node
import 'dotenv/config';
import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import {
  ensureExternalDocsHybridShadowCollection,
  probeExternalDocsQdrantCapabilities,
  probeNativeBm25Inference,
} from '../../sveltekit-frontend/src/lib/server/atlas/docs/qdrant-external-docs-hybrid.ts';

const args = new Set(process.argv.slice(2));
const exerciseBm25 = args.has('--exercise-bm25');
const ensureShadow = args.has('--ensure-shadow') || exerciseBm25;
const outputArg = process.argv.slice(2).find((arg) => arg.startsWith('--out='));
const outputPath = resolve(outputArg?.slice('--out='.length) || 'docs/reports/parent-atlas/external-doc-hybrid-capabilities-latest.json');

async function main() {
  const before = await probeExternalDocsQdrantCapabilities({
    producerRevision: 'probe-external-doc-hybrid-runtime-v1',
  });

  let shadowAction: 'SKIPPED' | 'CREATED' | 'EXISTS' = 'SKIPPED';
  if (ensureShadow) {
    shadowAction = await ensureExternalDocsHybridShadowCollection();
  }

  let proof = null;
  if (exerciseBm25) {
    proof = await probeNativeBm25Inference({
      producerRevision: 'probe-external-doc-hybrid-runtime-v1',
    });
  }

  const result = {
    schema: 'atlas.external-doc-hybrid-runtime-probe.v1',
    generated_at: new Date().toISOString(),
    mode: exerciseBm25 ? 'EXERCISE_BM25' : ensureShadow ? 'ENSURE_SHADOW' : 'READ_ONLY',
    current_collection_mutated: false,
    shadow_collection_action: shadowAction,
    before,
    after: proof?.profile ?? (ensureShadow
      ? await probeExternalDocsQdrantCapabilities({ producerRevision: 'probe-external-doc-hybrid-runtime-v1' })
      : before),
    proof_gate: proof?.gate ?? null,
  };

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);

  if (proof?.gate.status === 'BLOCKED') process.exitCode = 2;
}

main().catch((error) => {
  console.error('[external-doc-hybrid-probe]', error);
  process.exitCode = 1;
});
