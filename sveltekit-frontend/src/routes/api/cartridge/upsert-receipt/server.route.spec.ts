import { describe, expect, it } from 'vitest';
import { POST } from './+server.js';
import { readNesChrom97RegistryV1 } from '$lib/server/cartridge/neschrom97-upsert-receipt-v1.js';

function post(body: unknown, user: { id: string } | null) {
	return POST({
		request: new Request('http://localhost/api/cartridge/upsert-receipt', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(body)
		}),
		locals: { user }
	} as unknown as Parameters<typeof POST>[0]);
}

describe('POST /api/cartridge/upsert-receipt', () => {
	it('requires an authenticated user', async () => {
		const response = await post({ schema: 'atlas.neschrom97.upsert-request.v1', items: [{ cardId: 'any' }] }, null);
		expect(response.status).toBe(401);
		expect(await response.json()).toMatchObject({ error: 'UNAUTHENTICATED', receipt: null });
	});

	it('returns a checksummed proposal for an exact registry card without persistence', async () => {
		const registry = readNesChrom97RegistryV1();
		if (!registry) throw new Error('NES_REGISTRY_FIXTURE_UNAVAILABLE');
		const response = await post({
			schema: 'atlas.neschrom97.upsert-request.v1',
			items: [{ cardId: registry.cards[0]!.card_id }]
		}, { id: 'fixture-actor' });
		const payload = await response.json();
		expect(response.status).toBe(200);
		expect(payload).toMatchObject({ status: 'PROPOSAL_ONLY_NOT_PERSISTED', receipt: { persisted: false, canonicalAuthority: false, itemCount: 1 } });
		expect(payload.receipt.payloadSha256).toMatch(/^sha256:[a-f0-9]{64}$/);
	});

	it('rejects duplicate IDs without producing a partial receipt', async () => {
		const response = await post({
			schema: 'atlas.neschrom97.upsert-request.v1',
			items: [{ cardId: 'duplicate' }, { cardId: 'duplicate' }]
		}, { id: 'fixture-actor' });
		expect(response.status).toBe(400);
		expect(await response.json()).toMatchObject({ error: 'DUPLICATE_CARD_ID', receipt: null });
	});
});
