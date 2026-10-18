/**
 * span-edit-set-v1: pure, no-I/O planner for byte-span edits against ONE exact source file.
 *
 * Sits UNDER the existing FileMutationPlanV1 / preflightFileMutation (sveltekit-frontend/.../agentic-file-compiler):
 * that contract is file-level (target path + expected checksum + approval). This produces the "after" bytes and the
 * before/after SHA-256 a plan's expectedExistingChecksum / contentRef refer to. It never reads or writes files.
 *
 * Offsets are UTF-8 BYTE offsets into the exact bytes supplied (no BOM stripping, no newline normalisation).
 * Rejected (fail closed): out-of-range spans, spans that split a UTF-8 code point, expectedText that does not equal the
 * bytes at the span (stale or guessed), overlapping spans, and invalid UTF-8 in the replacement.
 */
import { createHash } from 'node:crypto';

const sha256 = (b) => createHash('sha256').update(b).digest('hex');
const strict = new TextDecoder('utf-8', { fatal: true });

export function planSpanEditSetV1({ beforeBytes, edits }) {
	const errors = [];
	const before = Buffer.isBuffer(beforeBytes) ? beforeBytes : Buffer.from(beforeBytes);
	const norm = [];
	(edits ?? []).forEach((e, index) => {
		const where = `edit[${index}]`;
		const { startByte, endByte, expectedText, replacementText } = e ?? {};
		if (!Number.isSafeInteger(startByte) || !Number.isSafeInteger(endByte) || startByte < 0 || endByte < startByte) {
			errors.push(`${where}: invalid span`); return;
		}
		if (endByte > before.length) { errors.push(`${where}: span beyond end of file (${endByte} > ${before.length})`); return; }
		let slice;
		try { slice = strict.decode(before.subarray(startByte, endByte)); } catch { errors.push(`${where}: span splits a UTF-8 code point`); return; }
		if (typeof expectedText !== 'string' || slice !== expectedText) { errors.push(`${where}: expectedText does not match the bytes at the span (stale or wrong span)`); return; }
		if (typeof replacementText !== 'string') { errors.push(`${where}: replacementText must be a string`); return; }
		let replacement;
		try { replacement = Buffer.from(replacementText, 'utf8'); strict.decode(replacement); } catch { errors.push(`${where}: replacement is not valid UTF-8`); return; }
		norm.push({ startByte, endByte, expectedText, replacementText, replacement, index });
	});
	const sorted = [...norm].sort((a, b) => a.startByte - b.startByte || a.endByte - b.endByte || a.index - b.index);
	for (let i = 1; i < sorted.length; i++) {
		if (sorted[i].startByte < sorted[i - 1].endByte) errors.push(`edit[${sorted[i].index}] overlaps edit[${sorted[i - 1].index}]`);
		else if (sorted[i].startByte === sorted[i].endByte && sorted[i].startByte === sorted[i - 1].startByte && sorted[i - 1].startByte === sorted[i - 1].endByte) errors.push(`edit[${sorted[i].index}] and edit[${sorted[i - 1].index}] insert at the same offset (ambiguous order)`);
	}
	const beforeSha256 = sha256(before);
	if (errors.length) return { ok: false, errors, beforeSha256, afterSha256: null, afterBytes: null, edits: [] };
	const parts = []; let cursor = 0;
	for (const e of sorted) { parts.push(before.subarray(cursor, e.startByte), e.replacement); cursor = e.endByte; }
	parts.push(before.subarray(cursor));
	const afterBytes = Buffer.concat(parts);
	return {
		ok: true, errors: [], beforeSha256, afterSha256: sha256(afterBytes), afterBytes, noop: afterBytes.equals(before),
		edits: sorted.map(({ startByte, endByte, expectedText, replacementText }) => ({ startByte, endByte, expectedText, replacementText })),
	};
}

/** Locate an exact, unique occurrence of `find` and return its byte span (null if absent or ambiguous). */
export function uniqueByteSpanV1(beforeBytes, find) {
	const text = Buffer.from(beforeBytes).toString('utf8');
	const first = text.indexOf(find);
	if (first < 0 || text.indexOf(find, first + 1) >= 0) return null;
	const startByte = Buffer.byteLength(text.slice(0, first), 'utf8');
	return { startByte, endByte: startByte + Buffer.byteLength(find, 'utf8'), expectedText: find };
}
