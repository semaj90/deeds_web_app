#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { tableFromIPC } from 'apache-arrow';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const argv = process.argv.slice(2);
const DEFAULT_FILE = path.join(REPO_ROOT, 'scripts', 'atlas', 'export', 'packets.arrow');
const input = argv.find((arg) => arg.startsWith('--file='))?.slice('--file='.length) ?? DEFAULT_FILE;
const ARROW_FILE = path.resolve(REPO_ROOT, input);
const INDEX_FILE = path.join(path.dirname(ARROW_FILE), `${path.basename(ARROW_FILE, path.extname(ARROW_FILE))}.index.json`);
const REPORT_FILE = path.join(REPO_ROOT, 'docs', 'reports', 'arrow-batch-validation.json');

const REQUIRED_COLUMNS = [
  'packet_key',
  'source_ref',
  'feature_id',
  'feature_label',
  'title_id',
  'tree_node_id',
  'domain_class',
  'dataset_split',
  'semantic_input',
  'semantic_target',
  'used_concepts_json',
  'ast_symbols_json',
  'vector_dim',
  'vector_f32',
  'latent64_blob',
  'som_row',
  'som_col',
];

function scalar(vector, index) {
  const value = vector?.get(index);
  return value == null ? null : value;
}

async function main() {
  const bytes = await fs.readFile(ARROW_FILE);
  const table = tableFromIPC(bytes);
  const names = new Set(table.schema.fields.map((field) => field.name));
  const missingColumns = REQUIRED_COLUMNS.filter((column) => !names.has(column));
  const packetKeys = table.getChild('packet_key');
  const splits = table.getChild('dataset_split');
  const vectorDims = table.getChild('vector_dim');
  const vectors = table.getChild('vector_f32');
  const seen = new Set();
  const duplicateKeys = [];
  const malformedVectors = [];
  const splitCounts = { train: 0, eval: 0, test: 0, invalid: 0 };

  for (let index = 0; index < table.numRows; index += 1) {
    const packetKey = String(scalar(packetKeys, index) ?? '');
    if (seen.has(packetKey)) duplicateKeys.push(packetKey);
    seen.add(packetKey);

    const split = String(scalar(splits, index) ?? 'invalid');
    if (Object.hasOwn(splitCounts, split)) splitCounts[split] += 1;
    else splitCounts.invalid += 1;

    const dim = Number(scalar(vectorDims, index) ?? 0);
    const vector = scalar(vectors, index);
    const byteLength = vector?.byteLength ?? 0;
    if (byteLength !== dim * Float32Array.BYTES_PER_ELEMENT) {
      malformedVectors.push({ packet_key: packetKey, dim, byte_length: byteLength });
    }
  }

  const indexData = JSON.parse(await fs.readFile(INDEX_FILE, 'utf8'));
  const indexCount = Object.keys(indexData.entries ?? {}).length;
  const hardFailures = [];
  if (missingColumns.length) hardFailures.push(`missing columns: ${missingColumns.join(', ')}`);
  if (duplicateKeys.length) hardFailures.push(`duplicate packet keys: ${duplicateKeys.length}`);
  if (malformedVectors.length) hardFailures.push(`malformed vector buffers: ${malformedVectors.length}`);
  if (splitCounts.invalid) hardFailures.push(`invalid dataset splits: ${splitCounts.invalid}`);
  if (indexCount !== table.numRows) hardFailures.push(`row index mismatch: ${indexCount} != ${table.numRows}`);

  const report = {
    generated_at: new Date().toISOString(),
    arrow_file: path.relative(REPO_ROOT, ARROW_FILE).replace(/\\/g, '/'),
    rows: table.numRows,
    columns: table.numCols,
    ipc_bytes: bytes.byteLength,
    split_counts: splitCounts,
    index_entries: indexCount,
    missing_columns: missingColumns,
    duplicate_packet_keys: duplicateKeys.slice(0, 20),
    malformed_vectors: malformedVectors.slice(0, 20),
    hard_failures: hardFailures,
    status: hardFailures.length ? 'FAIL' : 'PASS',
  };

  await fs.mkdir(path.dirname(REPORT_FILE), { recursive: true });
  await fs.writeFile(REPORT_FILE, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(report, null, 2));
  if (hardFailures.length) process.exitCode = 1;
}

main().catch((error) => {
  console.error('[verify-arrow-batch-export] failed:', error?.stack || error?.message || String(error));
  process.exitCode = 1;
});
