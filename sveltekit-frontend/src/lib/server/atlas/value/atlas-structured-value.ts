export type AtlasStructuredValueKind =
  | 'NULL'
  | 'BOOL'
  | 'INT'
  | 'FLOAT'
  | 'STRING'
  | 'BYTES'
  | 'LIST'
  | 'TUPLE'
  | 'OBJECT'
  | 'MAP'
  | 'SYMBOL_REF'
  | 'PACKET_REF'
  | 'TENSOR_REF'
  | 'SOURCE_REF';

export type AtlasKeyForm = 'IDENTIFIER' | 'STRING' | 'NUMBER' | 'COMPUTED' | 'SPREAD' | 'OTHER';

export interface AtlasSourceEvidence {
  treeNodeId?: string | null;
  symbolVersionId?: string | null;
  sourceRef?: string | null;
  startByte?: number | null;
  endByte?: number | null;
  astPath?: number[];
  nodeType?: string | null;
}

export interface AtlasStructuredMember {
  ordinal: number;
  role?: string | null;
  value: AtlasStructuredValueV1;
}

export interface AtlasStructuredEntry {
  ordinal: number;
  key: AtlasStructuredValueV1;
  value: AtlasStructuredValueV1;
  keyForm: AtlasKeyForm;
  sourceKeyNodeId?: string | null;
  sourceValueNodeId?: string | null;
}

export interface AtlasStructuredValueV1 {
  schema: 'atlas.structured-value.v1';
  valueId: string;
  kind: AtlasStructuredValueKind;
  scalar?: {
    boolValue?: boolean | null;
    /** Decimal string: never narrow a 64-bit/source integer through JS number. */
    intValue?: string | null;
    floatValue?: number | null;
    stringValue?: string | null;
    bytesBase64?: string | null;
  } | null;
  members: AtlasStructuredMember[];
  entries: AtlasStructuredEntry[];
  reference?: {
    refKind: 'SYMBOL_REF' | 'PACKET_REF' | 'TENSOR_REF' | 'SOURCE_REF';
    refId: string;
    revision?: string | null;
    checksum?: string | null;
  } | null;
  sourceEvidence?: AtlasSourceEvidence | null;
  producer: {
    runtime: string;
    parser: string;
    revision: string;
  };
  checksum?: string | null;
}

export type DuplicateKeyPolicy = 'ERROR' | 'FIRST_WINS' | 'LAST_WINS';

export interface DictionaryViewResult {
  values: Map<string, AtlasStructuredValueV1>;
  duplicateKeys: string[];
  sourceEntryCount: number;
  collapsedEntryCount: number;
}

function assertOrdinalSequence(items: Array<{ ordinal: number }>, label: string): void {
  const seen = new Set<number>();
  for (const item of items) {
    if (!Number.isInteger(item.ordinal) || item.ordinal < 0) {
      throw new Error(`${label} ordinal must be a non-negative integer`);
    }
    if (seen.has(item.ordinal)) throw new Error(`${label} contains duplicate ordinal ${item.ordinal}`);
    seen.add(item.ordinal);
  }
}

/** Validate representation invariants without asserting canonical identity. */
export function validateAtlasStructuredValue(value: AtlasStructuredValueV1): void {
  if (value.schema !== 'atlas.structured-value.v1') throw new Error('unsupported structured-value schema');
  if (!value.valueId) throw new Error('valueId is required');
  if (!value.producer?.runtime || !value.producer?.parser || !value.producer?.revision) {
    throw new Error('producer runtime/parser/revision are required');
  }

  assertOrdinalSequence(value.members, 'members');
  assertOrdinalSequence(value.entries, 'entries');

  if ((value.kind === 'LIST' || value.kind === 'TUPLE') && value.entries.length !== 0) {
    throw new Error(`${value.kind} may not carry keyed entries`);
  }
  if ((value.kind === 'OBJECT' || value.kind === 'MAP') && value.members.length !== 0) {
    throw new Error(`${value.kind} may not carry anonymous members`);
  }
  if (['SYMBOL_REF', 'PACKET_REF', 'TENSOR_REF', 'SOURCE_REF'].includes(value.kind)) {
    if (!value.reference || value.reference.refKind !== value.kind) {
      throw new Error(`${value.kind} requires a matching reference`);
    }
  }

  for (const member of value.members) validateAtlasStructuredValue(member.value);
  for (const entry of value.entries) {
    validateAtlasStructuredValue(entry.key);
    validateAtlasStructuredValue(entry.value);
  }
}

/**
 * Derive a convenient dictionary view from an ordered source object.
 *
 * This is deliberately lossy: duplicate keys are collapsed according to an
 * explicit caller-selected policy. The original ordered entries remain the
 * evidence representation and should be retained for round-trip/provenance.
 */
export function deriveDictionaryView(
  value: AtlasStructuredValueV1,
  duplicatePolicy: DuplicateKeyPolicy = 'ERROR',
): DictionaryViewResult {
  if (value.kind !== 'OBJECT' && value.kind !== 'MAP') {
    throw new Error('DictionaryView requires OBJECT or MAP');
  }

  const values = new Map<string, AtlasStructuredValueV1>();
  const duplicateKeys: string[] = [];
  const orderedEntries = [...value.entries].sort((a, b) => a.ordinal - b.ordinal);

  for (const entry of orderedEntries) {
    const key = structuredKeyToString(entry.key);
    if (values.has(key)) {
      duplicateKeys.push(key);
      if (duplicatePolicy === 'ERROR') throw new Error(`duplicate dictionary key: ${key}`);
      if (duplicatePolicy === 'FIRST_WINS') continue;
    }
    values.set(key, entry.value);
  }

  return {
    values,
    duplicateKeys,
    sourceEntryCount: orderedEntries.length,
    collapsedEntryCount: values.size,
  };
}

export function structuredKeyToString(key: AtlasStructuredValueV1): string {
  switch (key.kind) {
    case 'STRING':
      return key.scalar?.stringValue ?? '';
    case 'INT':
      return key.scalar?.intValue ?? '';
    case 'FLOAT':
      return String(key.scalar?.floatValue ?? '');
    case 'BOOL':
      return String(key.scalar?.boolValue ?? false);
    case 'NULL':
      return 'null';
    default:
      // Computed/source-expression keys are not normal dictionary keys. Keep a
      // stable reference token rather than evaluating arbitrary source code.
      return `@${key.kind}:${key.valueId}`;
  }
}
