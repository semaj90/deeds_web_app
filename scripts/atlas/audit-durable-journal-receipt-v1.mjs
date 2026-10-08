#!/usr/bin/env node
/** Offline validation of a read-only journal inventory JSON receipt.
 * Never connects to Postgres and never authorizes claim/completion.
 * Usage: node scripts/atlas/audit-durable-journal-receipt-v1.mjs <receipt.json>
 */
import { readFileSync } from 'node:fs';
const REQUIRED_TABLES = ['execution_runs','execution_journal_steps','execution_dependencies','execution_side_effects'];
const FENCING = ['lease_id','lease_expires_at','generation','state_version'];
export function evaluateJournalInventory(input) {
  const errors = [];
  if (!input || input.schema !== 'atlas.durable-journal-readback.v1') errors.push('WRONG_SCHEMA');
  if (input?.readOnly !== true) errors.push('NOT_READ_ONLY');
  const byName = new Map();
  for (const table of Array.isArray(input?.tables) ? input.tables : []) {
    if (typeof table?.name !== 'string' || byName.has(table.name)) errors.push('DUPLICATE_OR_INVALID_TABLE');
    else byName.set(table.name, table);
  }
  for (const name of REQUIRED_TABLES) {
    const table=byName.get(name);
    if (!table?.present) errors.push('MISSING_TABLE:'+name);
    if (!Array.isArray(table?.columns) || table.columns.length === 0) errors.push('MISSING_COLUMNS:'+name);
    if (!Number.isInteger(table?.indexCount) || table.indexCount < 1) errors.push('UNPROVEN_INDEX:'+name);
  }
  const columns = new Set(byName.get('execution_journal_steps')?.columns ?? []);
  for (const column of FENCING) if (!columns.has(column)) errors.push('MISSING_FENCING:'+column);
  if (input?.allTablesPresent !== true) errors.push('TABLES_NOT_PROVEN');
  if (input?.fencingColumnsPresent !== true) errors.push('FENCING_NOT_PROVEN');
  return {
    schema:'atlas.durable-journal-gate.v1',
    status:errors.length ? 'BLOCKED':'SCHEMA_CANDIDATE_ONLY',
    claimActivationAuthorized:false,
    runtimeConcurrencyProven:false,
    errors,
  };
}
if (process.argv[1] && import.meta.url === new URL('file://'+process.argv[1]).href) {
  if (process.argv.length !== 3) { console.error('Usage: node scripts/atlas/audit-durable-journal-receipt-v1.mjs <receipt.json>'); process.exit(2); }
  try {
    const output=evaluateJournalInventory(JSON.parse(readFileSync(process.argv[2],'utf8')));
    console.log(JSON.stringify(output,null,2));
    if (output.status==='BLOCKED') process.exitCode=2;
  } catch(err) { console.error('JOURNAL_RECEIPT_INVALID:'+String(err)); process.exitCode=2; }
}
