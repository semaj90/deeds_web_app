#!/usr/bin/env node
/**
 * RETIRED: temporary diagnostic only; no longer an executable refresh/rehearsal path.
 *
 * The historical receipts under docs/reports/pkt-lineage-refresh-01-*.json are retained as
 * evidence, including the prior APPLY_COMMITTED result. The read-only re-evaluation found that
 * the committed rows satisfy packet/chunk parity but not the admitted-workspace Graphify revision
 * boundary. Do not use those receipts to authorize or repeat a lineage refresh.
 *
 * Use the established freeze owner at scripts/atlas/freeze-pkt-lineage-current-single-chunk-v1.mjs
 * for its supported read-only scope. It currently selects packets with no lineage row and does not
 * re-evaluate stale rows or bind the entire repo:root cohort; those gaps are tracked separately.
 * This retired path intentionally performs no database access, planning, INSERT, UPDATE, DELETE,
 * commit, or rollback.
 */
console.error(JSON.stringify({
  status: 'RETIRED_TEMPORARY_DIAGNOSTIC',
  writesPerformed: false,
  databaseAccess: false,
  reason: 'Custom lineage refresh semantics were retired; consult preserved receipts and the OpenSpec ledger.',
  evidence: [
    'docs/reports/pkt-lineage-refresh-01-rehearsal-v1.json',
    'docs/reports/pkt-lineage-refresh-01-apply-v1.json',
  ],
  nextOwner: 'scripts/atlas/freeze-pkt-lineage-current-single-chunk-v1.mjs',
}, null, 2));
process.exitCode = 2;
