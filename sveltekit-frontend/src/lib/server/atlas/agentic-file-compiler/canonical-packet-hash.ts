import { createHash } from 'node:crypto';

export const ATLAS_CANONICAL_HASH_SCHEMA = 'atlas.canonical-hash.v1' as const;

/**
 * Atlas-owned canonical scalar normalization.
 *
 * Do not hash serialized protobuf bytes. Protobuf is a transport projection,
 * not the canonical persistence/fingerprint representation.
 */
export function normalizeCanonicalScalar(value: unknown): unknown {
	if (value === null || typeof value === 'boolean' || typeof value === 'string') {
		return typeof value === 'string' ? value.normalize('NFC') : value;
	}

	if (typeof value === 'number') {
		if (!Number.isFinite(value)) throw new TypeError('canonical hashes require finite numbers');
		if (Object.is(value, -0)) return 0;
		return value;
	}

	if (Array.isArray(value)) return value.map(normalizeCanonicalScalar);

	if (typeof value === 'object') {
		const record = value as Record<string, unknown>;
		return Object.fromEntries(
			Object.keys(record)
				.sort()
				.filter((key) => record[key] !== undefined)
				.map((key) => [key.normalize('NFC'), normalizeCanonicalScalar(record[key])]),
		);
	}

	throw new TypeError(`unsupported canonical hash value: ${typeof value}`);
}

export function canonicalScalarEncoding(value: unknown): string {
	return JSON.stringify(normalizeCanonicalScalar(value));
}

export function canonicalPacketHash(value: unknown): string {
	return createHash('sha256')
		.update(ATLAS_CANONICAL_HASH_SCHEMA)
		.update('\n')
		.update(canonicalScalarEncoding(value))
		.digest('hex');
}

export function sortedUnique(values: readonly string[]): string[] {
	return [...new Set(values.map((value) => value.normalize('NFC')))].sort();
}
