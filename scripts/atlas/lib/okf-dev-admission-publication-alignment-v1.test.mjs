import test from 'node:test';
import assert from 'node:assert/strict';
import { alignOkfPublishedPagesToAdmissionEnvelopesV1 } from './okf-dev-admission-publication-alignment-v1.mjs';

const hashA = 'a'.repeat(64);
const hashB = 'b'.repeat(64);
const entry = { source_id: 'networkx-python', url: 'https://networkx.org/docs/stable/', content_hash: hashA };
const envelope = (contentHash = hashA) => ({ sourceId: entry.source_id, page: { url: entry.url, contentHash } });

test('matches only exact source id, URL, and published content hash', () => {
	assert.deepEqual(alignOkfPublishedPagesToAdmissionEnvelopesV1([entry], [envelope()]), {
		result: 'OKF_ADMISSION_ALIGNMENT_MATCHED', matchedPages: 1, blockers: []
	});
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
	assert.equal(result.matchedPages, 1);
});

test('fails closed on missing provenance identity fields', () => {
	const result = alignOkfPublishedPagesToAdmissionEnvelopesV1([entry], [{ sourceId: entry.source_id, page: { url: entry.url } }]);
	assert.equal(result.result, 'OKF_ADMISSION_ALIGNMENT_BLOCKED');
	assert.equal(result.blockers[0].code, 'ADMISSION_ENVELOPE_IDENTITY_INCOMPLETE');
});
