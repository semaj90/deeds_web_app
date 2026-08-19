import { createHash } from 'node:crypto';
import { z } from 'zod';
import {
  atlasStructuredValueSchema,
  type AtlasStructuredValueV1,
  type TreeSitterAstProvenanceV1,
} from './structured-value-ast.js';

const id = z.string().min(1);
const revision = z.string().min(1);
const checksum = z.string().regex(/^[a-f0-9]{64}$/);

export const structuredValueArrowMemberRefSchema = z.object({
  ordinal: z.number().int().nonnegative(),
  role: z.enum(['ELEMENT', 'ARGUMENT', 'PARAMETER', 'SPREAD']),
  field_name: z.string().min(1).nullable(),
  child_value_ordinal: z.number().int().nonnegative(),
}).strict();

export const structuredValueArrowEntryRefSchema = z.object({
  ordinal: z.number().int().nonnegative(),
  entry_kind: z.enum(['PROPERTY', 'SHORTHAND', 'SPREAD', 'METHOD', 'COMPUTED']),
  key_text: z.string().nullable(),
  key_node_type: z.string().min(1).nullable(),
  computed: z.boolean(),
  spread: z.boolean(),
  child_value_ordinal: z.number().int().nonnegative(),
  entry_source_span_checksum: checksum,
}).strict();

export const structuredValueArrowProvenanceSchema = z.object({
  source_ref: z.string().min(1),
  source_revision: revision,
  workspace_revision: revision,
  language: z.string().min(1),
  parser_name: z.enum(['NODE_TREE_SITTER', 'CONSILIENCY_TREE_SITTER']),
  parser_revision: revision,
  grammar_revision: revision,
  node_type: z.string().min(1),
  start_byte: z.number().int().nonnegative(),
  end_byte: z.number().int().nonnegative(),
  source_span_checksum: checksum,
  tree_node_id: id.nullable(),
  upstream_node_id: id.nullable(),
  upstream_chunk_id: id.nullable(),
  identity_status: z.enum(['SPAN_ONLY', 'NATIVE_UPSTREAM', 'PARITY_PROVEN']),
  ast_path_json: z.string(),
}).strict();

export const structuredValueArrowRowSchema = z.object({
  value_ordinal: z.number().int().nonnegative(),
  value_id: id,
  kind: z.enum(['NULL', 'BOOLEAN', 'NUMBER', 'STRING', 'SOURCE_EXPRESSION', 'ARRAY', 'TUPLE', 'OBJECT', 'ARGUMENT_LIST', 'PARAMETER_LIST']),
  source_text: z.string(),
  null_value: z.boolean(),
  boolean_value: z.boolean().nullable(),
  number_value: z.number().finite().nullable(),
  string_value: z.string().nullable(),
  expression_node_type: z.string().min(1).nullable(),
  provenance: structuredValueArrowProvenanceSchema,
  members: z.array(structuredValueArrowMemberRefSchema),
  entries: z.array(structuredValueArrowEntryRefSchema),
}).strict();
export type StructuredValueArrowRowV1 = z.infer<typeof structuredValueArrowRowSchema>;

export const structuredValueArrowSnapshotSchema = z.object({
  schema: z.literal('atlas.structured-value-arrow-snapshot.v1').default('atlas.structured-value-arrow-snapshot.v1'),
  snapshot_id: id,
  snapshot_revision: revision,
  source_snapshot_revision: revision,
  arrow_js_revision: revision,
  arrow_schema_revision: revision,
  ipc_format: z.literal('ARROW_IPC_FILE'),
  mmap_intended: z.literal(true),
  row_count: z.number().int().nonnegative(),
  root_value_ordinal: z.number().int().nonnegative(),
  ordinal_is_canonical: z.literal(false).default(false),
  row_identity_checksum: checksum,
  structure_checksum: checksum,
  ipc_file_checksum: checksum.nullable().default(null),
  ipc_file_bytes: z.number().int().nonnegative().nullable().default(null),
  canonical_authority: z.literal(false).default(false),
  producer_revision: revision,
}).strict().superRefine((value, ctx) => {
  if (value.row_count === 0 && value.root_value_ordinal !== 0) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['root_value_ordinal'], message: 'empty snapshots use root ordinal 0 by convention' });
  }
  if (value.row_count > 0 && value.root_value_ordinal >= value.row_count) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['root_value_ordinal'], message: 'root ordinal must reference an existing row' });
  }
  if ((value.ipc_file_checksum === null) !== (value.ipc_file_bytes === null)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['ipc_file_checksum'], message: 'IPC checksum/byte count must be present together' });
  }
});
export type StructuredValueArrowSnapshotV1 = z.infer<typeof structuredValueArrowSnapshotSchema>;

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

export function structuredValueArrowChecksum(value: unknown): string {
  return createHash('sha256').update(stable(value), 'utf8').digest('hex');
}

function projectProvenance(value: TreeSitterAstProvenanceV1): z.infer<typeof structuredValueArrowProvenanceSchema> {
  return structuredValueArrowProvenanceSchema.parse({
    source_ref: value.source_ref,
    source_revision: value.source_revision,
    workspace_revision: value.workspace_revision,
    language: value.language,
    parser_name: value.parser_name,
    parser_revision: value.parser_revision,
    grammar_revision: value.grammar_revision,
    node_type: value.node_type,
    start_byte: value.start_byte,
    end_byte: value.end_byte,
    source_span_checksum: value.source_span_checksum,
    tree_node_id: value.tree_node_id,
    upstream_node_id: value.upstream_node_id,
    upstream_chunk_id: value.upstream_chunk_id,
    identity_status: value.identity_status,
    ast_path_json: stable(value.ast_path),
  });
}

export function flattenStructuredValueForArrow(rootInput: AtlasStructuredValueV1): {
  rows: StructuredValueArrowRowV1[];
  root_value_ordinal: number;
  row_identity_checksum: string;
  structure_checksum: string;
} {
  const root = atlasStructuredValueSchema.parse(rootInput);
  const rows: StructuredValueArrowRowV1[] = [];
  const byValueId = new Map<string, number>();

  const visit = (value: AtlasStructuredValueV1): number => {
    const existing = byValueId.get(value.value_id);
    if (existing !== undefined) return existing;
    const ordinal = rows.length;
    byValueId.set(value.value_id, ordinal);
    // Reserve before recursion so a malformed/cyclic caller cannot recurse forever.
    rows.push(undefined as unknown as StructuredValueArrowRowV1);

    const members = ('members' in value ? value.members : []).map((member) => ({
      ordinal: member.ordinal,
      role: member.role,
      field_name: member.field_name,
      child_value_ordinal: visit(member.value),
    }));
    const entries = ('entries' in value ? value.entries : []).map((entry) => ({
      ordinal: entry.ordinal,
      entry_kind: entry.entry_kind,
      key_text: entry.key_text,
      key_node_type: entry.key_node_type,
      computed: entry.computed,
      spread: entry.spread,
      child_value_ordinal: visit(entry.value),
      entry_source_span_checksum: entry.provenance.source_span_checksum,
    }));
    const row = structuredValueArrowRowSchema.parse({
      value_ordinal: ordinal,
      value_id: value.value_id,
      kind: value.kind,
      source_text: value.source_text,
      null_value: value.kind === 'NULL',
      boolean_value: value.kind === 'BOOLEAN' ? value.value : null,
      number_value: value.kind === 'NUMBER' ? value.value : null,
      string_value: value.kind === 'STRING' ? value.value : null,
      expression_node_type: value.kind === 'SOURCE_EXPRESSION' ? value.expression_node_type : null,
      provenance: projectProvenance(value.provenance),
      members,
      entries,
    });
    rows[ordinal] = row;
    return ordinal;
  };

  const rootOrdinal = visit(root);
  const rowIdentityChecksum = structuredValueArrowChecksum(rows.map((row) => ({
    value_ordinal: row.value_ordinal,
    value_id: row.value_id,
    source_span_checksum: row.provenance.source_span_checksum,
  })));
  const structureChecksum = structuredValueArrowChecksum(rows.map((row) => ({
    value_ordinal: row.value_ordinal,
    kind: row.kind,
    members: row.members,
    entries: row.entries,
  })));
  return {
    rows,
    root_value_ordinal: rootOrdinal,
    row_identity_checksum: rowIdentityChecksum,
    structure_checksum: structureChecksum,
  };
}

export function validateStructuredValueArrowRows(rowsInput: readonly unknown[], rootValueOrdinal: number): StructuredValueArrowRowV1[] {
  const rows = rowsInput.map((row) => structuredValueArrowRowSchema.parse(row));
  rows.forEach((row, ordinal) => {
    if (row.value_ordinal !== ordinal) throw new Error(`STRUCTURED_VALUE_ARROW_NON_DENSE_ORDINAL:${ordinal}:${row.value_ordinal}`);
    for (const member of row.members) if (member.child_value_ordinal >= rows.length) throw new Error(`STRUCTURED_VALUE_ARROW_MEMBER_REF_OUT_OF_RANGE:${ordinal}:${member.child_value_ordinal}`);
    for (const entry of row.entries) if (entry.child_value_ordinal >= rows.length) throw new Error(`STRUCTURED_VALUE_ARROW_ENTRY_REF_OUT_OF_RANGE:${ordinal}:${entry.child_value_ordinal}`);
  });
  if (rows.length > 0 && (rootValueOrdinal < 0 || rootValueOrdinal >= rows.length)) throw new Error('STRUCTURED_VALUE_ARROW_ROOT_OUT_OF_RANGE');
  return rows;
}

export function buildStructuredValueArrowSnapshot(input: {
  snapshot_id: string;
  snapshot_revision: string;
  source_snapshot_revision: string;
  arrow_js_revision: string;
  arrow_schema_revision: string;
  root: AtlasStructuredValueV1;
  producer_revision: string;
}): { snapshot: StructuredValueArrowSnapshotV1; rows: StructuredValueArrowRowV1[] } {
  const flattened = flattenStructuredValueForArrow(input.root);
  const snapshot = structuredValueArrowSnapshotSchema.parse({
    snapshot_id: input.snapshot_id,
    snapshot_revision: input.snapshot_revision,
    source_snapshot_revision: input.source_snapshot_revision,
    arrow_js_revision: input.arrow_js_revision,
    arrow_schema_revision: input.arrow_schema_revision,
    ipc_format: 'ARROW_IPC_FILE',
    mmap_intended: true,
    row_count: flattened.rows.length,
    root_value_ordinal: flattened.root_value_ordinal,
    ordinal_is_canonical: false,
    row_identity_checksum: flattened.row_identity_checksum,
    structure_checksum: flattened.structure_checksum,
    ipc_file_checksum: null,
    ipc_file_bytes: null,
    canonical_authority: false,
    producer_revision: input.producer_revision,
  });
  return { snapshot, rows: flattened.rows };
}

export function attachStructuredValueArrowIpcReceipt(input: {
  snapshot: StructuredValueArrowSnapshotV1;
  ipc_bytes: Uint8Array;
}): StructuredValueArrowSnapshotV1 {
  const checksumValue = createHash('sha256').update(input.ipc_bytes).digest('hex');
  return structuredValueArrowSnapshotSchema.parse({
    ...input.snapshot,
    ipc_file_checksum: checksumValue,
    ipc_file_bytes: input.ipc_bytes.byteLength,
  });
}

export function describeStructuredValueArrow(): string {
  return [
    'Structured values are flattened to dense noncanonical ordinals so Arrow does not need a recursive self-referential physical type.',
    'Each row retains provenance and uses nested member/entry lists of structs that point to child ordinals; source order, role, computed-key and spread semantics survive roundtrip.',
    'Arrow IPC file format is the intended persisted representation for random-access/mmap consumers; transport checksum is separate from row identity and structure checksums.',
    'Python, PyTorch and cuDF consumers must resolve ordinals back through the frozen row identity rather than treating array position as canonical identity.',
  ].join(' ');
}
