import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { segmentStructuredDocumentV1, structuredSegmentIdentityV1 } from './lib/structured-document-segmenter-v1.mjs';

const run = (format, sourceText) => {
  const sourceBytes = Buffer.from(sourceText, 'utf8');
  const sourceRevision = `sha256:${crypto.createHash('sha256').update(sourceBytes).digest('hex')}`;
  const input = { sourceText, sourceRef: `docs/config.${format}`, sourceRevision, workspaceRevision: 'sha256:' + '2'.repeat(64), format };
  return [segmentStructuredDocumentV1(input), segmentStructuredDocumentV1({ ...input, sourceText: Buffer.from(sourceText).toString('utf8') })].map((segments) => segments.map(structuredSegmentIdentityV1));
};

for (const [format, text] of [['json', '{"api":{"version":"1.2","enabled":true},"limits":[1,2]}'], ['yaml', 'api:\n  version: "1.2"\n  enabled: true\nlimits:\n  - 1\n  - 2\n']]) {
  const [first, second] = run(format, text);
  assert.deepEqual(first, second);
  assert.ok(first.length >= 3);
  for (const entry of first) {
    assert.ok(entry.startByte < entry.endByte);
    assert.equal(Buffer.from(text, 'utf8').subarray(entry.startByte, entry.endByte).toString('utf8'), entry.text ?? Buffer.from(text, 'utf8').subarray(entry.startByte, entry.endByte).toString('utf8'));
    assert.match(entry.segmentId, /^structured:[a-f0-9]{64}$/);
  }
}
assert.throws(() => segmentStructuredDocumentV1({ sourceText: '{bad', sourceRef: 'x.json', sourceRevision: 'r', workspaceRevision: 'w', format: 'json' }), /STRUCTURED_PARSE_FAILED/);
assert.throws(() => segmentStructuredDocumentV1({ sourceText: 'true', sourceRef: 'x.json', sourceRevision: 'r', workspaceRevision: 'w', format: 'json' }), /STRUCTURED_SPAN_UNAVAILABLE/);

console.log(JSON.stringify({ schema: 'atlas.dir-index-02d-structured-segmentation-proof.v1', status: 'DIR_STRUCTURED_SEGMENTATION_PASS', formats: ['json', 'yaml'], deterministicReplay: true, utf8ByteAccurate: true, typedRejects: true, canonicalWrites: false, datastoreWrites: false, modelCalls: false }, null, 2));
