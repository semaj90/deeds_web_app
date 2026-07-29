#!/usr/bin/env node
/**
 * Phase 108E Step 6 (superseded):
 * The original BM42 monolith is blocked from apply mode.
 * Use scripts/atlas/sparse/05-backfill-sparse-bounded.mjs instead.
 */

import { loadAtlasEnv } from './load-atlas-env.mjs';

await loadAtlasEnv();

const APPLY = process.argv.includes('--apply');

console.log(JSON.stringify({
  artifact_id: 'phase108e-step6-sparse-bm42-backfill.mjs',
  status: APPLY ? 'SUPERSEDED' : 'REFERENCE_ONLY',
  apply: APPLY,
  superseded_by: 'scripts/atlas/sparse/05-backfill-sparse-bounded.mjs',
  reason: 'Misnamed BM42 hashed-TF script targeted the wrong legacy flow; bounded lexical_v1 pipeline replaces it.',
}, null, 2));

if (APPLY) {
  throw new Error('This script is SUPERSEDED. Use scripts/atlas/sparse/05-backfill-sparse-bounded.mjs');
}
