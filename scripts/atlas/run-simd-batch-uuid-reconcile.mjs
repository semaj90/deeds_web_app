#!/usr/bin/env node
// scripts/atlas/run-simd-batch-uuid-reconcile.mjs
import fs from 'node:fs';
import path from 'node:path';
import { validateAgenticRepairReceipt } from '../validate/enforce-agentic-repair-law.mjs';

const RECEIPT_PATH = path.resolve('.tmp/atlas/agentic-placeholder-swap-receipt.json');
const REHEARSAL_RECEIPT_PATH = path.resolve('.tmp/atlas/okf-concept-tie-v2-rollback-receipt.json');

function runBatchAudit() {
  const results = [];

  for (const target of [RECEIPT_PATH, REHEARSAL_RECEIPT_PATH]) {
    if (fs.existsSync(target)) {
      const check = validateAgenticRepairReceipt(target);
      results.push({
        receiptFile: path.basename(target),
        ...check
      });
    } else {
      results.push({
        receiptFile: path.basename(target),
        valid: false,
        errors: [`Receipt file not found: ${target}`]
      });
    }
  }

  const allValid = results.every((r) => r.valid);

  console.log(JSON.stringify({
    pipeline: 'AGENTIC_BATCH_UUID_AND_OKF_REHEARSAL_GATE',
    allValid,
    receipts: results
  }, null, 2));

  if (!allValid) {
    process.exit(1);
  }
}

runBatchAudit();
