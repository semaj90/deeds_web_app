#!/usr/bin/env node
/**
 * Proposal-only CLI, adjacent to run-agentic-error-fixing-v1.mjs.
 * Usage:
 *   node scripts/atlas/run-agentic-repair-readiness-v1.mjs --smoke
 *   node scripts/atlas/run-agentic-repair-readiness-v1.mjs --input .tmp/atlas/repair-evidence-manifest.json
 *
 * TODO: wire the existing task/evidence crosswalk receipt producer.
 * TODO: add actual first-stage retrieval recall, MRL/latent parity, Ornith citations,
 *       independent answer judging, and gold-isolated LongMemEval evaluation.
 * TODO: do not attach execution or mutation permissions to this diagnostic CLI.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { evaluateRepairEvidenceReadiness, smokeRepairEvidenceReadiness } from './lib/agentic-repair-evidence-readiness-v1.mjs';

const argv=process.argv.slice(2);
const arg=(flag)=>{const i=argv.indexOf(flag);return i<0?null:argv[i+1]??null};
try {
  if (argv.includes('--smoke')) {
    console.log(JSON.stringify(smokeRepairEvidenceReadiness(),null,2));
  } else {
    const input=arg('--input');
    if(!input) throw new Error('MISSING_INPUT: provide --input <existing-receipt-manifest.json> or --smoke');
    const document=JSON.parse(readFileSync(resolve(input),'utf8'));
    const report=evaluateRepairEvidenceReadiness(document);
    console.log(JSON.stringify(report,null,2));
    if(report.status!=='REVIEW_ONLY_OWNER_READBACK_REQUIRED') process.exitCode=2;
  }
} catch(error) {
  console.error(JSON.stringify({status:'BLOCKED', error:String(error?.message??error),canMutate:false,writesPerformed:false,
    todo:'TODO: supply parseable existing evidence receipt manifest; do not invent revisions or evidence'}));
  process.exitCode=1;
}
