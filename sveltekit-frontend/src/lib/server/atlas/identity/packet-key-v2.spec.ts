// @vitest-environment node
import { describe, expect, it } from 'vitest';
import * as v2 from './packet-key-v2';
import {
	PACKET_KEY_V2_PATTERN,
	PacketKeyV2InputError,
	assertCanonicalSourceRefV2,
	computePacketKeyV2,
	qualifyPacketKeyV2,
	type PacketKeyV2Input,
} from './packet-key-v2';
import { PacketAliasConflictError, assignLegacyAliasV2, legacyAliasPairV2, legacyPacketKeyV1 } from './packet-key-legacy-alias-v1';

const base: PacketKeyV2Input = { repositoryScope: 'repo:root', sourceRef: 'src/lib/server/Auth.ts', packetKind: 'SOURCE_FILE' };
const rev = (c: string) => `sha256:${c.repeat(64)}`;

describe('PacketKeyV2 (1-5, 7): identity dimensions', () => {
	it('1/4. same repository + source_ref + kind is the same key across source revisions; revision is not an input', () => {
		const key = computePacketKeyV2(base);
		expect(qualifyPacketKeyV2(key, rev('a')).packetKey).toBe(qualifyPacketKeyV2(key, rev('b')).packetKey);
		for (const field of ['sourceRevision', 'source_revision', 'workspaceRevision', 'contentHash', 'qdrantPointId', 'graphNodeKey', 'ordinal', 'candidateOrdinal', 'latest', 'current']) {
			expect(() => computePacketKeyV2({ ...base, [field]: rev('a') } as unknown as PacketKeyV2Input)).toThrow(PacketKeyV2InputError);
		}
	});

	it('2. different repository + same source_ref + kind is a different key', () => {
		expect(computePacketKeyV2({ ...base, repositoryScope: 'repo:claude-mem' })).not.toBe(computePacketKeyV2(base));
	});

	it('3. same repository/source with a different packet_kind is a different key (kinds occupy separate namespaces)', () => {
		// Only SOURCE_FILE is defined; a future kind must derive from the same tuple and therefore differ. Proven at the name level.
		const name = v2.canonicalNameV2(base);
		expect(name.endsWith('\u0000SOURCE_FILE')).toBe(true);
		expect(() => computePacketKeyV2({ ...base, packetKind: 'SYMBOL' as never })).toThrow(/PACKET_KIND_UNSUPPORTED/);
	});

	it('5. derivation is deterministic and matches a frozen golden vector computed independently of the module', () => {
		expect(computePacketKeyV2(base)).toBe(computePacketKeyV2({ ...base }));
		expect(computePacketKeyV2({ ...base, sourceRef: 'src/lib/server/auth.ts' })).toBe('packet:8f2f58eb-e12a-5baf-923d-8897cc8f9505');
	});

	it('7. keeps the full UUIDv5 output: no 48-bit truncation', () => {
		const key = computePacketKeyV2(base);
		expect(key).toMatch(PACKET_KEY_V2_PATTERN);
		expect(key.slice('packet:'.length).replaceAll('-', '')).toHaveLength(32);
		expect(key).not.toMatch(/^packet:[0-9a-f]{12}$/);
	});
});

describe('PacketKeyV2 (6): source_ref canonicalization is owned upstream, not reinvented here', () => {
	it('uses the value verbatim: case is significant and nothing is normalized', () => {
		expect(assertCanonicalSourceRefV2('src/lib/Auth.ts')).toBe('src/lib/Auth.ts');
		expect(computePacketKeyV2({ ...base, sourceRef: 'src/lib/server/Auth.ts' })).not.toBe(computePacketKeyV2({ ...base, sourceRef: 'src/lib/server/auth.ts' }));
	});

	it('rejects (never rewrites) spellings that would let one file yield two keys', () => {
		for (const sourceRef of ['src\\lib\\a.ts', './src/a.ts', 'src//a.ts', ' src/a.ts', 'src/./a.ts', '/abs/a.ts', 'C:/x/a.ts', '../a.ts', 'a/../b.ts', '$lib/a.ts', '', '  ', 'a\u0000b']) {
			expect(() => computePacketKeyV2({ ...base, sourceRef })).toThrow(PacketKeyV2InputError);
		}
	});

	it('rejects a repository scope that is not a membership repository_id', () => {
		for (const repositoryScope of ['', 'root', 'repo:', 'deeds-web-app', '550e8400-e29b-41d4-a716-446655440000', 'repo:a\u0000b']) {
			expect(() => computePacketKeyV2({ ...base, repositoryScope })).toThrow(PacketKeyV2InputError);
		}
	});
});

describe('PacketKeyV2 (8, 9): legacy compatibility is alias-only and fails closed', () => {
	it('8. the V2 owner exposes no legacy formula and can never emit a source_ref-only key', () => {
		expect(Object.keys(v2).some((name) => /legacy/i.test(name))).toBe(false);
		expect(computePacketKeyV2(base)).not.toBe(legacyPacketKeyV1(base.sourceRef));
		expect(legacyPacketKeyV1('src/lib/server/auth.ts')).toBe('packet:fd038faf661d');
		expect(legacyPacketKeyV1('src/lib/server/auth.ts')).not.toMatch(PACKET_KEY_V2_PATTERN);
	});

	it('alias direction is legacy -> exactly one V2; the raw stored source_ref feeds the legacy hash', () => {
		const canonical = computePacketKeyV2(base);
		const pair = legacyAliasPairV2(base.sourceRef, canonical);
		expect(pair).toEqual({ aliasKey: legacyPacketKeyV1(base.sourceRef), canonicalPacketKey: canonical, aliasKind: 'LEGACY_PACKET_V1_12HEX' });
		expect(() => legacyAliasPairV2(base.sourceRef, legacyPacketKeyV1(base.sourceRef))).toThrow(PacketAliasConflictError);
	});

	it('9. an existing incompatible canonical mapping fails closed; identical re-assignment is idempotent', () => {
		const canonical = computePacketKeyV2(base);
		const pair = legacyAliasPairV2(base.sourceRef, canonical);
		expect(assignLegacyAliasV2(new Map(), pair)).toBe('NEW');
		expect(assignLegacyAliasV2(new Map([[pair.aliasKey, canonical]]), pair)).toBe('ALREADY_ASSIGNED');
		const other = computePacketKeyV2({ ...base, repositoryScope: 'repo:turbovec' });
		expect(() => assignLegacyAliasV2(new Map([[pair.aliasKey, other]]), pair)).toThrow(/ALIAS_MAPS_TO_DIFFERENT_CANONICAL/);
		expect(() => assignLegacyAliasV2(new Map(), { ...pair, aliasKey: canonical })).toThrow(/ALIAS_KEY_NOT_LEGACY/);
	});

	it('qualification rejects a legacy key or a malformed revision', () => {
		expect(() => qualifyPacketKeyV2('packet:fd038faf661d', rev('a'))).toThrow(/PACKET_KEY_NOT_V2/);
		expect(() => qualifyPacketKeyV2(computePacketKeyV2(base), 'latest')).toThrow(/SOURCE_REVISION_INVALID/);
	});
});
