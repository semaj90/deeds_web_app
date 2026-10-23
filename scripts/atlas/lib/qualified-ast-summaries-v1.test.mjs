import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { buildQualifiedAstSummariesV1 } from './qualified-ast-summaries-v1.mjs';

const workspaceRevision = 'sha256:workspace';
const sourceSnapshotRevision = 'sha256:snapshot';
const parserRevision = '@ast-grep/napi@0.45.3';

function fixture(sourceRef = 'src/a.ts', source = 'const answer = 42;') {
  const bytes = Buffer.from(source);
  const sourceRevision = `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
  const row = {
    source_ref: sourceRef,
    source_revision: sourceRevision,
    workspace_revision: workspaceRevision,
    packet_key: null,
    canonical_symbol_id: null,
    symbol_version_id: null,
    tree_node_occurrence_id: 'occurrence-1',
    language: 'typescript',
    symbol_kind: 'variable',
    ast_kind: 'variable_declarator',
    name: 'answer',
    start_byte: 0,
    end_byte: bytes.length,
    start_line: 1,
    end_line: 1,
  };
  const sourceEvidence = new Map([[sourceRef, { sourceRef, sourceRevision, workspaceRevision, bytes }]]);
  return { row, sourceEvidence };
}

test('qualified AST summaries are deterministic and hierarchy binds child checksums', () => {
  const { row, sourceEvidence } = fixture();
  const input = { observations: [row], sourceEvidence, sourceSnapshotRevision, parserRevision };
  const first = buildQualifiedAstSummariesV1(input);
  const second = buildQualifiedAstSummariesV1(input);
  assert.deepEqual(first, second);
  assert.equal(first.fileSummaries[0].canonicalSymbolResolutionCount, 0);
  assert.equal(first.fileSummaries[0].summaryKind, 'SOURCE_REVISION_QUALIFIED_AST_OBSERVATIONS_ONLY');
  assert.equal(first.directorySummaries.find((item) => item.directoryPath === 'src').childBindings[0].summarySha256,
    first.fileSummaries[0].summarySha256);
  assert.equal(first.directorySummaries.find((item) => item.directoryPath === '.').descendantFileSummaryCount, 1);
});

test('summary builder rejects source/workspace revision mismatches and invalid spans', () => {
  const { row, sourceEvidence } = fixture();
  assert.throws(() => buildQualifiedAstSummariesV1({ observations: [{ ...row, source_revision: 'stale' }, row],
    sourceEvidence, sourceSnapshotRevision, parserRevision }), /LINEAGE_MISMATCH/);
  assert.throws(() => buildQualifiedAstSummariesV1({ observations: [{ ...row, workspace_revision: 'stale' }],
    sourceEvidence, sourceSnapshotRevision, parserRevision }), /LINEAGE_MISMATCH/);
  assert.throws(() => buildQualifiedAstSummariesV1({ observations: [{ ...row, end_byte: 999 }],
    sourceEvidence, sourceSnapshotRevision, parserRevision }), /SPAN_OUT_OF_BOUNDS/);
});

test('summary builder rejects duplicate observation identity and canonical IDs', () => {
  const { row, sourceEvidence } = fixture();
  assert.throws(() => buildQualifiedAstSummariesV1({ observations: [row, row],
    sourceEvidence, sourceSnapshotRevision, parserRevision }), /DUPLICATE_OCCURRENCE/);
  assert.throws(() => buildQualifiedAstSummariesV1({ observations: [{ ...row, canonical_symbol_id: 'symbol-1' }],
    sourceEvidence, sourceSnapshotRevision, parserRevision }), /CANONICAL_IDENTITY_OUT_OF_SCOPE/);
});
