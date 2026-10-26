#!/usr/bin/env node
/**
 * Dry-run bridge: validated error signal → repair proposal receipt.
 *
 * Consumes only the receipt written by validate-error-signal-evidence-v1.mjs.
 * It verifies that receipt's digest and read-only status, admits only signals
 * whose verdict permits a proposal, and writes a proposal receipt.
 *
 * It never edits source, never writes to Postgres, never calls a model, and
 * never marks a proposal executable. Execution needs a separate, approved
 * consumer that does not exist yet (the Phase 66 fixer was not found).
 *
 * Usage:
 *   node scripts/atlas/bridge-error-signal-to-repair-proposal-v1.mjs [--in .tmp/atlas/error-signal-evidence-v1.json] [--out .tmp/atlas/error-repair-proposals-v1.json]
 */

import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { REPO_ROOT } from './connection-config.mjs';

const args = process.argv.slice(2);
const getArg = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const inPath = path.resolve(REPO_ROOT, getArg('--in', '.tmp/atlas/error-signal-evidence-v1.json'));
const outPath = path.resolve(REPO_ROOT, getArg('--out', '.tmp/atlas/error-repair-proposals-v1.json'));

const INPUT_SCHEMA = 'atlas.error_signal_evidence.v1';

// Review kinds. Each one is a human-review step, so every admitted proposal maps
// to the agentic action registry's existing AWAIT_OPERATOR action (see
// sveltekit-frontend/src/lib/server/atlas/agentic/agentic-action-registry-v1.ts).
export const REGISTRY_ACTION = 'AWAIT_OPERATOR';
const REVIEW_KINDS = Object.freeze({
  'schema_mismatch|REPRODUCES_NOW': 'VERIFY_MIGRATION_STATE',
  'schema_mismatch|PARTIALLY_REPRODUCED': 'IDENTIFY_OWNING_QUERY',
});

export function verifyReceipt(receipt) {
  if (receipt?.schema !== INPUT_SCHEMA) throw new Error(`unexpected input schema: ${receipt?.schema}`);
  if (receipt.readOnly !== true || receipt.writesPerformed !== 0) {
    throw new Error('input receipt is not a verified read-only receipt');
  }
  const { selfDigest, ...rest } = receipt;
  const recomputed = `sha256:${createHash('sha256').update(JSON.stringify(rest)).digest('hex')}`;
  if (recomputed !== selfDigest) throw new Error('input receipt digest mismatch: refusing to bridge');
  return true;
}

export function proposalFor(row) {
  const reviewKind = REVIEW_KINDS[`${row.errorClass}|${row.verdict}`];
  if (!reviewKind) {
    return {
      signalId: row.id,
      admitted: false,
      reason: `verdict ${row.verdict} does not permit a proposal for ${row.errorClass}`,
    };
  }
  return {
    signalId: row.id,
    admitted: true,
    registryActionId: REGISTRY_ACTION,
    reviewKind,
    errorClass: row.errorClass,
    verdict: row.verdict,
    dryRun: true,
    executionAuthorized: false,
    requiresHumanApproval: true,
    // The validator receipt carries no source revision, so nothing is
    // revision-qualified and nothing can be executed against the tree.
    revisionQualified: false,
    consumer: 'NONE_AVAILABLE',
  };
}

function main() {
  const receipt = JSON.parse(readFileSync(inPath, 'utf8'));
  verifyReceipt(receipt);

  const decisions = receipt.rows.map(proposalFor);
  const proposals = decisions.filter((d) => d.admitted);
  const rejected = decisions.filter((d) => !d.admitted);

  const out = {
    schema: 'atlas.error_repair_proposals.v1',
    generatedAt: new Date().toISOString(),
    inputDigest: receipt.selfDigest,
    dryRun: true,
    writesPerformed: 0,
    sourceEdits: 0,
    executableProposals: 0,
    canonicalAuthority: false,
    admitted: proposals.length,
    rejected: rejected.length,
    proposals,
    rejected_signals: rejected,
    selfDigest: null,
  };
  const body = JSON.stringify({ ...out, selfDigest: undefined });
  out.selfDigest = `sha256:${createHash('sha256').update(body).digest('hex')}`;

  mkdirSync(path.dirname(outPath), { recursive: true });
  writeFileSync(outPath, `${JSON.stringify(out, null, 2)}\n`);

  console.log(`ERROR_REPAIR_PROPOSALS_V1 admitted=${proposals.length} rejected=${rejected.length} executable=0 writes=0 sourceEdits=0`);
  console.log(`receipt=${outPath}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (err) {
    console.error(`ERROR_REPAIR_PROPOSALS_V1 FAILED: ${err.message}`);
    process.exitCode = 1;
  }
}
