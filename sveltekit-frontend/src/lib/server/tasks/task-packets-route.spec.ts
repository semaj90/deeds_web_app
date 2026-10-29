// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { db, resolveCanonicalPacketKeyForWrite, assertTaskSemanticPacketSchemaCompatible, PacketIdentityAmbiguousError, PacketIdentitySourceMismatchError, PacketIdentityUnresolvedError } = vi.hoisted(() => ({
	db: {
		insert: vi.fn(),
		select: vi.fn(),
	},
	resolveCanonicalPacketKeyForWrite: vi.fn(),
	assertTaskSemanticPacketSchemaCompatible: vi.fn(),
	PacketIdentityAmbiguousError: class PacketIdentityAmbiguousError extends Error {},
	PacketIdentitySourceMismatchError: class PacketIdentitySourceMismatchError extends Error {},
	PacketIdentityUnresolvedError: class PacketIdentityUnresolvedError extends Error {},
}));

vi.mock('$lib/server/db/client', () => ({ db }));
vi.mock('$lib/server/db/schema/tasks.js', () => ({
	taskSemanticPackets: {},
	workspaceTasks: {},
	taskFileLinks: {},
	taskClusterLinks: {},
	agentPickupQueue: {},
}));
vi.mock('$lib/server/atlas/identity/packet-identity-resolver.js', () => ({
	PacketIdentityAmbiguousError,
	PacketIdentitySourceMismatchError,
	PacketIdentityUnresolvedError,
	resolveCanonicalPacketKeyForWrite,
}));
vi.mock('$lib/server/tasks/task-semantic-packet-schema.js', () => ({ assertTaskSemanticPacketSchemaCompatible }));

import { PacketKeyResolutionError } from '$lib/server/atlas/identity/packet-key-resolution-v2.js';
import { POST } from '../../../routes/api/tasks/packets/+server.js';

function request(body: Record<string, unknown>) {
	return new Request('http://localhost/api/tasks/packets', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(body),
	});
}

async function callPost(body: Record<string, unknown>) {
	return POST({ request: request(body), locals: { user: { id: 'user-1' } } } as never);
}

describe('POST /api/tasks/packets identity contract', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		assertTaskSemanticPacketSchemaCompatible.mockResolvedValue(undefined);
	});

	it('inserts only the canonical key returned by the identity resolver', async () => {
		const canonicalKey = 'packet:01234567-89ab-5cde-8fab-0123456789ab';
		resolveCanonicalPacketKeyForWrite.mockResolvedValue(canonicalKey);
		const returning = vi.fn().mockResolvedValue([{ id: 'row-1', packet_key: canonicalKey }]);
		const values = vi.fn(() => ({ returning }));
		db.insert.mockReturnValue({ values });

		const response = await callPost({ feature_id: 'feature-1', source_ref: 'src/lib/example.ts' });

		expect(response.status).toBe(201);
		expect(resolveCanonicalPacketKeyForWrite).toHaveBeenCalledWith(undefined, 'src/lib/example.ts');
		expect(assertTaskSemanticPacketSchemaCompatible).toHaveBeenCalledWith(expect.arrayContaining([
			'packet_key', 'source_ref', 'feature_id',
		]), []);
		expect(values.mock.calls[0][0]).toMatchObject({
			packet_key: canonicalKey,
			source_ref: 'src/lib/example.ts',
			metadata: {},
		});
	});

	it('fails closed before inserting when the live schema has required fields this writer omits', async () => {
		assertTaskSemanticPacketSchemaCompatible.mockRejectedValue(
			new Error('TASK_SEMANTIC_PACKET_SCHEMA_INCOMPATIBLE: unprovided_required=feature_label,qdrant_score'),
		);

		const response = await callPost({ feature_id: 'feature-1', source_ref: 'src/lib/example.ts' });

		expect(response.status).toBe(503);
		expect(resolveCanonicalPacketKeyForWrite).toHaveBeenCalledOnce();
		expect(db.insert).not.toHaveBeenCalled();
	});

	it('does not use feature_id as identity or insert without a source binding', async () => {
		const response = await callPost({ feature_id: 'feature-1' });

		expect(response.status).toBe(400);
		expect(resolveCanonicalPacketKeyForWrite).not.toHaveBeenCalled();
		expect(db.insert).not.toHaveBeenCalled();
	});

	it('rejects blank feature IDs and source references beyond the live column limit before resolving identity', async () => {
		const blankFeature = await callPost({ feature_id: '  ', source_ref: 'src/lib/example.ts' });
		const longSource = await callPost({ feature_id: 'feature-1', source_ref: 'x'.repeat(513) });
		const longFallback = await callPost({ feature_id: 'feature-1', file_path: 'x'.repeat(513) });

		expect(blankFeature.status).toBe(400);
		expect(longSource.status).toBe(400);
		expect(longFallback.status).toBe(400);
		expect(resolveCanonicalPacketKeyForWrite).not.toHaveBeenCalled();
		expect(db.insert).not.toHaveBeenCalled();
	});

	it('rejects malformed or unregistered explicit identities without insertion', async () => {
		resolveCanonicalPacketKeyForWrite.mockRejectedValue(new PacketKeyResolutionError('UNSUPPORTED_SHAPE', 'not-a-packet-key'));

		const response = await callPost({ feature_id: 'feature-1', packet_key: 'not-a-packet-key', source_ref: 'src/lib/example.ts' });

		expect(response.status).toBe(409);
		expect(db.insert).not.toHaveBeenCalled();
	});

	it('rejects ambiguous source bindings without insertion', async () => {
		resolveCanonicalPacketKeyForWrite.mockRejectedValue(new PacketIdentityAmbiguousError('ambiguous source'));

		const response = await callPost({ feature_id: 'feature-1', source_ref: 'src/lib/ambiguous.ts' });

		expect(response.status).toBe(409);
		expect(db.insert).not.toHaveBeenCalled();
	});

	it('rejects a packet key that does not match the supplied source reference', async () => {
		resolveCanonicalPacketKeyForWrite.mockRejectedValue(new PacketIdentitySourceMismatchError('source mismatch'));

		const response = await callPost({
			feature_id: 'feature-1',
			packet_key: 'packet:01234567-89ab-5cde-8fab-0123456789ab',
			source_ref: 'src/lib/different.ts',
		});

		expect(response.status).toBe(409);
		expect(db.insert).not.toHaveBeenCalled();
	});

	it('returns a conflict when the canonical packet identity already exists', async () => {
		resolveCanonicalPacketKeyForWrite.mockResolvedValue('packet:01234567-89ab-5cde-8fab-0123456789ab');
		const returning = vi.fn().mockRejectedValue({ code: '23505' });
		db.insert.mockReturnValue({ values: vi.fn(() => ({ returning })) });

		const response = await callPost({ feature_id: 'feature-1', source_ref: 'src/lib/example.ts' });

		expect(response.status).toBe(409);
		expect(await response.json()).toEqual({ error: 'A task packet already exists for this canonical identity' });
	});

	it('reports a schema contract mismatch instead of a generic database failure', async () => {
		resolveCanonicalPacketKeyForWrite.mockResolvedValue('packet:01234567-89ab-5cde-8fab-0123456789ab');
		const returning = vi.fn().mockRejectedValue({ code: '23502' });
		db.insert.mockReturnValue({ values: vi.fn(() => ({ returning })) });

		const response = await callPost({ feature_id: 'feature-1', source_ref: 'src/lib/example.ts' });

		expect(response.status).toBe(503);
		expect(await response.json()).toEqual({ error: 'Task packet schema is incompatible with this writer' });
	});
});
