import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  buildBlockedContextualRankerShadowEvalReceiptV1,
  evaluateContextualRankerShadowV1,
  writeContextualRankerShadowEvalReceiptExclusiveV1,
} from '../../sveltekit-frontend/src/lib/server/atlas/recommendations/contextual-ranker-shadow-eval-v1.js';

const runId = process.argv.find((arg) => arg.startsWith('--run-id='))?.slice('--run-id='.length);
const inputPath = process.argv.find((arg) => arg.startsWith('--input='))?.slice('--input='.length);
if (!runId || !inputPath) throw new Error('usage: tsx scripts/atlas/run-contextual-ranker-shadow-eval-v1.mts --run-id=<safe-id> --input=<frozen-bundle.json>');

const root = process.cwd();
let input: Record<string, unknown> = {};
let receipt;
try {
  input = JSON.parse(readFileSync(resolve(root, inputPath), 'utf8')) as Record<string, unknown>;
  receipt = evaluateContextualRankerShadowV1({ runId, ...input } as Parameters<typeof evaluateContextualRankerShadowV1>[0]);
} catch (error) {
  const reason = !input.selection
    ? 'SEARCH_RUNTIME_SELECTION_MISSING'
    : !input.featureAdmission
      ? 'FEATURE_ADMISSION_MISSING'
      : error instanceof Error ? error.message : 'SHADOW_EVAL_INPUT_INVALID';
  receipt = buildBlockedContextualRankerShadowEvalReceiptV1({
    runId,
    reason,
    selection: input.selection,
    ordinalMap: input.ordinalMap,
    featureSnapshot: input.featureSnapshot,
  });
}

const receiptPath = writeContextualRankerShadowEvalReceiptExclusiveV1({ repoRoot: root, receipt });
console.log(JSON.stringify({ status: receipt.status, reason: receipt.reason, receiptPath: receiptPath.replace(`${root}${process.platform === 'win32' ? '\\' : '/'}`, '') }));
