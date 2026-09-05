import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { parseDocument, isMap, isSeq } = require(path.resolve('sveltekit-frontend/node_modules/yaml'));

function byteOffset(text, charOffset) {
  return Buffer.byteLength(text.slice(0, charOffset), 'utf8');
}

function nodeRange(node) {
  if (!node?.range || node.range.length < 2) throw new Error('STRUCTURED_SPAN_UNAVAILABLE');
  return node.range;
}

function children(node) {
  if (isMap(node)) return node.items.map((pair) => ({ key: String(pair.key?.value ?? ''), node: pair.value }));
  if (isSeq(node)) return node.items.map((item, index) => ({ key: String(index), node: item }));
  return [];
}

/**
 * Uses the installed YAML parser for JSON and YAML, retaining parser ranges.
 * Ranges are converted from JavaScript character offsets to canonical UTF-8
 * byte offsets; no identity is derived from paths or array ordinals.
 */
export function segmentStructuredDocumentV1({ sourceText, sourceRef, sourceRevision, workspaceRevision, format, segmenterRevision = 'structured-object:v1' }) {
  if (typeof sourceText !== 'string' || !sourceRef || !sourceRevision || !workspaceRevision) throw new Error('STRUCTURED_INPUT_REQUIRED');
  if (format !== 'json' && format !== 'yaml') throw new Error('STRUCTURED_FORMAT_UNSUPPORTED');
  const document = parseDocument(sourceText, { keepSourceTokens: true });
  if (document.errors?.length) throw new Error('STRUCTURED_PARSE_FAILED');
  const root = document.contents;
  if (!isMap(root) && !isSeq(root)) throw new Error('STRUCTURED_SPAN_UNAVAILABLE');

  const segments = [];
  const visit = (node, pathParts) => {
    for (const child of children(node)) {
      const [startChar, endChar] = nodeRange(child.node);
      const startByte = byteOffset(sourceText, startChar);
      const endByte = byteOffset(sourceText, endChar);
      if (endByte <= startByte) throw new Error('STRUCTURED_SPAN_UNAVAILABLE');
      const text = Buffer.from(sourceText, 'utf8').subarray(startByte, endByte).toString('utf8');
      segments.push({ sourceRef, sourceRevision, workspaceRevision, segmenterRevision, format,
        kind: 'STRUCTURED_LOGICAL_OBJECT', path: [...pathParts, child.key], startByte, endByte,
        textChecksum: awaitableChecksum(text), text });
      if (isMap(child.node) || isSeq(child.node)) visit(child.node, [...pathParts, child.key]);
    }
  };
  visit(root, []);
  return segments.sort((a, b) => a.startByte - b.startByte || a.endByte - b.endByte || a.path.join('.').localeCompare(b.path.join('.')));
}

function awaitableChecksum(text) {
  const crypto = require('node:crypto');
  return crypto.createHash('sha256').update(Buffer.from(text, 'utf8')).digest('hex');
}

export function structuredSegmentIdentityV1(segment) {
  const crypto = require('node:crypto');
  const identity = { sourceRef: segment.sourceRef, sourceRevision: segment.sourceRevision,
    workspaceRevision: segment.workspaceRevision, segmenterRevision: segment.segmenterRevision,
    format: segment.format, kind: segment.kind, path: segment.path,
    startByte: segment.startByte, endByte: segment.endByte, textChecksum: segment.textChecksum };
  return { ...segment, text: undefined, segmentId: `structured:${crypto.createHash('sha256').update(JSON.stringify(identity)).digest('hex')}` };
}
