import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { segmentMarkdownSectionsV1, segmentMarkdownIdentityV1 } from './lib/markdown-section-segmenter-v1.mjs';
import { segmentStructuredDocumentV1, structuredSegmentIdentityV1 } from './lib/structured-document-segmenter-v1.mjs';

const workspaceRevision = 'sha256:' + '3'.repeat(64);
const files = [
  { sourceRef: 'docs/api.md', format: 'markdown', text: '# API\nUse café.\n\n```ts\nconst ok = true;\n```\n' },
  { sourceRef: 'config/settings.json', format: 'json', text: '{"api":{"enabled":true},"limits":[1,2]}' },
  { sourceRef: 'config/settings.yaml', format: 'yaml', text: 'api:\n  enabled: true\nlimits:\n  - 1\n  - 2\n' },
];

function sourceRevision(text) {
  return `sha256:${crypto.createHash('sha256').update(Buffer.from(text, 'utf8')).digest('hex')}`;
}

function replay(order) {
  return order.flatMap((file) => {
    const input = { sourceRef: file.sourceRef, sourceText: file.text, sourceBytes: Buffer.from(file.text, 'utf8'), sourceRevision: sourceRevision(file.text), workspaceRevision };
    const segments = file.format === 'markdown'
      ? segmentMarkdownSectionsV1(input).map(segmentMarkdownIdentityV1)
      : segmentStructuredDocumentV1({ ...input, format: file.format }).map(structuredSegmentIdentityV1);
    return segments.map(({ segmentId, ...identity }) => ({ segmentId, ...identity }));
  }).sort((a, b) => a.segmentId.localeCompare(b.segmentId));
}

const first = replay(files);
const second = replay([...files].reverse());
assert.ok(first.length >= 6);
assert.deepEqual(first, second);
assert.equal(new Set(first.map((entry) => entry.segmentId)).size, first.length);
for (const entry of first) {
  assert.match(entry.sourceRevision, /^sha256:[a-f0-9]{64}$/);
  assert.equal(entry.workspaceRevision, workspaceRevision);
  assert.ok(entry.startByte < entry.endByte);
  assert.match(entry.textChecksum, /^[a-f0-9]{64}$/);
}

const replayChecksum = crypto.createHash('sha256').update(JSON.stringify(first)).digest('hex');
console.log(JSON.stringify({
  schema: 'atlas.dir-index-02e-directory-replay-proof.v1',
  status: 'DIR_DIRECTORY_REPLAY_PASS',
  fileCount: files.length,
  segmentCount: first.length,
  identityReplay: true,
  spanReplay: true,
  checksumReplay: true,
  provenanceReplay: true,
  replayChecksum,
  canonicalWrites: false,
  datastoreWrites: false,
  modelCalls: false,
}, null, 2));
