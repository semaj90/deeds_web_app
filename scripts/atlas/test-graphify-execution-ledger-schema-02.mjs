import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const ledgerPath = path.join(root, 'sveltekit-frontend', 'drizzle', 'manual', '20260903_graphify_execution_ledger_v1.sql');
const pointerPath = path.join(root, 'drizzle', 'manual', '20260903_graphify_execution_identity_v1.sql');
const sql = fs.readFileSync(ledgerPath, 'utf8');
const pointer = fs.readFileSync(pointerPath, 'utf8');

const required = [
  'CREATE TABLE IF NOT EXISTS public.graphify_executions',
  'CREATE TABLE IF NOT EXISTS public.graphify_execution_files',
  'CREATE TABLE IF NOT EXISTS public.graphify_execution_stages',
  'legacy_graphify_run_id',
  'PRIMARY KEY (execution_id, source_ref)',
  "'SOURCE_SELECTION'",
  "'COMPLETED_REUSED'",
  "'ABANDONED'",
  'last_heartbeat_at',
  'completed_at',
];

for (const fragment of required) assert.ok(sql.includes(fragment), `missing ledger contract: ${fragment}`);
assert.equal(/CREATE TABLE|ALTER TABLE|CREATE INDEX/i.test(pointer), false, 'root compatibility pointer must remain non-executable');
assert.equal(/PRIMARY KEY \(execution_id, file_id\)/i.test(sql), false, 'file_id must not own execution membership');
assert.equal(/graphify_execution_receipts/i.test(sql), false, 'obsolete receipt table must not remain');

console.log(JSON.stringify({
  gate: 'GRAPHIFY-EXECUTION-LEDGER-SCHEMA-02',
  status: 'PROVEN_STATIC_CONTRACT',
  ledgerPath: path.relative(root, ledgerPath),
  canonicalTables: ['graphify_executions', 'graphify_execution_files', 'graphify_execution_stages'],
  writesPerformed: false,
}));
