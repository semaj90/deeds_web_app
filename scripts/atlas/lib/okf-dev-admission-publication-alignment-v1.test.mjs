import test from 'node:test';
import assert from 'node:assert/strict';
import { alignOkfPublishedPagesToAdmissionEnvelopesV1 } from './okf-dev-admission-publication-alignment-v1.mjs';

const hashA = 'a'.repeat(64);
const hashB = 'b'.repeat(64);
const entry = {
	source_id: 'networkx-python', source_ref: 'local:networkx:stable', content_hash: hashA,
	content_hash_kind: 'NORMALIZED_MARKDOWN_SHA256_V1', url: 'https://networkx.org/docs/stable/',
	doc_coordinate: { provider: 'networkx', product: 'networkx', product_version: 'stable@2026-10-11', url: 'https://networkx.org/docs/stable/' },
};
const envelope = (contentHash = hashA) => ({ sourceId: entry.source_id, page: {
	provider: 'networkx', product: 'networkx', productVersion: 'stable@2026-10-11',
	url: entry.url, contentHash, contentHashKind: entry.content_hash_kind,
} });

test('matches only exact source id, URL, and published content hash', () => {
	assert.deepEqual(alignOkfPublishedPagesToAdmissionEnvelopesV1([entry], [envelope()]), {
		result: 'OKF_ADMISSION_ALIGNMENT_MATCHED',
		matchedPages: 1,
		coverage: {
			publishedPages: 1,
			admissionEnvelopes: 1,
			exactIdentityMatches: 1,
			contentHashMismatches: [],
			candidateLocatorMatches: [{ sourceId: 'networkx-python', url: 'https://networkx.org/docs/stable/' }],
			unqualifiedDocumentCoordinates: [],
			unqualifiedDigestComparisons: [],
			publishedPagesWithoutEnvelope: [],
			envelopesWithoutPublishedPage: [],
			sourceCoverage: [{
				sourceId: 'networkx-python',
				publishedPages: 1,
				admissionEnvelopes: 1,
				exactIdentityMatches: 1,
				contentHashMismatches: 0,
				publishedPagesWithoutEnvelope: 0,
				envelopesWithoutPublishedPage: 0,
			}],
		},
		blockers: []
	});
});

test('blocks published pages without a matching admission envelope', () => {
	const additionalPage = { ...entry, source_id: 'redis-valkey', url: 'https://valkey.io/docs/' };
	const result = alignOkfPublishedPagesToAdmissionEnvelopesV1([entry, additionalPage], [envelope()]);
	assert.equal(result.result, 'OKF_ADMISSION_ALIGNMENT_BLOCKED');
	assert.deepEqual(result.coverage.publishedPagesWithoutEnvelope, [
		{ sourceId: 'redis-valkey', url: 'https://valkey.io/docs/' }
	]);
	assert.ok(result.blockers.some((blocker) => blocker.code === 'ADMISSION_ENVELOPE_MISSING_FOR_PUBLISHED_PAGE'));
});

test('reports source coverage without aliasing source IDs or URLs', () => {
	const alternateSourceEnvelope = {
		sourceId: 'nx-docs',
		page: { url: entry.url, contentHash: hashA },
	};
	const result = alignOkfPublishedPagesToAdmissionEnvelopesV1([entry], [alternateSourceEnvelope]);
	assert.deepEqual(result.coverage.sourceCoverage, [
		{
			sourceId: 'networkx-python',
			publishedPages: 1,
			admissionEnvelopes: 0,
			exactIdentityMatches: 0,
			contentHashMismatches: 0,
			publishedPagesWithoutEnvelope: 1,
			envelopesWithoutPublishedPage: 0,
		},
		{
			sourceId: 'nx-docs',
			publishedPages: 0,
			admissionEnvelopes: 1,
			exactIdentityMatches: 0,
			contentHashMismatches: 0,
			publishedPagesWithoutEnvelope: 0,
			envelopesWithoutPublishedPage: 1,
		},
	]);
});

test('does not accept a sibling URL as the same published page', () => {
	const result = alignOkfPublishedPagesToAdmissionEnvelopesV1([entry], [
		{ sourceId: entry.source_id, page: { url: 'https://networkx.org/docs/stable/reference/', contentHash: hashA } }
	]);
	assert.equal(result.result, 'OKF_ADMISSION_ALIGNMENT_BLOCKED');
	assert.equal(result.blockers[0].code, 'PUBLISHED_PAGE_NOT_FOUND_FOR_ENVELOPE');
});

test('rejects stale content hashes and duplicate identities', () => {
	const result = alignOkfPublishedPagesToAdmissionEnvelopesV1([entry, entry], [envelope(hashB), envelope()]);
	assert.equal(result.result, 'OKF_ADMISSION_ALIGNMENT_BLOCKED');
	assert.ok(result.blockers.some((blocker) => blocker.code === 'PUBLISHED_PAGE_IDENTITY_DUPLICATE'));
	assert.ok(result.blockers.some((blocker) => blocker.code === 'PUBLISHED_PAGE_CONTENT_HASH_MISMATCH'));
	assert.ok(result.blockers.some((blocker) => blocker.code === 'ADMISSION_ENVELOPE_IDENTITY_DUPLICATE'));
	assert.equal(result.coverage.contentHashMismatches.length, 1);
	assert.equal(result.matchedPages, 1);
});

test('fails closed on missing provenance identity fields', () => {
	const result = alignOkfPublishedPagesToAdmissionEnvelopesV1([entry], [{ sourceId: entry.source_id, page: { url: entry.url } }]);
	assert.equal(result.result, 'OKF_ADMISSION_ALIGNMENT_BLOCKED');
	assert.equal(result.blockers[0].code, 'ADMISSION_ENVELOPE_IDENTITY_INCOMPLETE');
});

test('does not compare hashes when digest representation is absent or differs', () => {
	const candidate = envelope();
	delete candidate.page.contentHashKind;
	const result = alignOkfPublishedPagesToAdmissionEnvelopesV1([entry], [candidate]);
	assert.equal(result.result, 'OKF_ADMISSION_ALIGNMENT_BLOCKED');
	assert.equal(result.coverage.contentHashMismatches.length, 0);
	assert.equal(result.coverage.unqualifiedDigestComparisons.length, 1);
	assert.ok(result.blockers.some((blocker) => blocker.code === 'CONTENT_DIGEST_GRAIN_UNQUALIFIED'));
});

test('blocks mismatched DocCoordinate version before comparing page hashes', () => {
	const candidate = envelope(hashB);
	candidate.page.productVersion = 'stable@older';
	const result = alignOkfPublishedPagesToAdmissionEnvelopesV1([entry], [candidate]);
	assert.equal(result.result, 'OKF_ADMISSION_ALIGNMENT_BLOCKED');
	assert.equal(result.coverage.contentHashMismatches.length, 0);
	assert.equal(result.coverage.unqualifiedDocumentCoordinates.length, 1);
	assert.ok(result.blockers.some((blocker) => blocker.code === 'DOC_COORDINATE_UNAVAILABLE_OR_MISMATCHED'));
});

test('uses the canonical document coordinate rather than the local sourceRef locator', () => {
	const candidate = envelope();
	const alternateLocalRef = { ...entry, source_ref: 'local:alternate-label' };
	const result = alignOkfPublishedPagesToAdmissionEnvelopesV1([alternateLocalRef], [candidate]);
	assert.equal(result.result, 'OKF_ADMISSION_ALIGNMENT_MATCHED');
	assert.equal(result.coverage.candidateLocatorMatches.length, 1);
	assert.equal(result.coverage.exactIdentityMatches, 1);
	assert.equal(result.coverage.unqualifiedDocumentCoordinates.length, 0);
});
