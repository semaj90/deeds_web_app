// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { canonicalSha256V1 } from '../prefill/canonical-hash-v1.js';
import {
	chunkEvidenceRevisionV1,
	toExternalDocAdmissionInputV1,
	validateExternalDocAdmissionHandoff
} from './external-doc-intelligence-contracts-v1.js';
import {
	classifyPageAdmission,
	loadLivePageState,
	type LivePageState,
	type LivePageRow,
	type LiveChunkRow
} from './external-doc-admission-plan-v1.js';
import type { ExternalDocAdmissionInputV1 } from './external-doc-admission.js';
import {
	prepareVersionedRecrawlBatchV2,
	reconcileVersionedRecrawlAdmissionV2,
	matchesExpectedExternalDocChunkIdentityV2,
	type ManifestRecrawlDeltaV1
} from './external-doc-versioned-recrawl-admission-v2.js';

function makeEnvelope(sourceId: string, productVersion: string, suffix: string) {
	const text = 'same bytes';
	const chunkChecksum = createHash('sha256').update(text, 'utf8').digest('hex');
	const pageEvidenceRevision = `sha256:${suffix.repeat(64 / suffix.length)}`;
	const chunk = { ordinal: 0, startByte: 0, endByte: Buffer.byteLength(text, 'utf8'), chunkChecksum };
	const evidenceRevision = chunkEvidenceRevisionV1(pageEvidenceRevision, chunk);
	const chunkId = productVersion === '0.8.0'
		? `doc:${suffix}:${'b'.repeat(64)}`
		: `doc:v2:${canonicalSha256V1({ schema: 'atlas.external-doc-chunk-identity.v2', sourceId, chunkEvidenceRevision: evidenceRevision })}`;
	return {
		manifestRevision: productVersion === '0.8.0' ? 'm1' : 'm2', sourceRevision: `source-${suffix}`, sourceId,
		authorityClass: 'OFFICIAL_PRIMARY', versionQualification: 'EXACT_VERSION' as const,
		page: {
			provider: 'pgvector', product: 'pgvector', productVersion, architecture: null, language: 'sql',
			url: 'https://github.com/pgvector/pgvector', title: 'pgvector', publisher: null, sourceAuthority: 'OFFICIAL' as const,
			fetcher: 'BEAUTIFULSOUP_HTTP', crawlRevision: `source-${suffix}`, parserRevision: 'beautifulsoup4/html.parser',
			contentHash: chunkChecksum, evidenceRevision: pageEvidenceRevision, retrievedAt: '2026-09-24T00:00:00Z'
		},
		chunks: [{
			chunkId, ordinal: 0, headingPath: [], sectionAnchor: null,
			startChar: 0, endChar: text.length, startByte: 0, endByte: Buffer.byteLength(text, 'utf8'), text,
			domainClass: 'database', ontologyClasses: [], codeBlocks: [], apiSignatures: [], chunkChecksum,
			evidenceRevision
		}]
	};
}

function stableJson(value: unknown): string {
	if (value === null || typeof value !== 'object') return JSON.stringify(value);
	if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
	const record = value as Record<string, unknown>;
	return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(',')}}`;
}

const deltaBase: Omit<ManifestRecrawlDeltaV1, 'planChecksum'> = {
	schema: 'atlas.external-doc-manifest-recrawl-delta.v1', previousManifestRevision: 'm1', currentManifestRevision: 'm2',
	entries: [{ sourceId: 'pgvector', previousSourceId: 'pgvector', decision: 'PRODUCT_VERSION_CHANGED', fromProductVersion: '0.8.0', toProductVersion: '0.9.0', chunkIdentityVersion: 'V2' }],
	selectedSourceIds: ['pgvector'], retainedRemovedSourceIds: [], blockers: [], canAcquire: true, canonicalAuthority: false,
};
const versionDelta: ManifestRecrawlDeltaV1 = {
	...deltaBase,
	planChecksum: createHash('sha256').update(stableJson(deltaBase), 'utf8').digest('hex')
};

describe('DOC-26 versioned recrawl planning (read-only fake pool)', () => {
	it('matches the Python plan_manifest_recrawl_delta_v1 stable-JSON checksum golden', () => {
		expect(versionDelta.planChecksum).toBe('3706807e6730f200e2d0607be0e43ed938ad872d2d580b6403d8e70bf0b79c58');
	});

	it('recomputes the Python V2 chunk-ID golden and rejects placeholders', () => {
		expect(matchesExpectedExternalDocChunkIdentityV2(
			'pgvector',
			`sha256:${'a'.repeat(64)}`,
			'doc:v2:ea705e10d0c3c2a277392431c29151c82e7d7b302422308a896dd6e0ab48b145'
		)).toBe(true);
		expect(matchesExpectedExternalDocChunkIdentityV2('pgvector', `sha256:${'a'.repeat(64)}`, `doc:v2:${'0'.repeat(64)}`)).toBe(false);
		expect(matchesExpectedExternalDocChunkIdentityV2('pgvector', 'workspace:0', 'doc:v2:anything')).toBe(false);
	});

	it('joins a safe delta to V2 current envelopes and exact prior-version envelopes', () => {
		const prior = makeEnvelope('pgvector', '0.8.0', 'a');
		const current = makeEnvelope('pgvector', '0.9.0', 'c');
		const batch = prepareVersionedRecrawlBatchV2(versionDelta, [prior], [current]);
		expect(batch.selectedSourceIds).toEqual(['pgvector']);
		expect(batch.versionTransitions).toEqual([{ sourceId: 'pgvector', from: '0.8.0', to: '0.9.0' }]);
		expect(batch.prior[0]?.page.productVersion).toBe('0.8.0');
		expect(batch.current[0]?.page.productVersion).toBe('0.9.0');
		expect(batch.current[0]?.chunks[0]?.chunkId).toMatch(/^doc:v2:[a-f0-9]{64}$/);
	});

	it('fails closed when the prior cohort or exact target version is missing', () => {
		const current = makeEnvelope('pgvector', '0.9.0', 'c');
		expect(() => prepareVersionedRecrawlBatchV2(versionDelta, [], [current])).toThrow(/PRIOR_VERSION_ENVELOPE_MISSING/);
		expect(() => prepareVersionedRecrawlBatchV2(versionDelta, [makeEnvelope('pgvector', '0.8.0', 'a')], [makeEnvelope('pgvector', '1.0.0', 'c')])).toThrow(/CURRENT_VERSION_ENVELOPE_MISMATCH/);
	});

	it('rejects a version-transition envelope that declares V2 but carries a placeholder chunk ID', () => {
		const current = makeEnvelope('pgvector', '0.9.0', 'c');
		const malformed = {
			...current,
			chunks: [{ ...current.chunks[0]!, chunkId: `doc:v2:${'0'.repeat(64)}` }]
		};
		expect(() => prepareVersionedRecrawlBatchV2(versionDelta, [makeEnvelope('pgvector', '0.8.0', 'a')], [malformed]))
			.toThrow(/DOC_RECRAWL_CURRENT_CHUNK_ID_V2_MISMATCH/);
	});

	it('rejects a changed delta plan when its Python stable-JSON checksum no longer matches', () => {
		const current = makeEnvelope('pgvector', '0.9.0', 'c');
		expect(() => prepareVersionedRecrawlBatchV2({ ...versionDelta, selectedSourceIds: [] }, [makeEnvelope('pgvector', '0.8.0', 'a')], [current])).toThrow(/DELTA_CHECKSUM_MISMATCH/);
	});

	it('composes the delta batch with read-only exact admission checks and invokes no writer', async () => {
		const old = makeEnvelope('pgvector', '0.8.0', 'a');
		const next = makeEnvelope('pgvector', '0.9.0', 'c');
		const batch = prepareVersionedRecrawlBatchV2(versionDelta, [old], [next]);
		const oldInput = toExternalDocAdmissionInputV1(old);
		const oldPage = { id: 'old-page', provider: 'pgvector', product: 'pgvector', product_version: '0.8.0', architecture: null,
			url: old.page.url, content_hash: old.page.contentHash, evidence_revision: old.page.evidenceRevision };
		const oldChunks = oldInput.chunks.map((chunk) => ({ page_id: 'old-page', chunk_id: chunk.chunkId, ordinal: chunk.ordinal,
			start_byte: String(chunk.startByte), end_byte: String(chunk.endByte), text: chunk.text, chunk_checksum: chunk.chunkChecksum,
			evidence_revision: chunk.evidenceRevision }));
		const statements: string[] = [];
		const pool = { async query(sql: string, values: unknown[] = []) {
			statements.push(sql.trim());
			if (sql.includes('FROM atlas_external_doc_pages')) {
				const [provider, product, version, url, revision] = values as string[];
				return { rows: [oldPage].filter((row) => (row.provider === provider && row.product === product && row.product_version === version && row.url === url) || row.evidence_revision === revision) };
			}
			if (sql.includes('FROM atlas_external_doc_chunks WHERE page_id')) return { rows: oldChunks.filter((row) => row.page_id === values[0]) };
			if (sql.includes('chunk_id = ANY')) return { rows: oldChunks.filter((row) => (values[0] as string[]).includes(row.chunk_id) || (values[1] as string[]).includes(row.evidence_revision)) };
			throw new Error('UNEXPECTED_QUERY_IN_READ_ONLY_TEST');
		} };
		const result = await reconcileVersionedRecrawlAdmissionV2(pool as never, batch, 'PLAN_ONLY');
		expect(result.result).toBe('PLAN_ONLY');
		expect(result.priorPlan.alreadyAdmitted).toBe(1);
		expect(result.currentPlan.missing).toBe(1);
		expect(result.writerCalls).toBe(0);
		expect(result.priorPreserved).toBeNull();
		expect(result.priorSnapshotBeforeChecksum).toMatch(/^[a-f0-9]{64}$/);
		expect(result.priorSnapshotAfterChecksum).toBeNull();
		expect(statements.every((sql) => /^SELECT\b/.test(sql))).toBe(true);
		const repeated = await reconcileVersionedRecrawlAdmissionV2(pool as never, batch, 'PLAN_ONLY');
		expect(repeated.priorSnapshotBeforeChecksum).toBe(result.priorSnapshotBeforeChecksum);
		oldChunks[0]!.text = 'mutated prior row';
		const conflicted = await reconcileVersionedRecrawlAdmissionV2(pool as never, batch, 'PLAN_ONLY');
		expect(conflicted.result).toBe('CONFLICT');
		expect(conflicted.priorPlan.conflicts).toBe(1);
		expect(conflicted.writerCalls).toBe(0);
	});

	it('plans a new version as MISSING without changing the prior-version snapshot', async () => {
		const priorPage: LivePageRow = {
			provider: 'pgvector', product: 'pgvector', product_version: '0.8.0', architecture: null,
			url: 'https://github.com/pgvector/pgvector', content_hash: 'sha256:old-page', evidence_revision: 'sha256:old-revision'
		};
		const priorChunk: LiveChunkRow = {
			chunk_id: 'doc:pgvector:legacy-content-hash:0', ordinal: 0, start_byte: '0', end_byte: '10',
			text: 'same bytes', chunk_checksum: 'sha256:chunk', evidence_revision: 'sha256:old-chunk-revision'
		};
		const priorSnapshot = structuredClone({ page: priorPage, chunks: [priorChunk] });
		const storedPages = [{ ...priorPage, id: 'prior-page' }];
		const storedChunks = [{ ...priorChunk, page_id: 'prior-page' }];
		const expected: ExternalDocAdmissionInputV1 = {
			manifestRevision: 'manifest-r2', sourceRevision: 'source-r2',
			page: {
				provider: 'pgvector', product: 'pgvector', productVersion: '0.9.0', architecture: null, language: 'sql',
				url: priorPage.url, title: 'pgvector', publisher: null, sourceAuthority: 'OFFICIAL', fetcher: 'BEAUTIFULSOUP_HTTP',
				crawlRevision: 'source-r2', parserRevision: 'beautifulsoup4/html.parser', contentHash: 'sha256:new-page',
				evidenceRevision: 'sha256:new-revision', retrievedAt: '2026-09-24T00:00:00Z'
			},
			chunks: [{
				chunkId: 'doc:v2:version-qualified-chunk-id', ordinal: 0, headingPath: [], sectionAnchor: null,
				startChar: 0, endChar: 10, startByte: 0, endByte: 10, text: 'same bytes', domainClass: 'database',
				ontologyClasses: [], codeBlocks: [], apiSignatures: [], chunkChecksum: 'sha256:chunk',
				evidenceRevision: 'sha256:new-chunk-revision'
			}]
		};
		const statements: string[] = [];
		const pool = {
			async query(sql: string, params: unknown[]) {
				statements.push(sql.trim());
				if (sql.includes('FROM atlas_external_doc_pages')) {
					// Model the production WHERE identity OR evidence_revision predicate; the prior
					// 0.8.0 row is present but must not match the expected 0.9.0 page.
					const [provider, product, version, url, evidenceRevision] = params as string[];
					return {
						rows: storedPages.filter((row) =>
							(row.provider === provider && row.product === product && row.product_version === version && row.url === url)
							|| row.evidence_revision === evidenceRevision
						)
					};
				}
				if (sql.includes('FROM atlas_external_doc_chunks WHERE page_id')) {
					return { rows: storedChunks.filter((row) => row.page_id === params[0]) };
				}
				if (sql.includes('chunk_id = ANY')) {
					// The versioned V2 ID and evidence revision do not collide with V1.
					const expectedIds = params[0] as string[];
					const expectedRevisions = params[1] as string[];
					return { rows: storedChunks.filter((row) => expectedIds.includes(row.chunk_id) || expectedRevisions.includes(row.evidence_revision)) };
				}
				throw new Error('UNEXPECTED_QUERY_IN_READ_ONLY_TEST');
			}
		};

		const live = await loadLivePageState(pool as never, expected);
		expect(classifyPageAdmission(expected, live)).toEqual({ classification: 'MISSING', reasons: [] });
		expect(statements).toHaveLength(2);
		expect(statements.every((sql) => /^SELECT\b/.test(sql))).toBe(true);
		expect(structuredClone({ page: storedPages[0], chunks: storedChunks })).toEqual({
			page: { ...priorSnapshot.page, id: 'prior-page' },
			chunks: [{ ...priorSnapshot.chunks[0], page_id: 'prior-page' }]
		});
	});

	it('passes a version-scoped chunk ID through the existing admission handoff unchanged', () => {
		const text = 'same bytes';
		const chunkChecksum = createHash('sha256').update(text, 'utf8').digest('hex');
		const pageEvidenceRevision = `sha256:${'a'.repeat(64)}`;
		const chunk = { ordinal: 0, startByte: 0, endByte: Buffer.byteLength(text, 'utf8'), chunkChecksum };
		const versionedChunkId = `doc:v2:${'c'.repeat(64)}`;
		const envelope = {
			manifestRevision: 'manifest-r2', sourceRevision: 'source-r2', sourceId: 'pgvector',
			authorityClass: 'OFFICIAL_PRIMARY', versionQualification: 'EXACT_VERSION' as const,
			page: {
				provider: 'pgvector', product: 'pgvector', productVersion: '0.9.0', architecture: null, language: 'sql',
				url: 'https://github.com/pgvector/pgvector', title: 'pgvector', publisher: null, sourceAuthority: 'OFFICIAL' as const,
				fetcher: 'BEAUTIFULSOUP_HTTP', crawlRevision: 'source-r2', parserRevision: 'beautifulsoup4/html.parser',
				contentHash: createHash('sha256').update(text, 'utf8').digest('hex'),
				evidenceRevision: pageEvidenceRevision, retrievedAt: '2026-09-24T00:00:00Z'
			},
			chunks: [{
				chunkId: versionedChunkId, ordinal: 0, headingPath: [], sectionAnchor: null,
				startChar: 0, endChar: text.length, startByte: 0, endByte: Buffer.byteLength(text, 'utf8'), text,
				domainClass: 'database', ontologyClasses: [], codeBlocks: [], apiSignatures: [], chunkChecksum,
				evidenceRevision: chunkEvidenceRevisionV1(pageEvidenceRevision, chunk)
			}]
		};

		const handoff = validateExternalDocAdmissionHandoff([envelope], { nativeChunks: 1, nativeChunksWithoutDocCoordinate: 0 });
		expect(handoff.result).toBe('EXTERNAL_DOC_ADMISSION_HANDOFF_READY');
		expect(handoff.blockers).toEqual([]);
		expect(toExternalDocAdmissionInputV1(envelope).chunks[0]?.chunkId).toBe(versionedChunkId);
	});
});
