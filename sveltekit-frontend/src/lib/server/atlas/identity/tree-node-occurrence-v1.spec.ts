import { describe, it, expect } from 'vitest';
import {
  buildTreeNodeOccurrenceV1,
  deriveTreeNodeOccurrenceId,
  validateTreeNodeOccurrenceV1,
  validateTreeNodeOccurrencePopulationV1,
  TreeNodeOccurrenceV1Schema,
} from './tree-node-occurrence-v1';

const REV1 = 'sha256:' + 'a'.repeat(64);
const REV2 = 'sha256:' + 'b'.repeat(64);
const FILE = 'src/x.ts';

describe('TreeNodeOccurrenceV1 fixtures A-F (S01-09D)', () => {
  it('A: two functions in the same file+revision get different occurrence IDs', () => {
    const a = buildTreeNodeOccurrenceV1({ sourceRef: FILE, sourceRevision: REV1, nodeType: 'function_declaration', startByte: 0, endByte: 20 });
    const b = buildTreeNodeOccurrenceV1({ sourceRef: FILE, sourceRevision: REV1, nodeType: 'function_declaration', startByte: 30, endByte: 60 });
    expect(a.occurrenceId).not.toBe(b.occurrenceId);
    expect(validateTreeNodeOccurrencePopulationV1([a, b]).ok).toBe(true);
  });

  it('B: a function and a class in the same file get different occurrence IDs (different span AND node type)', () => {
    const fn = buildTreeNodeOccurrenceV1({ sourceRef: FILE, sourceRevision: REV1, nodeType: 'function_declaration', startByte: 0, endByte: 20 });
    const cls = buildTreeNodeOccurrenceV1({ sourceRef: FILE, sourceRevision: REV1, nodeType: 'class_declaration', startByte: 25, endByte: 90 });
    expect(fn.occurrenceId).not.toBe(cls.occurrenceId);
  });

  it('C: same/related qualified name but distinct declaration spans (overloads) get different occurrence IDs', () => {
    const overload1 = buildTreeNodeOccurrenceV1({ sourceRef: FILE, sourceRevision: REV1, nodeType: 'function_declaration', startByte: 0, endByte: 20 });
    const overload2 = buildTreeNodeOccurrenceV1({ sourceRef: FILE, sourceRevision: REV1, nodeType: 'function_declaration', startByte: 21, endByte: 45 });
    expect(overload1.occurrenceId).not.toBe(overload2.occurrenceId);
  });

  it('D: reparsing the same declaration at the same frozen revision is deterministic (same occurrence coordinate)', () => {
    const first = deriveTreeNodeOccurrenceId({ sourceRef: FILE, sourceRevision: REV1, nodeType: 'function_declaration', startByte: 0, endByte: 20 });
    const second = deriveTreeNodeOccurrenceId({ sourceRef: FILE, sourceRevision: REV1, nodeType: 'function_declaration', startByte: 0, endByte: 20 });
    expect(first).toBe(second);
  });

  it('E: the same byte span under a different source revision gets a different occurrence identity', () => {
    const before = deriveTreeNodeOccurrenceId({ sourceRef: FILE, sourceRevision: REV1, nodeType: 'function_declaration', startByte: 0, endByte: 20 });
    const after = deriveTreeNodeOccurrenceId({ sourceRef: FILE, sourceRevision: REV2, nodeType: 'function_declaration', startByte: 0, endByte: 20 });
    expect(before).not.toBe(after);
  });

  it('F: a file-scoped legacy input (one id reused across distinct spans) is rejected as FILE_SCOPED', () => {
    const legacyId = 'legacy-packet-tree-node-id';
    const a = { schema: 'atlas.tree-node-occurrence.v1' as const, sourceRef: FILE, sourceRevision: REV1, nodeType: 'function_declaration', startByte: 0, endByte: 20, occurrenceId: legacyId };
    const b = { schema: 'atlas.tree-node-occurrence.v1' as const, sourceRef: FILE, sourceRevision: REV1, nodeType: 'class_declaration', startByte: 30, endByte: 90, occurrenceId: legacyId };
    const result = validateTreeNodeOccurrencePopulationV1([a, b]);
    expect(result.ok).toBe(false);
    expect(result.violations[0].code).toBe('TREE_NODE_OCCURRENCE_FILE_SCOPED');
  });
});

describe('validateTreeNodeOccurrenceV1 single-occurrence checks', () => {
  it('accepts a well-formed occurrence', () => {
    const occ = buildTreeNodeOccurrenceV1({ sourceRef: FILE, sourceRevision: REV1, nodeType: 'function_declaration', startByte: 0, endByte: 20 });
    expect(validateTreeNodeOccurrenceV1(occ).ok).toBe(true);
    expect(TreeNodeOccurrenceV1Schema.safeParse(occ).success).toBe(true);
  });
  it('rejects missing sourceRevision, invalid span, and missing provenance with typed codes', () => {
    expect(validateTreeNodeOccurrenceV1({ sourceRef: FILE, startByte: 0, endByte: 20, occurrenceId: 'x' }).reasons).toContain('TREE_NODE_SOURCE_REVISION_MISSING');
    expect(validateTreeNodeOccurrenceV1({ sourceRef: FILE, sourceRevision: REV1, startByte: 20, endByte: 10, occurrenceId: 'x' }).reasons).toContain('TREE_NODE_SPAN_INVALID');
    expect(validateTreeNodeOccurrenceV1({ sourceRevision: REV1, startByte: 0, endByte: 20, occurrenceId: 'x' }).reasons).toContain('TREE_NODE_PROVENANCE_MISSING');
  });
});
