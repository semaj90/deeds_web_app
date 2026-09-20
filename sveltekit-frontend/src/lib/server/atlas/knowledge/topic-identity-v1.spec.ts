import { describe, expect, it } from 'vitest';
import { deriveTopicIdentityV1, normalizeTopicLabel } from './topic-identity-v1.js';
import { toTopicIdentityReadModelV1 } from './topic-identity-read-model-v1.js';

describe('topic identity v1', () => {
	it('normalizes labels deterministically', () => {
		expect(normalizeTopicLabel('  AST / Symbol  ')).toBe('ast symbol');
	});

	it('derives a stable UUID topic identity and separate title compatibility id', () => {
		const first = deriveTopicIdentityV1({ label: 'AST / Symbol', taxonomyRevision: 'taxonomy:r1' });
		const second = deriveTopicIdentityV1({ label: ' ast-symbol ', taxonomyRevision: 'taxonomy:r1' });

		expect(first.topicId).toBe(second.topicId);
		expect(first.topicId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
		expect(first.topicKey).toBe('topic:ast-symbol');
		expect(first.titleId).toMatch(/^title:ast-symbol:[0-9a-f]{8}$/);
		expect(first.titleId).not.toBe(first.topicId);
		expect(first.canonicalAuthority).toBe(false);
		expect(first.writesPerformed).toBe(false);
	});

	it('changes identity when the taxonomy revision changes', () => {
		const first = deriveTopicIdentityV1({ label: 'Graph Topology', taxonomyRevision: 'taxonomy:r1' });
		const second = deriveTopicIdentityV1({ label: 'Graph Topology', taxonomyRevision: 'taxonomy:r2' });
		expect(first.topicId).not.toBe(second.topicId);
	});

	it('fails closed for an empty label', () => {
		expect(() => deriveTopicIdentityV1({ label: '   ' })).toThrow('TOPIC_IDENTITY_INPUT_UNQUALIFIED:label');
	});

	it('maps to a noncanonical read-model row without persistence', () => {
		const identity = deriveTopicIdentityV1({ label: 'Semantic ANN', sourceRef: 'report.json#topic', sourceRevision: 'sha256:source' });
		const row = toTopicIdentityReadModelV1(identity, { producerRevision: 'topic-audit-v1', evidenceChecksum: 'sha256:evidence' });
		expect(row.topicId).toBe(identity.topicId);
		expect(row.titleId).toBe(identity.titleId);
		expect(row.canonicalAuthority).toBe(false);
		expect(row.writesPerformed).toBe(false);
	});

	it('rejects missing producer revision', () => {
		const identity = deriveTopicIdentityV1({ label: 'Semantic ANN' });
		expect(() => toTopicIdentityReadModelV1(identity, { producerRevision: ' ' })).toThrow('TOPIC_READ_MODEL_INPUT_UNQUALIFIED:producerRevision');
	});
});
