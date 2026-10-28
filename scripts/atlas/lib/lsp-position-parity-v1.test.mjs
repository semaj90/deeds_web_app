import test from 'node:test';
import assert from 'node:assert/strict';
import { byteOffsetToPosition as ownerByteToPos, positionToByteOffset as ownerPosToByte } from './lsp-jsonrpc-client.mjs';
import { buildLineIndex, byteOffsetToPosition, positionToByteOffset } from './lsp-position-v1.mjs';

// Parity with the existing owner (lsp-jsonrpc-client.mjs) for UTF-16 on valid text. Documented divergence: the owner returns a position for a byte
// offset that sits between \r and \n of a CRLF terminator; the stricter adapter rejects it as OFFSET_IN_LINE_TERMINATOR.
const corpus = ['const x = "🚀"; foo();', 'a🚀é日b', 'ab\ncd\nef', 'plain ascii line\nsecond', 'éx\n日本語\n'];

test('UTF-16 byte->position agrees with the existing owner at every offset', () => {
  for (const text of corpus) {
    const bytes = Buffer.from(text, 'utf8'); const index = buildLineIndex(bytes);
    for (let off = 0; off <= bytes.length; off++) {
      let mine = null; let owner = null;
      try { mine = byteOffsetToPosition(index, off, 'utf-16'); } catch { mine = 'REJECTED'; }
      try { owner = ownerByteToPos(bytes, off); } catch { owner = 'REJECTED'; }
      if (mine === 'REJECTED' || owner === 'REJECTED') { assert.equal(mine === 'REJECTED', owner === 'REJECTED', `${JSON.stringify(text)}@${off}`); continue; }
      assert.deepEqual(mine, owner, `${JSON.stringify(text)}@${off}`);
    }
  }
});

test('UTF-16 position->byte agrees with the existing owner for every position the owner accepts', () => {
  for (const text of corpus) {
    const bytes = Buffer.from(text, 'utf8'); const index = buildLineIndex(bytes);
    for (let off = 0; off <= bytes.length; off++) {
      let pos; try { pos = ownerByteToPos(bytes, off); } catch { continue; }
      assert.equal(positionToByteOffset(index, pos, 'utf-16'), ownerPosToByte(bytes, pos), `${JSON.stringify(text)}@${off}`);
    }
  }
});

test('documented divergence: offset between CR and LF', () => {
  const bytes = Buffer.from('ab\r\ncd', 'utf8');
  assert.doesNotThrow(() => ownerByteToPos(bytes, 3));
  assert.throws(() => byteOffsetToPosition(buildLineIndex(bytes), 3, 'utf-16'), /OFFSET_IN_LINE_TERMINATOR/);
});
