import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyGraphifySourceBridgeV1 } from './graphify-source-bridge-classification-v1.mjs';

const workspaceRevision = `sha256:${'a'.repeat(64)}`;
const sourceRevision = `sha256:${'b'.repeat(64)}`;
const contentDigest = 'c'.repeat(64);
const manifestRows = [{ sourceRef: 'src/example.ts', sourceRevision, contentDigest, byteLength: 10 }];

test('distinguishes an exact source revision stored under a different workspace revision', () => {
  const result = classifyGraphifySourceBridgeV1({
    manifestRows,
    workspaceRevision,
    graphifyRows: [{
      source_ref: 'src/example.ts', workspace_revision: `sha256:${'d'.repeat(64)}`,
      code_source_revision: sourceRevision, content_hash: contentDigest, byte_length: 10,
    }],
  });
  assert.equal(result[0].classification, 'SOURCE_REVISION_ROW_OTHER_WORKSPACE');
  assert.equal(result[0].exactSourceRevisionRowCount, 1);
  assert.equal(result[0].admittedWorkspaceRevisionRowCount, 0);
});

test('requires exact workspace, content digest, and byte length for a match', () => {
  const result = classifyGraphifySourceBridgeV1({
    manifestRows,
    workspaceRevision,
    graphifyRows: [{
      source_ref: 'src/example.ts', workspace_revision: workspaceRevision,
      code_source_revision: sourceRevision, content_hash: contentDigest, byte_length: 10,
    }],
  });
  assert.equal(result[0].classification, 'EXACT_ADMITTED_MATCH');
  assert.equal(result[0].exactAdmittedMatchCount, 1);
});

test('does not equate source-ref presence or a non-matching source revision with a qualified match', () => {
  const result = classifyGraphifySourceBridgeV1({
    manifestRows,
    workspaceRevision,
    graphifyRows: [{
      source_ref: 'src/example.ts', workspace_revision: workspaceRevision,
      code_source_revision: `sha256:${'e'.repeat(64)}`, content_hash: contentDigest, byte_length: 10,
    }],
  });
  assert.equal(result[0].classification, 'SOURCE_REVISION_ROW_NOT_FOUND');
  assert.equal(result[0].exactAdmittedMatchCount, 0);
});

test('rejects malformed audit input rather than inferring absence', () => {
  assert.throws(() => classifyGraphifySourceBridgeV1({ manifestRows: null, graphifyRows: [], workspaceRevision }),
    /GRAPHIFY_SOURCE_BRIDGE_INPUT_INVALID/);
});
