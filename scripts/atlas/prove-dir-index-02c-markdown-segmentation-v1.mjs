import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { segmentMarkdownSectionsV1, segmentMarkdownIdentityV1 } from './lib/markdown-section-segmenter-v1.mjs';

const source = Buffer.from('# API\nIntro café.\n\n## Search\nUse this.\n\n```ts\nconst x = 1;\n```\n\n## Cache\nDone.\n', 'utf8');
const revision = `sha256:${crypto.createHash('sha256').update(source).digest('hex')}`;
const input = { sourceBytes: source, sourceRef: 'docs/api.md', sourceRevision: revision, workspaceRevision: 'sha256:' + '1'.repeat(64) };

const first = segmentMarkdownSectionsV1(input).map(segmentMarkdownIdentityV1);
const second = segmentMarkdownSectionsV1({ ...input, sourceBytes: Buffer.from(source) }).map(segmentMarkdownIdentityV1);

assert.equal(first.length, 4);
assert.deepEqual(first, second);
assert.deepEqual(first.map((entry) => entry.kind), ['MARKDOWN_SECTION', 'MARKDOWN_SECTION', 'FENCED_CODE_EXAMPLE', 'MARKDOWN_SECTION']);
assert.deepEqual(first.map((entry) => entry.headingPath), [['API'], ['API', 'Search'], ['API', 'Search'], ['API', 'Cache']]);
for (const entry of first) {
  assert.ok(entry.startByte >= 0 && entry.endByte <= source.length && entry.startByte < entry.endByte);
  assert.match(entry.textChecksum, /^[a-f0-9]{64}$/);
  assert.match(entry.segmentId, /^markdown:[a-f0-9]{64}$/);
}
const fenced = first.find((entry) => entry.kind === 'FENCED_CODE_EXAMPLE');
assert.equal(source.subarray(fenced.startByte, fenced.endByte).toString('utf8'), '```ts\nconst x = 1;\n```\n');

const report = {
  schema: 'atlas.dir-index-02c-markdown-segmentation-proof.v1',
  status: 'DIR_MARKDOWN_SEGMENTATION_PASS',
  segmentCount: first.length,
  deterministicReplay: true,
  utf8ByteAccurate: true,
  headingPaths: true,
  fencedCodeChildren: true,
  canonicalWrites: false,
  datastoreWrites: false,
  modelCalls: false,
};
console.log(JSON.stringify(report, null, 2));
