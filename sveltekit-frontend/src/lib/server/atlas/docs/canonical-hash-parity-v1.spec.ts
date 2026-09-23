// @vitest-environment node
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { canonicalEncodeV1, canonicalSha256V1 } from '../prefill/canonical-hash-v1.js';

/**
 * VAL-02 cross-language parity vectors for the FRONTEND-owned canonicalSha256V1 (the checksum owner of the external-doc lane).
 * The Python twin (python/atlas_doc_coordinate.py canonical_sha256_v1) must reproduce every `encoding` and `sha256` byte-for-byte.
 * Keys are plain lowerCamel ASCII on purpose: the Python port rejects anything else rather than risk an ordering mismatch with
 * TypeScript's localeCompare('en') (a documented limitation, asserted on the Python side).
 * UPDATE_FIXTURE=1 regenerates the golden file; without it the file must match what the TS hasher produces today.
 */
const GOLDEN = resolve(import.meta.dirname, '__fixtures__/canonical-hash-parity-v1.golden.json');

const VECTORS: Array<{ name: string; value: unknown }> = [
	{ name: 'null', value: null },
	{ name: 'booleans', value: [true, false] },
	{ name: 'integers as float64', value: [0, 1, -1, 42, 65535, 2147483647, 9007199254740991] },
	{ name: 'negative zero equals zero', value: [-0, 0] },
	{ name: 'floats', value: [0.5, -2.25, 1e-7, 123456.789] },
	{ name: 'empty string', value: '' },
	{ name: 'ascii string', value: 'hnsw.iterative_scan' },
	{ name: 'unicode NFC precomposed', value: 'café' },
	{ name: 'unicode NFD normalizes to NFC', value: 'café' },
	{ name: 'multibyte and emoji', value: 'π≈3.14 — 日本語 🙂' },
	{ name: 'string with length-prefix lookalike', value: '3:abc;s3:abc;' },
	{ name: 'empty array and object', value: { emptyArray: [], emptyObject: {} } },
	{ name: 'arrays preserve order', value: ['b', 'a', 'c'] },
	{ name: 'nested objects sort keys', value: { zeta: { beta: 1, alpha: [3, 2, 1] }, alpha: { gamma: null, delta: false }, mid: 'x' } },
	{ name: 'same content different key order (a)', value: { chunkId: 'c', claimOrdinal: 0, nested: { second: 2, first: 1 } } },
	{ name: 'same content different key order (b)', value: { nested: { first: 1, second: 2 }, claimOrdinal: 0, chunkId: 'c' } },
	{ name: 'mixed nesting', value: { schema: 'atlas.summary-claim.v1', claimText: 'Queries with low-selectivity filters can return fewer results under HNSW.' } }
];

const build = () => VECTORS.map(({ name, value }) => ({ name, value: JSON.parse(JSON.stringify(value)), encoding: canonicalEncodeV1(value), sha256: canonicalSha256V1(value) }));

describe('canonicalSha256V1 cross-language golden vectors (VAL-02)', () => {
	it('matches the checked-in golden file the Python twin is tested against (UPDATE_FIXTURE=1 regenerates)', () => {
		if (process.env.UPDATE_FIXTURE === '1' || !existsSync(GOLDEN)) writeFileSync(GOLDEN, JSON.stringify(build(), null, 2) + '\n');
		expect(JSON.parse(readFileSync(GOLDEN, 'utf8'))).toEqual(build());
	});

	it('documents the actual guarantees: key order and NFD/NFC are normalized, array order is not, -0 equals 0', () => {
		expect(canonicalSha256V1({ b: 1, a: 2 })).toBe(canonicalSha256V1({ a: 2, b: 1 }));
		expect(canonicalSha256V1('café')).toBe(canonicalSha256V1('café'));
		expect(canonicalSha256V1(['a', 'b'])).not.toBe(canonicalSha256V1(['b', 'a']));
		expect(canonicalSha256V1(-0)).toBe(canonicalSha256V1(0));
		expect(canonicalSha256V1(1)).not.toBe(canonicalSha256V1('1'));
	});

	it('rejects values the encoding does not define', () => {
		expect(() => canonicalEncodeV1(Number.NaN)).toThrow();
		expect(() => canonicalEncodeV1(Number.POSITIVE_INFINITY)).toThrow();
		expect(() => canonicalEncodeV1(undefined)).toThrow();
	});
});
