import test from 'node:test';
import assert from 'node:assert/strict';
import { summarySearchCensusRowV1Schema } from '../dist/core/summary-search-census-v1.js';

const sha = 'sha256:' + 'a'.repeat(64);
const bound = {
	schema: 'atlas.summary-search-census-row.v1', ordinal: 0,
	identity: { chunkRowId: '00000000-0000-4000-8000-000000000001', canonicalChunkId: 'chunk:src/a.ts:1', packetKey: 'packet:a', sourceRef: 'src/a.ts', sourceRevision: sha, workspaceRevision: sha, observedSourceRef: 'src/a.ts', observedPacketKey: 'packet:a', state: 'REVISION_QUALIFIED' },
	summary: { source: 'LEGACY_CHUNK_SUMMARY', text: 'A grounded legacy hint.', digest: sha, byteLength: 23, state: 'LEGACY_HINT_LINEAGE_BOUND', qualityClean: true, quarantined: false, detectorRevision: 'summary-quality-v1' },
	representation: { representationId: 'semantic_768', canonicalSummaryVectorAvailable: false, legacyVectorPresent: false, hintRepresentationAvailable: false, hintRepresentationRef: null, hintVectorDigest: null, representationRevision: null },
	routing: { domainClass: null, language: 'typescript', fileKind: '.ts', communityId: null, clusterId: null, somCell: null, pageRank: null, provenance: 'UNVERSIONED_PROJECTION_HINT' },
	evidenceRefs: ['codebase_chunk_index:id=00000000-0000-4000-8000-000000000001'], canonicalAuthority: false,
};

test('accepts exact-lineage legacy summary only as noncanonical hint with exact bytes', () => {
	assert.equal(summarySearchCensusRowV1Schema.parse(bound).summary.state, 'LEGACY_HINT_LINEAGE_BOUND');
});

test('rejects unqualified row carrying canonical identity fields', () => {
	const value = structuredClone(bound);
	value.identity.state = 'LEGACY_IDENTITY_UNQUALIFIED';
	value.identity.sourceRevision = null;
	assert.equal(summarySearchCensusRowV1Schema.safeParse(value).success, false);
});

test('quarantine cannot be bypassed by a clean quality detector', () => {
	const value = structuredClone(bound);
	value.summary.state = 'QUARANTINED';
	value.summary.quarantined = true;
	value.summary.qualityClean = true;
	assert.equal(summarySearchCensusRowV1Schema.safeParse(value).success, true);
	assert.equal(summarySearchCensusRowV1Schema.parse(value).summary.state, 'QUARANTINED');
});

test('never permits legacy vector to count as canonical summary representation', () => {
	const value = structuredClone(bound);
	value.representation.canonicalSummaryVectorAvailable = true;
	assert.equal(summarySearchCensusRowV1Schema.safeParse(value).success, false);
});

test('checks exact UTF-8 byte length and rejects authority promotion', () => {
	const wrongBytes = structuredClone(bound);
	wrongBytes.summary.byteLength++;
	assert.equal(summarySearchCensusRowV1Schema.safeParse(wrongBytes).success, false);
	const promoted = structuredClone(bound);
	promoted.canonicalAuthority = true;
	assert.equal(summarySearchCensusRowV1Schema.safeParse(promoted).success, false);
});
