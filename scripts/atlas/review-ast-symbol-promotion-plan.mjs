#!/usr/bin/env node

/** Build a read-only review summary; never assigns or writes canonical identity. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const input = path.resolve(root, process.argv.find((arg) => arg.startsWith('--input='))?.slice(8)
  ?? '.tmp/atlas/graphify-file-index-v1/ast-symbol-nominations.jsonl');
const rows = (await fs.readFile(input, 'utf8')).split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
const countBy = (values) => Object.fromEntries([...values.entries()].sort((a, b) => b[1] - a[1]));
const kinds = new Map();
const languages = new Map();
const sourceGroups = new Map();
const promotionKinds = new Set(['function', 'method', 'class', 'interface', 'type', 'enum']);
const eligibility = new Map();
for (const row of rows) {
  kinds.set(row.kind, (kinds.get(row.kind) ?? 0) + 1);
  const status = promotionKinds.has(row.kind) ? 'PROMOTION_CANDIDATE' : 'REVIEW_REQUIRED_SCOPE_EVIDENCE';
  eligibility.set(status, (eligibility.get(status) ?? 0) + 1);
  languages.set(row.language, (languages.get(row.language) ?? 0) + 1);
  const groupKey = `${row.source_ref}\0${row.kind}\0${row.name}`;
  const group = sourceGroups.get(groupKey) ?? [];
  group.push(row);
  sourceGroups.set(groupKey, group);
}
const duplicateGroups = [...sourceGroups.values()]
  .filter((group) => group.length > 1)
  .map((group) => ({
    source_ref: group[0].source_ref,
    kind: group[0].kind,
    name: group[0].name,
    count: group.length,
    spans: group.map((row) => [row.byte_start, row.byte_end]).sort((a, b) => a[0] - b[0]),
    requires_review: true,
  }))
  .sort((a, b) => b.count - a.count || a.source_ref.localeCompare(b.source_ref));
const report = {
  schema: 'atlas.ast-symbol-promotion-review.v1',
  status: 'REVIEW_ONLY',
  input,
  input_nominations: rows.length,
  languages: countBy(languages),
  kinds: countBy(kinds),
  promotion_eligibility: countBy(eligibility),
  unique_source_kind_name_groups: sourceGroups.size,
  duplicate_source_kind_name_groups: duplicateGroups.length,
  duplicate_groups_sample: duplicateGroups.slice(0, 100),
  proposed_action: 'PROMOTION_CANDIDATES_REQUIRE_REGISTRY_REVIEW; VARIABLES_REQUIRE_SCOPE_EVIDENCE',
  canonical_symbols_created: 0,
  canonical_writes: false,
  database_writes: false,
};
const reportPath = path.join(root, 'docs/reports/ast-symbol-promotion-review-v1.json');
await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(report, null, 2));
