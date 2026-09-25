import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyCurrentAstSourceV1 as classify } from './current-workspace-ast-classification-v1.mjs';

const base = { astRows: 1, workspaceMatch: false, workspaceMismatch: false, workspaceBindingMissing: false, revisionMatch: false, contentHashMatch: false, hasOtherRevision: false, revisionMissing: false };

test('classifies absent AST evidence', () => assert.equal(classify({ ...base, astRows: 0 }), 'AST_EVIDENCE_ABSENT'));
test('requires workspace, revision, and content-hash agreement to qualify', () => assert.equal(classify({ ...base, workspaceMatch: true, revisionMatch: true, contentHashMatch: true }), 'AST_REVISION_QUALIFIED'));
test('classifies a revision gap in current-workspace AST evidence', () => assert.equal(classify({ ...base, workspaceMatch: true, revisionMissing: true }), 'AST_REVISION_MISSING'));
test('classifies source checksum disagreement', () => assert.equal(classify({ ...base, workspaceMatch: true, revisionMatch: true }), 'AST_SOURCE_MISMATCH'));
test('classifies a foreign workspace binding', () => assert.equal(classify({ ...base, workspaceMismatch: true }), 'AST_WORKSPACE_MISMATCH'));
test('does not qualify an unbound workspace even when revision and hash match', () => assert.equal(classify({ ...base, workspaceBindingMissing: true, revisionMatch: true, contentHashMatch: true }), 'AST_WORKSPACE_BINDING_MISSING'));
test('does not call an observed AST row absent when every lineage field is missing', () => assert.equal(classify({ ...base, workspaceBindingMissing: true, revisionMissing: true }), 'AST_WORKSPACE_BINDING_MISSING'));
test('classifies AST from a different source revision', () => assert.equal(classify({ ...base, workspaceMatch: true, hasOtherRevision: true }), 'AST_STALE_OTHER_REVISION'));
