import { describe, expect, it } from 'vitest';
import { chunkFileContent } from './ast-chunker.js';

describe('AST chunk source byte spans', () => {
	it('binds a Unicode/CRLF source chunk to its exact UTF-8 byte interval', () => {
		const source = '// café 🧭\r\n\r\nexport function lookupPacket() {\r\n  return "naïve";\r\n}\r\n';
		const chunks = chunkFileContent(source, '/repo/src/lookup.ts', '/repo');
		const chunk = chunks.find((candidate) => candidate.metadata.symbol === 'lookupPacket');

		expect(chunk).toBeDefined();
		if (!chunk || chunk.metadata.sourceByteStart === undefined || chunk.metadata.sourceByteEnd === undefined) {
			throw new Error('AST_CHUNK_SOURCE_BYTE_SPAN_MISSING');
		}
		const bytes = Buffer.from(source, 'utf8');
		expect(bytes.subarray(chunk.metadata.sourceByteStart, chunk.metadata.sourceByteEnd).toString('utf8'))
			.toBe(chunk.content);
		expect(chunk.metadata.sourceByteEnd - chunk.metadata.sourceByteStart)
			.toBe(Buffer.byteLength(chunk.content, 'utf8'));
	});
});
