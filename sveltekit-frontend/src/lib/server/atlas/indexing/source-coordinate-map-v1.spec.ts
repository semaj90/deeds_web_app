import { execFileSync, execSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildSourceCoordinateMap, getOrBuildSourceCoordinateMap, clearSourceCoordinateMapCache, createSourceOffsetConverter } from './source-coordinate-map-v1.js';
import { fingerprintStructuralSource } from './structural-observation-v1.js';

// Fixture deliberately contains a 4-byte UTF-8 astral character (🎉, a UTF-16 surrogate pair)
// before the span under test, so UTF-8 byte offsets and UTF-16 code-unit offsets genuinely
// diverge -- proving the reconciliation matters, not just round-tripping ASCII where byte offset
// == UTF-16 offset trivially.
const FIXTURE_SOURCE = 'const emoji = "🎉";\nfunction greet() {\n  return "héllo";\n}\n';

describe('SourceCoordinateMapV1 (proof gate item 7.2)', () => {
	it('reconciles a real ast-grep byte-offset span against the coordinate map, cross-checked against a JS/LSP-style UTF-16 position', () => {
		const dir = mkdtempSync(path.join(tmpdir(), 'source-coord-map-'));
		const file = path.join(dir, 'sample.ts');
		writeFileSync(file, FIXTURE_SOURCE, 'utf8');

		try {
			// Real, live ast-grep invocation -- not hardcoded byte offsets. Windows .cmd shims
			// require shell:true (execFileSync fails with EINVAL otherwise); execSync with a
			// manually double-quoted command string (rather than execFileSync's array form, which
			// does NOT quote array elements for cmd.exe and mangles `$$$`/`{`/`}` into separate
			// unquoted tokens) keeps the pattern argument intact as one token.
			const astGrepBin = execFileSync('where', ['ast-grep.cmd'], { encoding: 'utf8' }).trim().split(/\r?\n/)[0]!;
			const raw = execSync(
				`"${astGrepBin}" run -p "function $NAME() { $$$ }" --json "${file}"`,
				{ encoding: 'utf8' },
			);
			const matches = JSON.parse(raw) as Array<{ range: { byteOffset: { start: number; end: number } } }>;
			expect(matches.length).toBe(1);
			const { start: utf8StartByte, end: utf8EndByte } = matches[0]!.range.byteOffset;

			const map = buildSourceCoordinateMap({
				sourceRevision: 'fixture-rev-1',
				source: FIXTURE_SOURCE,
				spans: [{ utf8StartByte, utf8EndByte }],
			});

			const span = map.spans[0]!;
			expect(span.utf8StartByte).toBe(utf8StartByte);

			// Cross-check against a real UTF-16/LSP-style position: slicing the JS source string
			// (native UTF-16) at [utf16StartCodeUnit, utf16EndCodeUnit) must reproduce the exact
			// same text ast-grep reported for the byte-offset span.
			const utf16Slice = FIXTURE_SOURCE.slice(span.utf16StartCodeUnit, span.utf16EndCodeUnit);
			const utf8Slice = Buffer.from(FIXTURE_SOURCE, 'utf8').subarray(utf8StartByte, utf8EndByte).toString('utf8');
			expect(utf16Slice).toBe(utf8Slice);
			expect(utf16Slice.startsWith('function greet()')).toBe(true);

			// The emoji line precedes this span: 15 ASCII bytes + 4-byte emoji + 3 ASCII bytes = 22
			// bytes before "function" starts, but the emoji is a UTF-16 surrogate pair (2 code
			// units) not 4 -- so the real byte offset (22) and the real UTF-16 offset (20) must
			// genuinely differ. This is the concrete divergence this contract exists to reconcile.
			expect(span.utf8StartByte).toBe(22);
			expect(span.utf16StartCodeUnit).toBe(20);
			expect(span.utf8StartByte).not.toBe(span.utf16StartCodeUnit);

			// Line/column projection: "function greet..." is the second line (index 1), column 0.
			expect(span.line).toBe(1);
			expect(span.utf8ColumnByte).toBe(0);
			expect(span.utf16ColumnCodeUnit).toBe(0);
		} finally {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	it('reconciles a tree-sitter-npm-package (UTF-16 startIndex) span the same way, after converting it to UTF-8 bytes first', async () => {
		// Regression lock for the caveat added to this module's header comment 2026-09-22: the
		// `tree-sitter` npm package's JS `Node.startIndex`/`Node.endIndex` are UTF-16 code-unit
		// offsets, NOT UTF-8 bytes, despite this module's byte-offset-authority framing matching
		// ast-grep's native output. Same astral-emoji fixture as the ast-grep test above, so both
		// input sources are proven to converge on the identical SourceCoordinateSpanV1.
		const { default: Parser } = await import('tree-sitter');
		const TypeScript = await import('tree-sitter-typescript');
		const parser = new Parser();
		parser.setLanguage((TypeScript as any).typescript ?? (TypeScript as any).default.typescript);
		const tree = parser.parse(FIXTURE_SOURCE);

		let fnNode: any;
		function walk(node: any) {
			if (node.type === 'function_declaration') fnNode = node;
			for (let i = 0; i < node.childCount; i += 1) walk(node.child(i));
		}
		walk(tree.rootNode);
		expect(fnNode).toBeDefined();

		// This is the reusable per-file converter, NOT node.startIndex passed straight through and
		// NOT a one-off Buffer.byteLength(source.slice(...)) recomputed per symbol.
		const converter = createSourceOffsetConverter(FIXTURE_SOURCE);
		const utf8StartByte = converter.utf16CodeUnitToUtf8Byte(fnNode.startIndex);
		const utf8EndByte = converter.utf16CodeUnitToUtf8Byte(fnNode.endIndex);

		// Proves the raw tree-sitter-npm index would have been wrong if used directly.
		expect(fnNode.startIndex).toBe(20); // UTF-16 code-unit index (matches the ast-grep test's utf16StartCodeUnit)
		expect(fnNode.startIndex).not.toBe(utf8StartByte);
		expect(utf8StartByte).toBe(22); // matches the ast-grep test's real byte offset exactly

		const map = buildSourceCoordinateMap({
			sourceRevision: 'fixture-rev-3',
			source: FIXTURE_SOURCE,
			spans: [{ utf8StartByte, utf8EndByte }],
		});
		const span = map.spans[0]!;
		expect(span.line).toBe(1);
		expect(span.utf16StartCodeUnit).toBe(fnNode.startIndex);
	});

	it('builds whole-file fields from fingerprintStructuralSource, not a separate recomputation', () => {
		const map = buildSourceCoordinateMap({
			sourceRevision: 'fixture-rev-2',
			source: FIXTURE_SOURCE,
			spans: [],
		});
		const fingerprint = fingerprintStructuralSource(FIXTURE_SOURCE);
		expect(map.sourceByteLength).toBe(fingerprint.utf8ByteLength);
		expect(map.utf8Checksum).toBe(fingerprint.sha256);
	});

	it('rejects a span that does not align to a UTF-8 codepoint boundary', () => {
		expect(() =>
			buildSourceCoordinateMap({
				sourceRevision: 'fixture-rev-3',
				source: FIXTURE_SOURCE,
				// Byte 16 lands inside the 4-byte emoji sequence (bytes 15-18), not on a boundary.
				spans: [{ utf8StartByte: 16, utf8EndByte: 17 }],
			}),
		).toThrow(/does not align to a UTF-8 codepoint boundary/);
	});

	it('is deterministic for the same inputs', () => {
		const a = buildSourceCoordinateMap({ sourceRevision: 'r', source: FIXTURE_SOURCE, spans: [{ utf8StartByte: 0, utf8EndByte: 5 }] });
		const b = buildSourceCoordinateMap({ sourceRevision: 'r', source: FIXTURE_SOURCE, spans: [{ utf8StartByte: 0, utf8EndByte: 5 }] });
		expect(a).toEqual(b);
	});

	it('memoizes per sourceRevision via getOrBuildSourceCoordinateMap', () => {
		clearSourceCoordinateMapCache();
		const first = getOrBuildSourceCoordinateMap({ sourceRevision: 'memo-rev', source: FIXTURE_SOURCE, spans: [] });
		// Different source/spans but same revision -- cache hit must still return the first result.
		const second = getOrBuildSourceCoordinateMap({ sourceRevision: 'memo-rev', source: 'different source entirely', spans: [] });
		expect(second).toBe(first);
		clearSourceCoordinateMapCache();
	});
});

describe('createSourceOffsetConverter (SYMBOL-WIRE-01 regression matrix)', () => {
	it('ASCII: UTF-16 code-unit offset equals UTF-8 byte offset', () => {
		const source = 'const x = 1;\nfunction foo() {}\n';
		const converter = createSourceOffsetConverter(source);
		const idx = source.indexOf('function foo');
		expect(converter.utf16CodeUnitToUtf8Byte(idx)).toBe(idx);
		expect(converter.utf8ByteToUtf16CodeUnit(idx)).toBe(idx);
	});

	it('BMP non-ASCII (é / 漢): UTF-16 and UTF-8 offsets genuinely diverge, conversion is exact', () => {
		// 'é' = 2 UTF-8 bytes / 1 UTF-16 code unit. '漢' = 3 UTF-8 bytes / 1 UTF-16 code unit.
		const source = 'const s = "é漢";\nfunction foo() {}\n';
		const converter = createSourceOffsetConverter(source);
		const utf16Idx = source.indexOf('function foo');
		const expectedUtf8Byte = Buffer.byteLength(source.slice(0, utf16Idx), 'utf8');
		expect(expectedUtf8Byte).not.toBe(utf16Idx); // divergence actually exists in this fixture
		expect(converter.utf16CodeUnitToUtf8Byte(utf16Idx)).toBe(expectedUtf8Byte);
		expect(converter.utf8ByteToUtf16CodeUnit(expectedUtf8Byte)).toBe(utf16Idx);
	});

	it('ASTRAL (😀): surrogate pair handled exactly, not split', () => {
		// 😀 = 4 UTF-8 bytes / 2 UTF-16 code units (a surrogate pair).
		const source = 'const s = "😀";\nfunction foo() {}\n';
		const converter = createSourceOffsetConverter(source);
		expect('😀'.length).toBe(2); // sanity: confirms this really is a surrogate pair in JS
		const utf16Idx = source.indexOf('function foo');
		const expectedUtf8Byte = Buffer.byteLength(source.slice(0, utf16Idx), 'utf8');
		expect(converter.utf16CodeUnitToUtf8Byte(utf16Idx)).toBe(expectedUtf8Byte);
		expect(converter.utf8ByteToUtf16CodeUnit(expectedUtf8Byte)).toBe(utf16Idx);
	});

	it('MIXED: ASCII + CJK + emoji together', () => {
		const source = 'const a = "hi 漢 😀 bye";\nfunction foo() {}\n';
		const converter = createSourceOffsetConverter(source);
		const utf16Idx = source.indexOf('function foo');
		const expectedUtf8Byte = Buffer.byteLength(source.slice(0, utf16Idx), 'utf8');
		expect(converter.utf16CodeUnitToUtf8Byte(utf16Idx)).toBe(expectedUtf8Byte);
		expect(converter.utf8ByteToUtf16CodeUnit(expectedUtf8Byte)).toBe(utf16Idx);
	});

	it('BOM: a leading UTF-8 BOM is counted in both offset spaces, consistent with fingerprintStructuralSource', () => {
		const BOM = '﻿';
		const source = BOM + 'function foo() {}\n';
		const converter = createSourceOffsetConverter(source);
		const fingerprint = fingerprintStructuralSource(source);
		// The BOM is 3 UTF-8 bytes and 1 UTF-16 code unit -- both index spaces must include it,
		// and the whole-file byte length must match the fingerprint contract (no silent stripping).
		const utf16Idx = source.indexOf('function foo');
		expect(utf16Idx).toBe(1); // BOM occupies exactly 1 UTF-16 code unit
		const utf8Byte = converter.utf16CodeUnitToUtf8Byte(utf16Idx);
		expect(utf8Byte).toBe(Buffer.byteLength(BOM, 'utf8')); // 3
		expect(Buffer.byteLength(source, 'utf8')).toBe(fingerprint.utf8ByteLength);
	});

	it('ROUND TRIP: utf16 -> utf8 -> utf16 reproduces the original offset for every valid boundary', () => {
		const source = 'const a = "hi 漢 😀 bye";\nfunction foo() {\n  return "héllo";\n}\n';
		const converter = createSourceOffsetConverter(source);
		for (let utf16Idx = 0; utf16Idx <= source.length; utf16Idx += 1) {
			// Skip indices that land inside a surrogate pair -- those are not valid boundaries and
			// are covered by the dedicated fail-closed test below, not this round-trip sweep.
			const code = source.charCodeAt(utf16Idx);
			const isLowSurrogateHere = code >= 0xdc00 && code <= 0xdfff;
			if (isLowSurrogateHere) continue;
			const utf8Byte = converter.utf16CodeUnitToUtf8Byte(utf16Idx);
			expect(converter.utf8ByteToUtf16CodeUnit(utf8Byte)).toBe(utf16Idx);
		}
	});

	it('INVALID MID-SURROGATE: fails closed rather than manufacturing a byte boundary', () => {
		const source = 'const s = "😀";\nfunction foo() {}\n';
		const highSurrogateIdx = source.indexOf('😀'); // index of the high surrogate half
		const midSurrogateIdx = highSurrogateIdx + 1;   // the low surrogate half -- not a real boundary
		const converter = createSourceOffsetConverter(source);
		expect(() => converter.utf16CodeUnitToUtf8Byte(midSurrogateIdx)).toThrow(
			/does not land on a codepoint boundary/,
		);
	});

	it('INVALID MID-MULTIBYTE (UTF-8 direction): fails closed rather than manufacturing a code-unit boundary', () => {
		// 漢 is a 3-byte UTF-8 sequence starting right after "const s = \"" (11 chars/bytes of ASCII).
		const source = 'const s = "漢";\nfunction foo() {}\n';
		const converter = createSourceOffsetConverter(source);
		const charStartByte = Buffer.byteLength('const s = "', 'utf8');
		const midByte = charStartByte + 1; // inside the 3-byte sequence, not a boundary
		expect(() => converter.utf8ByteToUtf16CodeUnit(midByte)).toThrow(
			/does not land on a codepoint boundary/,
		);
	});

	it('OUT OF BOUNDS: fails closed for an offset beyond the source length', () => {
		const source = 'function foo() {}\n';
		const converter = createSourceOffsetConverter(source);
		expect(() => converter.utf16CodeUnitToUtf8Byte(source.length + 1000)).toThrow();
		expect(() => converter.utf8ByteToUtf16CodeUnit(Buffer.byteLength(source, 'utf8') + 1000)).toThrow();
	});
});
