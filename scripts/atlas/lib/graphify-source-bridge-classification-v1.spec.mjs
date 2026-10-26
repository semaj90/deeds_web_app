import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyGraphifySourceBridgeV1 } from './graphify-source-bridge-classification-v1.mjs';

const manifest = [{
  sourceRef: 'src/a.ts',
  sourceRevision: 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  contentDigest: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  byteLength: 12,
}];

test('preserves the first-seen run for one exact source revision', () => {
  const result = classifyGraphifySourceBridgeV1({
    manifestRows: manifest,
    graphifyRows: [{
      source_ref: 'src/a.ts',
      workspace_revision: 'sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      code_source_revision: manifest[0].sourceRevision,
      content_hash: manifest[0].contentDigest,
      byte_length: manifest[0].byteLength,
      first_seen_run_id: '55555555-5555-4555-8555-555555555555',
      first_seen_workspace_id: '77777777-7777-4777-8777-777777777777',
    }],
    workspaceRevision: 'sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
  });
  assert.equal(result[0].priorFirstSeenRunId, '55555555-5555-4555-8555-555555555555');
  assert.equal(result[0].priorFirstSeenWorkspaceId, '77777777-7777-4777-8777-777777777777');
});

test('does not choose a first-seen run when exact source revision rows are ambiguous', () => {
  const graphifyRows = ['55555555-5555-4555-8555-555555555555', '66666666-6666-4666-8666-666666666666']
    .map((first_seen_run_id) => ({
      source_ref: 'src/a.ts',
      workspace_revision: 'sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      code_source_revision: manifest[0].sourceRevision,
      content_hash: manifest[0].contentDigest,
      byte_length: manifest[0].byteLength,
      first_seen_run_id,
      first_seen_workspace_id: '77777777-7777-4777-8777-777777777777',
    }));
  const result = classifyGraphifySourceBridgeV1({
    manifestRows: manifest,
    graphifyRows,
    workspaceRevision: 'sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
  });
  assert.equal(result[0].exactSourceRevisionRowCount, 2);
  assert.equal(result[0].priorFirstSeenRunId, null);
});
