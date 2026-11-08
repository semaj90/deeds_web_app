#!/usr/bin/env node
// scripts/validate/enforce-agentic-repair-law.mjs
import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';

const REQUIRED_STAGES = [
  '1_VERIFIED_CLAIM',
  '2_KERNEL_DAG_CANDIDATE',
  '3_SCHEMA_LINEAGE_ADMISSION',
  '4_BOUNDED_EXECUTION',
  '5_INDEPENDENT_READBACK'
];

export function validateAgenticRepairReceipt(receiptPath) {
  const raw = fs.readFileSync(receiptPath, 'utf8');
  const receipt = JSON.parse(raw);
  const errors = [];

  // 1. Verify all 5 stages of the Canonical Law are recorded
  for (const stage of REQUIRED_STAGES) {
    if (!receipt.stages?.[stage]?.completed) {
      errors.push(`Missing or incomplete governance stage: ${stage}`);
    }
  }

  // 2. Verify OKF profile reconciliation passed before execution
  if (receipt.stages?.['3_SCHEMA_LINEAGE_ADMISSION']?.okfProfile !== 'atlas.okf-reconciliation-by-cause.v1') {
    errors.push('Stage 3 must validate against atlas.okf-reconciliation-by-cause.v1');
  }

  // 3. Verify Zero Live DB / SeaweedFS Overwrites.
  // NOTE: liveDbMutated and seaweedOverwrites are self-reported by the receipt producer. This check
  // validates the claim, not independent evidence; a truthful producer is still assumed.
  if (receipt.liveDbMutated === true || receipt.seaweedOverwrites > 0) {
    errors.push('VIOLATION: Agentic repair receipt indicates live DB mutation or SeaweedFS overwrite');
  }

  // 4. Verify Independent Readback verification exit code was 0
  const stage5 = receipt.stages?.['5_INDEPENDENT_READBACK'];
  if (stage5 && stage5.verificationExitCode !== 0) {
    errors.push('Stage 5 Independent Readback command did not exit with code 0');
  }

  return {
    valid: errors.length === 0,
    receiptSha256: crypto.createHash('sha256').update(raw).digest('hex'),
    errors
  };
}

// CLI Execution support: only when run directly, never when imported (e.g. by the test file).
const targetArg = process.argv[2];
const isDirectRun = process.argv[1] && path.resolve(process.argv[1]).endsWith('enforce-agentic-repair-law.mjs');
if (isDirectRun && targetArg && !targetArg.startsWith('-')) {
  const resolved = path.resolve(process.cwd(), targetArg);
  if (fs.existsSync(resolved)) {
    const result = validateAgenticRepairReceipt(resolved);
    console.log(JSON.stringify(result, null, 2));
    if (!result.valid) {
      process.exit(1);
    }
  } else {
    console.error(`File not found: ${resolved}`);
    process.exit(1);
  }
}
