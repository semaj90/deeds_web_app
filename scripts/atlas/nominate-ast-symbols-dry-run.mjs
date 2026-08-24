#!/usr/bin/env node

/**
 * Read-only AST candidate -> symbol nomination compiler.
 * Nominations are inputs to registry resolution; this script never creates
 * stable symbols, symbol versions, aliases, or database rows.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const input = path.resolve(root, process.argv.find((arg) => arg.startsWith('--input='))?.slice(8)
  ?? '.tmp/atlas/graphify-file-index-v1/ast-entities.jsonl');
const output = path.resolve(root, process.argv.find((arg) => arg.startsWith('--output='))?.slice(9)
  ?? '.tmp/atlas/graphify-file-index-v1/ast-symbol-nominations.jsonl');

const hash = (value) => createHash('sha256').update(value).digest('hex');
const normalize = (value) => String(value ?? '').replaceAll('\\', '/').normalize('NFC');
const lines = (await fs.readFile(input, 'utf8')).split(/\r?\n/).filter(Boolean);
const nominations = [];
const seen = new Set();
let invalid = 0;

for (const line of lines) {
  let candidate;
  try {
    candidate = JSON.parse(line);
  } catch {
    invalid += 1;
    continue;
  }
  const sourceRef = normalize(candidate.source_ref);
  const name = String(candidate.symbol_name ?? candidate.name ?? '').normalize('NFC');
  const kind = String(candidate.symbol_kind ?? candidate.entity_kind ?? '').toLowerCase();
  const sourceRevision = String(candidate.source_revision ?? '').trim();
  const startByte = Number(candidate.start_byte);
  const endByte = Number(candidate.end_byte);
  if (!sourceRef || !name || !kind || !sourceRevision || !Number.isInteger(startByte) || !Number.isInteger(endByte) || endByte < startByte) {
    invalid += 1;
    continue;
  }
  const keyMaterial = JSON.stringify({ sourceRef, sourceRevision, kind, name, startByte, endByte });
  const digest = hash(keyMaterial);
  if (seen.has(digest)) continue;
  seen.add(digest);
  const symbolKey = `symbol-key:${digest.slice(0, 40)}`;
  nominations.push({
    schema: 'atlas.structural-symbol-nomination.v1',
    nomination_id: `ast-grep-nomination:${digest.slice(0, 40)}`,
    symbol_key: symbolKey,
    identity_status: 'nominated',
    role: 'definition',
    kind,
    language: String(candidate.language ?? 'unknown'),
    name,
    qualified_name: name,
    container_qualified_name: null,
    source_ref: sourceRef,
    source_revision: sourceRevision,
    workspace_revision: sourceRevision,
    upstream_node_id: String(candidate.tree_node_id ?? `ast-span:${digest.slice(0, 32)}`),
    upstream_symbol_id: null,
    upstream_chunk_id: String(candidate.packet_key ?? `packet:${digest.slice(0, 32)}`),
    byte_start: startByte,
    byte_end: endByte,
    parent_route: [],
    signature_normalized: candidate.signature ? String(candidate.signature) : null,
    declaration_hash: hash(`${sourceRef}\0${sourceRevision}\0${startByte}\0${endByte}\0${candidate.signature ?? candidate.symbol_name}`),
    exported: false,
    export_name: null,
    extractor: 'ast_grep',
    extractor_revision: String(candidate.extractor_revision ?? 'ast-grep-napi-graphify-yaml-v2'),
    canonical_authority: false,
    resolution_status: 'UNRESOLVED',
    stable_symbol_id: null,
    symbol_version_id: null,
  });
}

nominations.sort((a, b) => a.source_ref.localeCompare(b.source_ref) || a.byte_start - b.byte_start || a.nomination_id.localeCompare(b.nomination_id));
await fs.mkdir(path.dirname(output), { recursive: true });
await fs.writeFile(output, nominations.map((row) => JSON.stringify(row)).join('\n') + (nominations.length ? '\n' : ''), 'utf8');

const report = {
  schema: 'atlas.ast-symbol-nomination-dry-run-receipt.v1',
  status: 'DRY_RUN_COMPLETE',
  input,
  output,
  input_candidates: lines.length,
  nominations: nominations.length,
  duplicates_removed: lines.length - invalid - nominations.length,
  invalid_candidates: invalid,
  canonical_symbols_created: 0,
  symbol_versions_created: 0,
  database_writes: false,
  canonical_writes: false,
};
const reportPath = path.join(root, 'docs/reports/ast-symbol-nomination-dry-run-v1.json');
await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(report, null, 2));
