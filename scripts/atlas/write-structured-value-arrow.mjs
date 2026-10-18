#!/usr/bin/env node

/**
 * Serialize an Atlas structured-value flattened snapshot into a nested Arrow IPC file.
 *
 * Input JSON shape:
 *   { snapshot: StructuredValueArrowSnapshotV1, rows: StructuredValueArrowRowV1[] }
 *
 * This script intentionally lives at the root workspace because apache-arrow 21.1.0
 * is already owned there. Parent Atlas core only owns the representation contract.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import {
  tableFromArrays,
  tableFromIPC,
  tableToIPC,
  vectorFromArray,
  Bool,
  Float64,
  Utf8,
  Int32,
  Field,
  Struct,
  List,
} from 'apache-arrow';

const provenanceStruct = new Struct([
  new Field('source_ref', new Utf8(), true),
  new Field('source_revision', new Utf8(), true),
  new Field('workspace_revision', new Utf8(), true),
  new Field('language', new Utf8(), true),
  new Field('parser_name', new Utf8(), true),
  new Field('parser_revision', new Utf8(), true),
  new Field('grammar_revision', new Utf8(), true),
  new Field('node_type', new Utf8(), true),
  new Field('start_byte', new Int32(), true),
  new Field('end_byte', new Int32(), true),
  new Field('source_span_checksum', new Utf8(), true),
  new Field('tree_node_id', new Utf8(), true),
  new Field('upstream_node_id', new Utf8(), true),
  new Field('upstream_chunk_id', new Utf8(), true),
  new Field('identity_status', new Utf8(), true),
  new Field('ast_path_json', new Utf8(), true),
]);

const memberStruct = new Struct([
  new Field('ordinal', new Int32(), true),
  new Field('role', new Utf8(), true),
  new Field('field_name', new Utf8(), true),
  new Field('child_value_ordinal', new Int32(), true),
]);
const membersType = new List(new Field('item', memberStruct, true));

const entryStruct = new Struct([
  new Field('ordinal', new Int32(), true),
  new Field('entry_kind', new Utf8(), true),
  new Field('key_text', new Utf8(), true),
  new Field('key_node_type', new Utf8(), true),
  new Field('computed', new Bool(), true),
  new Field('spread', new Bool(), true),
  new Field('child_value_ordinal', new Int32(), true),
  new Field('entry_source_span_checksum', new Utf8(), true),
]);
const entriesType = new List(new Field('item', entryStruct, true));

function parseArg(name, fallback = null) {
  const prefix = `--${name}=`;
  const inline = process.argv.slice(2).find((arg) => arg.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function assertDenseRows(rows) {
  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    if (row.value_ordinal !== index) throw new Error(`STRUCTURED_VALUE_ARROW_NON_DENSE_ORDINAL:${index}:${row.value_ordinal}`);
    for (const member of row.members ?? []) {
      if (member.child_value_ordinal < 0 || member.child_value_ordinal >= rows.length) {
        throw new Error(`STRUCTURED_VALUE_ARROW_MEMBER_REF_OUT_OF_RANGE:${index}:${member.child_value_ordinal}`);
      }
    }
    for (const entry of row.entries ?? []) {
      if (entry.child_value_ordinal < 0 || entry.child_value_ordinal >= rows.length) {
        throw new Error(`STRUCTURED_VALUE_ARROW_ENTRY_REF_OUT_OF_RANGE:${index}:${entry.child_value_ordinal}`);
      }
    }
  }
}

export function buildStructuredValueArrowTable(rows) {
  assertDenseRows(rows);
  return tableFromArrays({
    value_ordinal: vectorFromArray(rows.map((row) => row.value_ordinal), new Int32()),
    value_id: vectorFromArray(rows.map((row) => row.value_id), new Utf8()),
    kind: vectorFromArray(rows.map((row) => row.kind), new Utf8()),
    source_text: vectorFromArray(rows.map((row) => row.source_text), new Utf8()),
    null_value: vectorFromArray(rows.map((row) => row.null_value), new Bool()),
    boolean_value: vectorFromArray(rows.map((row) => row.boolean_value), new Bool()),
    number_value: vectorFromArray(rows.map((row) => row.number_value), new Float64()),
    string_value: vectorFromArray(rows.map((row) => row.string_value), new Utf8()),
    expression_node_type: vectorFromArray(rows.map((row) => row.expression_node_type), new Utf8()),
    // These are intentionally true Arrow nested columns, not JSON strings.
    provenance: vectorFromArray(rows.map((row) => row.provenance), provenanceStruct),
    members: vectorFromArray(rows.map((row) => row.members ?? []), membersType),
    entries: vectorFromArray(rows.map((row) => row.entries ?? []), entriesType),
  });
}

export function nestedSchemaReceipt(table) {
  const fields = Object.fromEntries(table.schema.fields.map((field) => [field.name, String(field.type)]));
  const provenance = fields.provenance ?? '';
  const members = fields.members ?? '';
  const entries = fields.entries ?? '';
  if (!/Struct/i.test(provenance)) throw new Error(`STRUCTURED_VALUE_ARROW_PROVENANCE_NOT_STRUCT:${provenance}`);
  if (!/List/i.test(members) || !/Struct/i.test(members)) throw new Error(`STRUCTURED_VALUE_ARROW_MEMBERS_NOT_LIST_STRUCT:${members}`);
  if (!/List/i.test(entries) || !/Struct/i.test(entries)) throw new Error(`STRUCTURED_VALUE_ARROW_ENTRIES_NOT_LIST_STRUCT:${entries}`);
  return {
    schema: 'atlas.structured-value-arrow-physical-schema-receipt.v1',
    fields,
    nested_columns: {
      provenance_struct: true,
      members_list_struct: true,
      entries_list_struct: true,
    },
    canonical_authority: false,
  };
}

export function serializeStructuredValueArrowFile(rows) {
  const table = buildStructuredValueArrowTable(rows);
  const physicalSchema = nestedSchemaReceipt(table);
  const bytes = tableToIPC(table, 'file');
  const roundtrip = tableFromIPC(bytes);
  if (roundtrip.numRows !== table.numRows) throw new Error('STRUCTURED_VALUE_ARROW_ROUNDTRIP_ROW_COUNT_MISMATCH');
  return {
    bytes,
    receipt: {
      schema: 'atlas.structured-value-arrow-ipc-write-receipt.v1',
      ipc_format: 'ARROW_IPC_FILE',
      row_count: table.numRows,
      byte_length: bytes.byteLength,
      ipc_file_checksum: sha256(bytes),
      physical_schema: physicalSchema,
      roundtrip_row_count: roundtrip.numRows,
      canonical_authority: false,
    },
  };
}

async function main() {
  const inputPath = parseArg('input');
  const outputPath = parseArg('output');
  const receiptPath = parseArg('receipt', outputPath ? `${outputPath}.receipt.json` : null);
  if (!inputPath || !outputPath) {
    console.error('Usage: node scripts/atlas/write-structured-value-arrow.mjs --input=<snapshot.json> --output=<snapshot.arrow> [--receipt=<receipt.json>]');
    process.exitCode = 2;
    return;
  }

  const parsed = JSON.parse(await fs.readFile(inputPath, 'utf8'));
  if (!Array.isArray(parsed.rows)) throw new Error('STRUCTURED_VALUE_ARROW_ROWS_REQUIRED');
  const { bytes, receipt } = serializeStructuredValueArrowFile(parsed.rows);
  await fs.mkdir(path.dirname(path.resolve(outputPath)), { recursive: true });
  await fs.writeFile(outputPath, bytes);

  const fullReceipt = {
    ...receipt,
    snapshot_id: parsed.snapshot?.snapshot_id ?? null,
    snapshot_revision: parsed.snapshot?.snapshot_revision ?? null,
    source_snapshot_revision: parsed.snapshot?.source_snapshot_revision ?? null,
    row_identity_checksum: parsed.snapshot?.row_identity_checksum ?? null,
    structure_checksum: parsed.snapshot?.structure_checksum ?? null,
  };
  if (receiptPath) {
    await fs.mkdir(path.dirname(path.resolve(receiptPath)), { recursive: true });
    await fs.writeFile(receiptPath, `${JSON.stringify(fullReceipt, null, 2)}\n`, 'utf8');
  }
  console.log(JSON.stringify(fullReceipt, null, 2));
}

if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, '/')}` || process.argv[1]?.endsWith('write-structured-value-arrow.mjs')) {
  main().catch((error) => {
    console.error(error?.stack ?? error);
    process.exitCode = 1;
  });
}
