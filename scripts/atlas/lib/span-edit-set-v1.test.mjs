import assert from 'node:assert/strict';
import test from 'node:test';
import { planSpanEditSetV1, uniqueByteSpanV1 } from './span-edit-set-v1.mjs';

const file = Buffer.from('<label>Tags</label>\r\n<input id="a" />\r\n', 'utf8');

test('applies a valid edit, preserves CRLF, and reports before/after hashes', () => {
	const span = uniqueByteSpanV1(file, '<label>');
	const r = planSpanEditSetV1({ beforeBytes: file, edits: [{ ...span, replacementText: '<label for="a">' }] });
	assert.equal(r.ok, true);
	assert.equal(r.afterBytes.toString('utf8'), '<label for="a">Tags</label>\r\n<input id="a" />\r\n');
	assert.notEqual(r.beforeSha256, r.afterSha256);
});

test('no edits is a no-op with identical hashes', () => {
	const r = planSpanEditSetV1({ beforeBytes: file, edits: [] });
	assert.equal(r.ok, true);
	assert.equal(r.noop, true);
	assert.equal(r.beforeSha256, r.afterSha256);
});

test('rejects stale or wrong expectedText', () => {
	const r = planSpanEditSetV1({ beforeBytes: file, edits: [{ startByte: 0, endByte: 7, expectedText: '<LABEL>', replacementText: 'x' }] });
	assert.equal(r.ok, false);
	assert.match(r.errors[0], /expectedText does not match/);
});

test('rejects out-of-range spans', () => {
	const r = planSpanEditSetV1({ beforeBytes: file, edits: [{ startByte: 0, endByte: 9999, expectedText: 'x', replacementText: 'y' }] });
	assert.equal(r.ok, false);
	assert.match(r.errors[0], /beyond end of file/);
});

test('rejects overlapping spans regardless of input order', () => {
	const r = planSpanEditSetV1({ beforeBytes: file, edits: [
		{ startByte: 3, endByte: 8, expectedText: 'bel>T', replacementText: 'A' },
		{ startByte: 0, endByte: 5, expectedText: '<labe', replacementText: 'B' },
	] });
	assert.equal(r.ok, false);
	assert.ok(r.errors.some((e) => /overlaps/.test(e)));
});

test('adjacent (touching) spans are allowed and order-independent', () => {
	const a = { startByte: 0, endByte: 1, expectedText: '<', replacementText: '[' };
	const b = { startByte: 1, endByte: 6, expectedText: 'label', replacementText: 'LABEL' };
	const x = planSpanEditSetV1({ beforeBytes: file, edits: [a, b] });
	const y = planSpanEditSetV1({ beforeBytes: file, edits: [b, a] });
	assert.equal(x.ok && y.ok, true);
	assert.equal(x.afterSha256, y.afterSha256);
});

test('rejects a span that splits a multibyte UTF-8 code point', () => {
	const f = Buffer.from('café ok', 'utf8'); // e-acute is 2 bytes at offsets 3..5
	const r = planSpanEditSetV1({ beforeBytes: f, edits: [{ startByte: 3, endByte: 4, expectedText: '�', replacementText: 'e' }] });
	assert.equal(r.ok, false);
	assert.match(r.errors[0], /splits a UTF-8 code point/);
});

test('uses byte offsets (not character offsets) for non-ASCII text', () => {
	const f = Buffer.from('éé target', 'utf8'); // 4 bytes before "target"
	const span = uniqueByteSpanV1(f, 'target');
	assert.equal(span.startByte, 5);
	const r = planSpanEditSetV1({ beforeBytes: f, edits: [{ ...span, replacementText: 'done' }] });
	assert.equal(r.afterBytes.toString('utf8'), 'éé done');
});

test('uniqueByteSpanV1 returns null for absent or ambiguous text', () => {
	assert.equal(uniqueByteSpanV1(Buffer.from('aa'), 'a'), null);
	assert.equal(uniqueByteSpanV1(Buffer.from('abc'), 'z'), null);
});

test('two inserts at the same offset are rejected as ambiguous', () => {
	const r = planSpanEditSetV1({ beforeBytes: file, edits: [
		{ startByte: 2, endByte: 2, expectedText: '', replacementText: 'A' },
		{ startByte: 2, endByte: 2, expectedText: '', replacementText: 'B' },
	] });
	assert.equal(r.ok, false);
	assert.ok(r.errors.some((e) => /same offset/.test(e)));
});

test('the input buffer is never mutated', () => {
	const copy = Buffer.from(file);
	planSpanEditSetV1({ beforeBytes: file, edits: [{ startByte: 0, endByte: 7, expectedText: '<label>', replacementText: 'z' }] });
	assert.ok(file.equals(copy));
});
