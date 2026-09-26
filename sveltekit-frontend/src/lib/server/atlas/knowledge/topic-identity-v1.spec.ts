import { describe, expect, it } from 'vitest';
import { deriveTopicIdentityV1, normalizeTopicLabel } from './topic-identity-v1.js';
import { toTopicIdentityReadModelV1 } from './topic-identity-read-model-v1.js';

describe('topic identity v1', () => {
	it('normalizes labels deterministically', () => {
		expect(normalizeTopicLabel('  AST / Symbol  ')).toBe('ast symbol');
	});

	it('derives a stable UUID topic identity and separate title compatibility id', async () => {
		const first = await deriveTopicIdentityV1({ namespace: 'Languages', name: 'AST Symbol', label: 'AST / Symbol', taxonomyRevision: 'taxonomy:r1' });
		const second = await deriveTopicIdentityV1({ namespace: ' languages ', name: ' ast-symbol ', label: 'different display title', taxonomyRevision: 'taxonomy:r1' });

		expect(first.topicId).toBe(second.topicId);
		expect(first.topicId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
		expect(first.topicKey).toBe('languages/ast-symbol');
		expect(first.label).toBe('AST / Symbol');
		expect(first.titleId).toMatch(/^title:ast-symbol:[0-9a-f]{8}$/);
		expect(first.titleId).not.toBe(first.topicId);
		expect(first.identityDerivationRevision).toBe('atlas.uuid.derive.sha256-canonical-json-uuidv8.v1');
		expect(first.canonicalAuthority).toBe(false);
		expect(first.writesPerformed).toBe(false);
	});

	it('keeps materially different topic versions distinct', async () => {
		const first = await deriveTopicIdentityV1({ namespace: 'tools', name: 'typescript', version: '5.9', label: 'TypeScript', taxonomyRevision: 'taxonomy:r1' });
		const second = await deriveTopicIdentityV1({ namespace: 'tools', name: 'typescript', version: '7.0', label: 'TypeScript', taxonomyRevision: 'taxonomy:r1' });
		expect(first.topicId).not.toBe(second.topicId);
		expect(first.topicKey).toBe('tools/typescript/5.9');
		expect(second.topicKey).toBe('tools/typescript/7.0');
	});

	it('fails closed for an empty label', async () => {
		await expect(deriveTopicIdentityV1({ label: '   ' })).rejects.toThrow('TOPIC_IDENTITY_INPUT_UNQUALIFIED:label');
	});

	it('maps to a noncanonical read-model row without persistence', async () => {
		const identity = await deriveTopicIdentityV1({ label: 'Semantic ANN', sourceRef: 'report.json#topic', sourceRevision: 'sha256:source' });
		const row = toTopicIdentityReadModelV1(identity, { producerRevision: 'topic-audit-v1', evidenceChecksum: 'sha256:evidence' });
		expect(row.topicId).toBe(identity.topicId);
		expect(row.titleId).toBe(identity.titleId);
		expect(row.canonicalAuthority).toBe(false);
		expect(row.writesPerformed).toBe(false);
	});

	it('rejects missing producer revision', async () => {
		const identity = await deriveTopicIdentityV1({ label: 'Semantic ANN' });
		expect(() => toTopicIdentityReadModelV1(identity, { producerRevision: ' ' })).toThrow('TOPIC_READ_MODEL_INPUT_UNQUALIFIED:producerRevision');
	});

	it('rejects empty key segments instead of collapsing identity paths', async () => {
		await expect(deriveTopicIdentityV1({ namespace: 'tools//legacy', name: 'TypeScript' }))
			.rejects.toThrow('TOPIC_IDENTITY_INPUT_INVALID:namespace');
	});
});
