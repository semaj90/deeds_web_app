import { createHash } from 'node:crypto';

export type CacheTierV2 = 'atlas-lru' | 'bitfrost-semantic' | 'ace-context' | 'kv-prefix';

export type CacheIdentityRevisionsV2 = {
	workspaceRevision?: string | number;
	sourceRevision?: string | number;
	graphRevision?: string | number;
	representationRevision?: string | number;
	candidateSnapshotRevision?: string;
	contextManifestChecksum?: string;
	modelRevision?: string;
	tokenizerRevision?: string;
	adapterRevision?: string;
	promptTemplateRevision?: string;
	cacheSalt?: string;
};

export type CacheIdentityInputV2 = {
	tier: CacheTierV2;
	kind: string;
	cacheEpoch: number;
	payloadChecksum: string;
	revisions?: CacheIdentityRevisionsV2;
};

export type CacheIdentityV2 = CacheIdentityInputV2 & {
	schema: 'atlas.cache-identity.v2';
	identityChecksum: string;
	cacheKey: string;
};

const REVISION_FIELDS: ReadonlyArray<keyof CacheIdentityRevisionsV2> = [
	'workspaceRevision',
	'sourceRevision',
	'graphRevision',
	'representationRevision',
	'candidateSnapshotRevision',
	'contextManifestChecksum',
	'modelRevision',
	'tokenizerRevision',
	'adapterRevision',
	'promptTemplateRevision',
	'cacheSalt'
] as const;

function assertNonNegativeInteger(value: number, name: string): void {
	if (!Number.isInteger(value) || value < 0) throw new Error(`${name} must be a non-negative integer`);
}

function assertSafeToken(value: string, name: string): void {
	if (!value.trim() || value.trim() !== value || value.includes(':')) {
		throw new Error(`${name} must be a non-empty trimmed token without ':'`);
	}
}

function encodeField(name: string, value: string): Buffer {
	const nameBytes = Buffer.from(name, 'utf8');
	const valueBytes = Buffer.from(value, 'utf8');
	const out = Buffer.allocUnsafe(8 + nameBytes.length + valueBytes.length);
	out.writeUInt32LE(nameBytes.length, 0);
	nameBytes.copy(out, 4);
	out.writeUInt32LE(valueBytes.length, 4 + nameBytes.length);
	valueBytes.copy(out, 8 + nameBytes.length);
	return out;
}

/**
 * Cross-language deterministic SHA-256 over length-prefixed UTF-8 fields.
 * This intentionally avoids JSON object-order dependence.
 */
export function hashFieldsV2(fields: ReadonlyArray<readonly [string, string]>): string {
	const hash = createHash('sha256');
	for (const [name, value] of fields) hash.update(encodeField(name, value));
	return hash.digest('hex');
}

export function hashTextV2(text: string): string {
	return hashFieldsV2([['encoding', 'utf8'], ['text', text]]);
}

/** Hash all coordinates after canonical FP32 rounding, encoded little-endian. */
export function hashFloat32VectorV2(values: readonly number[]): string {
	const header = Buffer.allocUnsafe(4);
	header.writeUInt32LE(values.length, 0);
	const body = Buffer.allocUnsafe(values.length * 4);
	for (let i = 0; i < values.length; i++) {
		const value = values[i];
		if (!Number.isFinite(value)) throw new Error(`vector[${i}] must be finite`);
		body.writeFloatLE(Math.fround(value), i * 4);
	}
	return createHash('sha256').update('atlas-f32le-v1\0', 'utf8').update(header).update(body).digest('hex');
}

/** Hash the exact token-id sequence; token IDs are encoded as unsigned 32-bit LE values. */
export function hashTokenIdsV2(tokenIds: readonly number[]): string {
	const header = Buffer.allocUnsafe(4);
	header.writeUInt32LE(tokenIds.length, 0);
	const body = Buffer.allocUnsafe(tokenIds.length * 4);
	for (let i = 0; i < tokenIds.length; i++) {
		const token = tokenIds[i];
		if (!Number.isInteger(token) || token < 0 || token > 0xffff_ffff) {
			throw new Error(`tokenIds[${i}] must be an unsigned 32-bit integer`);
		}
		body.writeUInt32LE(token, i * 4);
	}
	return createHash('sha256').update('atlas-token-u32le-v1\0', 'utf8').update(header).update(body).digest('hex');
}

export function buildCacheIdentityV2(input: CacheIdentityInputV2): CacheIdentityV2 {
	assertSafeToken(input.tier, 'tier');
	assertSafeToken(input.kind, 'kind');
	assertNonNegativeInteger(input.cacheEpoch, 'cacheEpoch');
	if (!/^[a-f0-9]{64}$/i.test(input.payloadChecksum)) throw new Error('payloadChecksum must be SHA-256 hex');

	const fields: Array<readonly [string, string]> = [
		['schema', 'atlas.cache-identity.v2'],
		['tier', input.tier],
		['kind', input.kind],
		['cacheEpoch', String(input.cacheEpoch)],
		['payloadChecksum', input.payloadChecksum.toLowerCase()]
	];
	for (const key of REVISION_FIELDS) {
		const value = input.revisions?.[key];
		if (value !== undefined && value !== null) fields.push([key, String(value)]);
	}
	const identityChecksum = hashFieldsV2(fields);
	return {
		schema: 'atlas.cache-identity.v2',
		...input,
		identityChecksum,
		cacheKey: `${input.tier}:v2:e${input.cacheEpoch}:${input.kind}:${identityChecksum}`
	};
}
