import { describe, expect, it } from 'vitest';
import { buildNesChrom97ProposalReceiptV1 } from './neschrom97-upsert-receipt-v1.js';

const registry = {
	path: 'fixture',
	metadata: null,
	registryDigest: `sha256:${'a'.repeat(64)}`,
	cards: [
		{ card_id: 'card-a', packet_key: null, feature_id: null, source_ref: 'src/a.ts', card_hash: 'hash-a', som_cluster: 2, custom_attribute: 'retained' },
		{ card_id: 'card-b', packet_key: 'packet-v2', feature_id: 'feature-b', source_ref: 'src/b.ts', card_hash: 'hash-b', som_cluster: 5 }
	]
};

describe('NES CHROM97 proposal receipt', () => {
	it('validates the whole batch and emits a checksummed non-persistent receipt', () => {
		const result = buildNesChrom97ProposalReceiptV1({
			schema: 'atlas.neschrom97.upsert-request.v1',
			items: [{ cardId: 'card-a' }, { cardId: 'card-b' }]
		}, registry);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.status).toBe('PROPOSAL_ONLY_NOT_PERSISTED');
		expect(result.receipt.itemCount).toBe(2);
		expect(result.receipt.items[0]?.packetKey).toBeNull();
		expect(result.receipt.items[0]?.registryRecord.custom_attribute).toBe('retained');
		expect(result.receipt.canonicalAuthority).toBe(false);
		expect(result.receipt.persisted).toBe(false);
		expect(result.receipt.payloadSha256).toMatch(/^sha256:[a-f0-9]{64}$/);
	});

	it('rejects malformed, duplicate, and unknown card batches atomically', () => {
		expect(buildNesChrom97ProposalReceiptV1({}, registry)).toMatchObject({ ok: false, status: 'REQUEST_INVALID' });
		expect(buildNesChrom97ProposalReceiptV1({ schema: 'atlas.neschrom97.upsert-request.v1', items: [{ cardId: 'card-a' }, { cardId: 'card-a' }] }, registry)).toMatchObject({ ok: false, status: 'DUPLICATE_CARD_ID' });
		expect(buildNesChrom97ProposalReceiptV1({ schema: 'atlas.neschrom97.upsert-request.v1', items: [{ cardId: 'missing' }] }, registry)).toMatchObject({ ok: false, status: 'REGISTRY_CARD_NOT_FOUND' });
	});
});
