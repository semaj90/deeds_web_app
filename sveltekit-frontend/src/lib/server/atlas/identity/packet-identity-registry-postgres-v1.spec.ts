import { beforeEach, describe, expect, it, vi } from 'vitest';

const execute = vi.hoisted(() => vi.fn());
vi.mock('$lib/server/db/client.js', () => ({ db: { execute } }));

import { computePacketKeyV2 } from './packet-key-v2.js';
import { isUndefinedTableError, resolvePacketIdentityRegistryV1 } from './packet-identity-registry-postgres-v1.js';

const KEY = computePacketKeyV2({ repositoryScope: 'repo:root', sourceRef: 'src/a.ts', packetKind: 'SOURCE_FILE' });

describe('registry DDL not applied', () => {
	beforeEach(() => execute.mockReset());

	it('recognises only missing registry-v1 relations, directly or nested in cause', () => {
		expect(isUndefinedTableError({ code: '42P01', message: 'relation "atlas_packet_identity_registry_v1" does not exist' })).toBe(true);
		expect(isUndefinedTableError({ cause: { code: '42P01', message: 'relation "public.atlas_packet_identity_aliases_v1" does not exist' } })).toBe(true);
		expect(isUndefinedTableError({ code: '42P01', message: 'relation "atlas_repository_identity" does not exist' })).toBe(false);
		expect(isUndefinedTableError({ code: '42P01', message: 'relation "unrelated_table" does not exist' })).toBe(false);
		expect(isUndefinedTableError({ code: '23505' })).toBe(false);
		expect(isUndefinedTableError(null)).toBe(false);
	});

	it('returns REGISTRY_DDL_NOT_APPLIED instead of crashing when the registry table is missing', async () => {
		execute.mockRejectedValue(Object.assign(new Error('relation "atlas_packet_identity_registry_v1" does not exist'), { code: '42P01' }));
		await expect(resolvePacketIdentityRegistryV1(KEY)).rejects.toMatchObject({ code: 'REGISTRY_DDL_NOT_APPLIED', name: 'PacketIdentityRegistryErrorV1' });
	});

	it('also maps a driver error that nests the SQLSTATE in cause', async () => {
		execute.mockRejectedValue(Object.assign(new Error('query failed'), { cause: { code: '42P01', message: 'relation "atlas_packet_identity_aliases_v1" does not exist' } }));
		await expect(resolvePacketIdentityRegistryV1(KEY)).rejects.toMatchObject({ code: 'REGISTRY_DDL_NOT_APPLIED' });
	});

	it('does not hide unrelated database errors', async () => {
		execute.mockRejectedValue(Object.assign(new Error('connection lost'), { code: '08006' }));
		await expect(resolvePacketIdentityRegistryV1(KEY)).rejects.toThrow('connection lost');
	});
});
