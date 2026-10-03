import { describe, expect, it } from 'vitest';
import { CANONICAL_DOMAINS, DOMAIN_TAXONOMY_VERSION, classifyDomainTaxonomy } from '../../domain-taxonomy.js';
import { classifyAtlasQuery } from '../query-classifier.js';
import { buildHelperRegistryReviewV2, type HelperRegistryEntryReviewV2 } from './helper-registry-v2-review.js';
import { buildHelperCapabilitySnapshotReviewV2, type HelperCapabilityObservationReviewV2 } from './helper-capability-snapshot-v2-review.js';
import { buildKeywordRecognitionReviewV2, type KeywordVocabularyEntryReviewV2 } from './keyword-recognition-v2-review.js';
import { buildHelperEligibilityReviewV2 } from './helper-eligibility-v2-review.js';

const now = '2026-09-27T12:00:00.000Z';

function fixtureRegistry(helperRegistryRevision = 'review-registry-1') {
	const entries: HelperRegistryEntryReviewV2[] = [
		{
			helperId: 'qdrant-semantic', logicalLane: 'dense', executor: { kind: 'NODE_IN_PROCESS', id: 'qdrant', ownerRef: 'fixture:qdrant-executor' },
			ownerProofRefs: ['fixture:semantic-owner'], routerSignal: 'semantic_concept', intents: ['find'], languages: [],
			requires: ['query-vector'], produces: ['candidate'], costClass: 'CHEAP', mutationClass: 'READ_ONLY', helperRevision: '0'.repeat(64),
		},
		{
			helperId: 'cuvs-semantic', logicalLane: 'dense', executor: { kind: 'PYTHON_SCRIPT', id: 'cuvs', ownerRef: 'fixture:cuvs-executor' },
			ownerProofRefs: ['fixture:semantic-owner'], routerSignal: 'semantic_concept', intents: ['find'], languages: [],
			requires: ['query-vector'], produces: ['candidate'], costClass: 'EXPENSIVE', mutationClass: 'READ_ONLY', helperRevision: '0'.repeat(64),
		},
		{
			helperId: 'lexical-owner', logicalLane: 'lexical', executor: { kind: 'NODE_IN_PROCESS', id: 'lexical-control', ownerRef: 'src/lib/server/retrieval/router-matrix.ts' },
			ownerProofRefs: ['src/lib/server/retrieval/router-matrix.ts'], routerSignal: 'lexical_exact', intents: ['find'], languages: [],
			requires: ['query-term'], produces: ['candidate'], costClass: 'CHEAP', mutationClass: 'READ_ONLY', helperRevision: '0'.repeat(64),
		},
		{
			helperId: 'lsp-references', logicalLane: 'ast', executor: { kind: 'LSP_SERVER', id: 'typescript-lsp', ownerRef: 'fixture:lsp-contract' },
			ownerProofRefs: ['fixture:lsp-contract'], routerSignal: null, intents: ['references'], languages: ['typescript'],
			requires: ['symbol-identity'], produces: ['reference-location'], costClass: 'MEDIUM', mutationClass: 'READ_ONLY', helperRevision: '0'.repeat(64),
		},
	];
	return buildHelperRegistryReviewV2({ helperRegistryRevision, entries });
}

function fixtureQuery(query = 'find qdrant references') {
	return {
		classification: classifyAtlasQuery({ requestId: 'review-fixture', query, producerRevision: 'query-classifier-fixture' }),
		domainClassification: classifyDomainTaxonomy({ summary: query }),
	};
}

const vocabulary: KeywordVocabularyEntryReviewV2[] = [
	{ term: 'qdrant', domainRefs: ['retrieval'], helperRefs: ['qdrant-semantic', 'cuvs-semantic'] },
	{ term: 'references', domainRefs: ['retrieval'], helperRefs: ['lsp-references'] },
];

function fixtureSnapshot(registry: ReturnType<typeof fixtureRegistry>, lspAvailable = false) {
	const observations: HelperCapabilityObservationReviewV2[] = registry.entries.map((entry) => ({
		helperId: entry.helperId,
		helperRevision: entry.helperRevision,
		available: entry.helperId === 'lsp-references' ? lspAvailable : true,
		executorRevision: null,
		serviceRevision: null,
		observedAt: now,
		evidenceRefs: [`fixture-capability:${entry.helperId}`],
	}));
	return buildHelperCapabilitySnapshotReviewV2({ capabilitySnapshotRevision: `capability-${lspAvailable}`, registry, observations });
}

function fixtureRecognition(registry = fixtureRegistry()) {
	const { classification, domainClassification } = fixtureQuery();
	return buildKeywordRecognitionReviewV2({
		query: classification.rawQuery,
		classification,
		domainClassification,
		vocabularyRevision: 'fixture-vocab-1',
		vocabulary,
		registry,
	});
}

describe('AFC routing review v2 — isolated candidate contract', () => {
	it('keeps static registry facts separate from runtime availability and preserves executor/lane distinction', () => {
		const registry = fixtureRegistry();
		const semantic = registry.entries.filter((entry) => entry.logicalLane === 'dense');
		expect(semantic.map((entry) => entry.executor.id)).toEqual(['cuvs', 'qdrant']);
		expect(semantic.map((entry) => entry.logicalLane)).toEqual(['dense', 'dense']);
		expect(registry.entries.every((entry) => !('available' in entry))).toBe(true);
		expect(registry.entries.find((entry) => entry.helperId === 'lexical-owner')?.routerSignal).toBe('lexical_exact');
		expect(registry.writesPerformed).toBe(false);
		expect(registry.canonicalAuthority).toBe(false);
	});

	it('uses the canonical domain-taxonomy revision and does not promote classifier-only labels', () => {
		const registry = fixtureRegistry();
		const { classification, domainClassification } = fixtureQuery('mastra workflow and qdrant');
		const recognition = buildKeywordRecognitionReviewV2({ query: classification.rawQuery, classification, domainClassification, vocabularyRevision: 'fixture-vocab-1', vocabulary, registry });
		expect(recognition.domainTaxonomyRevision).toBe(DOMAIN_TAXONOMY_VERSION);
		expect(recognition.classificationDomainRefs.every((domain) => CANONICAL_DOMAINS.includes(domain))).toBe(true);
		expect(recognition.classificationDomainRefs).not.toContain('workflow');
		expect(recognition.classificationDomainRefs).not.toContain('parent-atlas');
	});

	it('fails closed if a purported domain-taxonomy result contains a noncanonical label', () => {
		const registry = fixtureRegistry();
		const { classification, domainClassification } = fixtureQuery();
		const invalidTaxonomyOutput = { ...domainClassification, secondary_domains: ['workflow'] };
		expect(() => buildKeywordRecognitionReviewV2({ query: classification.rawQuery, classification, domainClassification: invalidTaxonomyOutput, vocabularyRevision: 'fixture-vocab-1', vocabulary, registry })).toThrow('DOMAIN_TAXONOMY_EMITTED_NONCANONICAL_DOMAIN:workflow');
	});

	it('produces all three tri-state decisions without authorizing execution', () => {
		const registry = fixtureRegistry();
		const recognition = fixtureRecognition(registry);
		const eligibility = buildHelperEligibilityReviewV2({ registry, capabilitySnapshot: fixtureSnapshot(registry), keywordRecognition: recognition, retrievalPolicyRevision: 'retrieval-policy-fixture-1' });
		const byId = new Map(eligibility.entries.map((entry) => [entry.helperId, entry]));
		expect(byId.get('qdrant-semantic')?.state).toBe('ELIGIBLE');
		expect(byId.get('lsp-references')?.state).toBe('BLOCKED');
		expect(byId.get('lexical-owner')?.state).toBe('INELIGIBLE');
		expect(eligibility.executionAuthorized).toBe(false);
		expect(eligibility.executionPerformed).toBe(false);
		expect(eligibility.writesPerformed).toBe(false);
		expect(eligibility.canonicalAuthority).toBe(false);
	});

	it('capability changes alter eligibility only, leaving recognition and registry revisions intact', () => {
		const registry = fixtureRegistry();
		const recognition = fixtureRecognition(registry);
		const offline = fixtureSnapshot(registry, false);
		const online = fixtureSnapshot(registry, true);
		const base = { registry, keywordRecognition: recognition, retrievalPolicyRevision: 'retrieval-policy-fixture-1' };
		const offlineEligibility = buildHelperEligibilityReviewV2({ ...base, capabilitySnapshot: offline });
		const onlineEligibility = buildHelperEligibilityReviewV2({ ...base, capabilitySnapshot: online });
		expect(recognition.checksum).toBe(fixtureRecognition(registry).checksum);
		expect(offlineEligibility.checksum).not.toBe(onlineEligibility.checksum);
		expect(offlineEligibility.helperRegistryChecksum).toBe(onlineEligibility.helperRegistryChecksum);
	});

	it('rejects stale or tampered registry/capability/revision evidence', () => {
		const registry = fixtureRegistry();
		const recognition = fixtureRecognition(registry);
		const staleRegistry = fixtureRegistry();
		const snapshot = fixtureSnapshot(registry);
		const differentRegistry = fixtureRegistry('different-registry-revision');
		const differentSnapshot = buildHelperCapabilitySnapshotReviewV2({ capabilitySnapshotRevision: 'different-snapshot', registry: differentRegistry, observations: snapshot.observations });
		expect(() => buildHelperEligibilityReviewV2({ registry: staleRegistry, capabilitySnapshot: differentSnapshot, keywordRecognition: recognition, retrievalPolicyRevision: 'p1' })).toThrow('CAPABILITY_REGISTRY_IDENTITY_MISMATCH');
		const altered = { ...snapshot, observations: snapshot.observations.map((item) => ({ ...item, available: !item.available })) };
		expect(() => buildHelperEligibilityReviewV2({ registry, capabilitySnapshot: altered, keywordRecognition: recognition, retrievalPolicyRevision: 'p1' })).toThrow('HELPER_CAPABILITY_REVIEW_CHECKSUM_MISMATCH');
		const changedTaxonomy = { ...fixtureQuery().domainClassification, classifier_version: 'other-taxonomy' };
		const { classification } = fixtureQuery();
		expect(() => buildKeywordRecognitionReviewV2({ query: classification.rawQuery, classification, domainClassification: changedTaxonomy, vocabularyRevision: 'fixture-vocab-1', vocabulary, registry })).toThrow('DOMAIN_TAXONOMY_REVISION_MISMATCH');
	});
});
