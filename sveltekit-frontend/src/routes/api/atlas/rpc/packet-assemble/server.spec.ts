import { describe, it, expect, vi } from 'vitest';
import { POST } from './+server.js';

vi.mock('$lib/server/redis.js', () => ({
	getRedis: vi.fn(() => ({
		set: vi.fn().mockResolvedValue('OK')
	}))
}));

describe('POST /api/atlas/rpc/packet-assemble', () => {
	const validPacket = {
		schema: 'atlas.rpc.packet.v1',
		registry: {
			packetKey: 'packet:2a5b5f91-1f2b-5477-8bba-2010bb313f1a',
			titleId: 'title:f5663d0e',
			title: 'login.diagnostic.spec.ts',
			packetClass: 'AST_COORDINATE_CONVERTER',
			lutEncodingRevision: 'sha256:7fa7f61de23825e7d9c7b09e9bfc74b63f850e13828a788fba69064d6978ba24',
			lutCode: 1
		},
		lineage: {
			sourceRef: 'sveltekit-frontend/tests/e2e/route-forensic/login.diagnostic.spec.ts',
			sourceRevision: 'sha256:77e2e17f1f1d532771bd2e3db00eee942eb204b7ad7c6af953e84354e399d545',
			workspaceRevision: 'sha256:0000000000000000000000000000000000000000000000000000000000000000'
		},
		callerId: 'atlas-radix-simdjson-assembler-v1',
		rpcCallId: '019a1897-e880-7001-8c03-2fc1e5f6a2e5',
		executionId: '019a1897-e880-7002-ae5a-a50a642826da',
		idempotencyKey: 'calibration-v3:0000',
		requestDigest: '033a7bb6f2b4262ada3731c2bc6b7cad08fade3805f5ebe18351be451fefeb9e',
		operation: 'ANALYZE',
		analysis: {
			algorithm: 'PCA_LOW_RANK',
			inputArtifactRef: 'artifact://.tmp/atlas/nb_logreg_xgb_symbol_features_v1.arrow',
			inputManifestChecksum: '0a0ba18ab863ddacb342ad8e49b9fb502d0dd50a714fdd61920f38448f75c55d',
			parametersChecksum: 'a5d8df6c92c72c40b1c2cb4300e276bc70ed2574092bf74c8dbd81277dfe5f01',
			writePolicy: 'PROPOSAL_ONLY'
		}
	};

	it('accepts and validates an ANALYZE RPC packet with UUIDv7 in PROPOSAL_ONLY mode', async () => {
		const request = new Request('http://localhost/api/atlas/rpc/packet-assemble', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(validPacket)
		});

		const response = await POST({ request, locals: {} } as any);
		expect(response.status).toBe(200);

		const result = await response.json();
		expect(result.ok).toBe(true);
		expect(result.status).toBe('ASSEMBLED_PROPOSAL_ONLY');
		expect(result.packetKey).toBe(validPacket.registry.packetKey);
		expect(result.rpcCallId).toBe(validPacket.rpcCallId);
	});

	it('rejects an invalid JSON payload with 400', async () => {
		const request = new Request('http://localhost/api/atlas/rpc/packet-assemble', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: 'not a json'
		});

		const response = await POST({ request, locals: {} } as any);
		expect(response.status).toBe(400);

		const result = await response.json();
		expect(result.ok).toBe(false);
		expect(result.error).toBe('INVALID_JSON_BODY');
	});

	it('rejects an RPC packet missing required lineage with 400', async () => {
		const invalid = { ...validPacket, lineage: undefined };
		const request = new Request('http://localhost/api/atlas/rpc/packet-assemble', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(invalid)
		});

		const response = await POST({ request, locals: {} } as any);
		expect(response.status).toBe(400);

		const result = await response.json();
		expect(result.ok).toBe(false);
		expect(result.error).toBe('VALIDATION_FAILED');
	});
});
