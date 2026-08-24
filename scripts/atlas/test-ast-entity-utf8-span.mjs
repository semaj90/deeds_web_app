#!/usr/bin/env node

/** Read-only proof that ast-grep ranges are UTF-8 byte offsets. */
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const { Lang, parse } = await import(pathToFileURL(
  path.join(root, 'sveltekit-frontend/node_modules/@ast-grep/napi/index.js'),
).href);

const source = [
  'const café = "préface";',
  'function naïve(input: string) {',
  '  return input + " résumé";',
  '}',
  '',
].join('\n');
const bytes = Buffer.from(source, 'utf8');
const rootNode = parse(Lang.TypeScript, source).root();
let target = null;

function visit(node) {
  if (node.kind() === 'function_declaration' && node.text().includes('naïve')) target = node;
  for (const child of node.children()) visit(child);
}
visit(rootNode);
if (!target) throw new Error('UTF8_AST_FUNCTION_NOT_FOUND');

const range = target.range();
const utf8ByteOffset = (value, codeUnitOffset) => Buffer.byteLength(value.slice(0, codeUnitOffset), 'utf8');
const startByte = utf8ByteOffset(source, range.start.index);
const endByte = utf8ByteOffset(source, range.end.index);
const extracted = bytes.subarray(startByte, endByte).toString('utf8');
const expected = target.text();
if (extracted !== expected) {
  throw new Error(`UTF8_BYTE_SPAN_MISMATCH:${startByte}:${endByte}`);
}

const report = {
  schema: 'atlas.ast-entity-utf8-byte-span-proof.v1',
  status: 'PROVEN',
  extractor: 'ast-grep-napi',
  language: 'typescript',
  symbol: 'naïve',
  startByte,
  endByte,
  byteLength: endByte - startByte,
  sourceCodeUnitRange: [range.start.index, range.end.index],
  extractedMatchesAstText: true,
  canonicalWrites: false,
};
console.log(JSON.stringify(report, null, 2));
