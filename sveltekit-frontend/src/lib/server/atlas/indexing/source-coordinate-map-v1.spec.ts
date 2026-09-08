import { execFileSync, execSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildSourceCoordinateMap, getOrBuildSourceCoordinateMap, clearSourceCoordinateMapCache } from './source-coordinate-map-v1.js';
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
