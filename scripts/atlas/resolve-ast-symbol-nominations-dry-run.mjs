#!/usr/bin/env node

/** Read-only resolution of AST nominations against the active symbol registry. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const input = path.resolve(root, process.argv.find((arg) => arg.startsWith('--input='))?.slice(8)
  ?? '.tmp/atlas/graphify-file-index-v1/ast-symbol-nominations.jsonl');
const output = path.resolve(root, process.argv.find((arg) => arg.startsWith('--output='))?.slice(9)
  ?? '.tmp/atlas/graphify-file-index-v1/ast-symbol-resolution.jsonl');

const sql = `
SELECT canonical_key, stable_symbol_id, 'canonical' AS source
FROM atlas_symbol_registry WHERE status = 'active'
UNION ALL
SELECT alias_key, stable_symbol_id, 'alias' AS source
FROM atlas_symbol_aliases
ORDER BY canonical_key, stable_symbol_id, source;
`;
const raw = execFileSync('docker', [
  'exec', 'legal-ai-postgres', 'psql', '-U', 'legal_admin', '-d', 'legal_ai_db',
  '-At', '-F', '|', '-c', sql,
], { cwd: root, encoding: 'utf8', timeout: 30000 });

const registry = new Map();
for (const line of raw.split(/\r?\n/).filter(Boolean)) {
  const [key, stableId, source] = line.split('|');
  if (!key || !stableId) continue;
  const values = registry.get(key) ?? [];
  values.push({ stable_symbol_id: stableId, source });
  registry.set(key, values);
}

const inputLines = (await fs.readFile(input, 'utf8')).split(/\r?\n/).filter(Boolean);
const rows = [];
const counts = { canonical: 0, ambiguous: 0, unresolved: 0, invalid: 0 };
for (const line of inputLines) {
  let nomination;
  try { nomination = JSON.parse(line); } catch { counts.invalid += 1; continue; }
  const matches = registry.get(nomination.symbol_key) ?? [];
  const stableIds = [...new Set(matches.map((item) => item.stable_symbol_id))];
  const status = stableIds.length === 1 ? 'CANONICAL' : stableIds.length > 1 ? 'AMBIGUOUS' : 'UNRESOLVED';
  counts[status.toLowerCase()] += 1;
  rows.push({
    schema: 'atlas.ast-symbol-resolution-dry-run-row.v1',
    nomination_id: nomination.nomination_id,
    symbol_key: nomination.symbol_key,
    status,
    stable_symbol_id: stableIds.length === 1 ? stableIds[0] : null,
    candidate_symbol_ids: stableIds,
    resolution_basis: stableIds.length === 1 ? matches[0].source === 'alias' ? 'existing_alias' : 'exact_symbol_key' : 'unresolved',
    registry_revision: 'read-only-live-registry',
    canonical_write: false,
  });
}

await fs.mkdir(path.dirname(output), { recursive: true });
await fs.writeFile(output, rows.map((row) => JSON.stringify(row)).join('\n') + (rows.length ? '\n' : ''), 'utf8');
const report = {
  schema: 'atlas.ast-symbol-resolution-dry-run-receipt.v1',
  status: 'READ_ONLY_COMPLETE',
  input,
  output,
  input_nominations: inputLines.length,
  registry_keys: registry.size,
  ...counts,
  canonical_writes: false,
  database_writes: false,
};
const reportPath = path.join(root, 'docs/reports/ast-symbol-resolution-dry-run-v1.json');
await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(report, null, 2));
