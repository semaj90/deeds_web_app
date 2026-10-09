import test from 'node:test';
import assert from 'node:assert/strict';
import { parseNodeTreeSitterSource } from '../../../sveltekit-frontend/src/lib/server/atlas/language/node-tree-sitter-structured-value.js';
import { utf16OffsetToUtf8Byte } from './tree-sitter-coordinate-v1.mjs';

test('converts Node Tree-sitter string-unit declaration ranges to exact UTF-8 byte ranges', () => {
  const source = 'const marker = "café 😀";\r\nexport class Sample { method(): void {} }\r\n';
  const parsed = parseNodeTreeSitterSource({ source, language: 'typescript' });
  const stack = [parsed.rootNode];
  let declaration: any = null;
  while (stack.length) {
    const node = stack.pop()!;
    if (node.type === 'class_declaration') {
      declaration = node;
      break;
    }
    for (let index = 0; index < node.childCount; index += 1) {
      const child = node.child(index);
      if (child) stack.push(child);
    }
  }

  assert.ok(declaration);
  const startByte = utf16OffsetToUtf8Byte(source, declaration.startIndex);
  const endByte = utf16OffsetToUtf8Byte(source, declaration.endIndex);
  assert.equal(startByte, Buffer.byteLength(source.slice(0, declaration.startIndex), 'utf8'));
  assert.equal(endByte, Buffer.byteLength(source.slice(0, declaration.endIndex), 'utf8'));
  assert.equal(Buffer.from(source, 'utf8').subarray(startByte!, endByte!).toString('utf8'), source.slice(declaration.startIndex, declaration.endIndex));
});
