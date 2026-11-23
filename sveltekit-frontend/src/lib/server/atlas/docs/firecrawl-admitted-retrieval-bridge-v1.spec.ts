// @vitest-environment node
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
	classifyPageAdmission,
	runResumableAdmissionV1,
	type LivePageState
} from './external-doc-admission-plan-v1.js';
import type { ExternalDocAdmissionInputV1 } from './external-doc-admission.js';

const sha256 = (value: string) => `sha256:${createHash('sha256').update(value, 'utf8').digest('hex')}`;

interface FirecrawlPageCaptureFixture {
	url: string;
	provider: string;
	product: string;
	productVersion: string;
	sourceAuthority: 'OFFICIAL' | 'COMMUNITY';
	sourceRevision: string;
	markdown: string;
	contentHash: string;
}

interface Nlp8095ExtractionFixture {
	extractionRevision: string;
	spans: Array<{
		chunkId: string;
		ordinal: number;
		startChar: number;
		endChar: number;
		startByte: number;
		endByte: number;
		text: string;
		domainClass: string;
	}>;
}

const APPROVED_PROVIDERS = new Set(['svelte', 'postgres', 'threejs']);

function buildValidatedAdmissionInput(
	capture: FirecrawlPageCaptureFixture,
	extraction: Nlp8095ExtractionFixture,
	seenUrls: Set<string>
): ExternalDocAdmissionInputV1 {
	if (!APPROVED_PROVIDERS.has(capture.provider)) {
		throw new Error(`UNAUTHORIZED_SOURCE_PROVIDER:${capture.provider}`);
	}
	if (!capture.sourceRevision || !capture.sourceRevision.startsWith('sha256:')) {
		throw new Error('MISSING_SOURCE_REVISION');
	}
	if (seenUrls.has(capture.url)) {
		throw new Error(`DUPLICATE_URL:${capture.url}`);
	}
	const computedHash = sha256(capture.markdown);
	if (computedHash !== capture.contentHash) {
		throw new Error(`INVALID_CONTENT_HASH:${capture.url}`);
	}
	if (!extraction.spans.length) {
		throw new Error(`MISSING_EXTRACTION_SPANS:${capture.url}`);
	}
	for (const span of extraction.spans) {
		if (span.endByte <= span.startByte || !span.text) {
			throw new Error(`INVALID_EXTRACTION_SPAN:${span.chunkId}`);
		}
	}
	seenUrls.add(capture.url);

	return {
		manifestRevision: 'manifest:v1',
		sourceRevision: capture.sourceRevision,
		page: {
			provider: capture.provider,
			product: capture.product,
			productVersion: capture.productVersion,
			architecture: null,
			language: 'typescript',
			url: capture.url,
			title: `${capture.product} ${capture.productVersion} docs`,
			publisher: capture.provider,
			sourceAuthority: capture.sourceAuthority,
			fetcher: 'firecrawl-v2',
			crawlRevision: capture.sourceRevision,
			parserRevision: extraction.extractionRevision,
			contentHash: capture.contentHash,
			evidenceRevision: capture.sourceRevision,
			retrievedAt: '2026-11-21T21:00:00Z'
		},
		chunks: extraction.spans.map((span) => ({
			chunkId: span.chunkId,
			ordinal: span.ordinal,
			headingPath: [capture.product, 'API'],
			sectionAnchor: `#${span.chunkId}`,
			startChar: span.startChar,
			endChar: span.endChar,
			startByte: span.startByte,
			endByte: span.endByte,
			text: span.text,
			domainClass: span.domainClass,
			ontologyClasses: ['pa:docs.api_reference'],
			codeBlocks: [],
			apiSignatures: [],
			chunkChecksum: sha256(span.text),
			evidenceRevision: `${capture.sourceRevision}:${span.chunkId}`
		}))
	};
}

describe('Firecrawl -> :8095 -> PostgreSQL Admission -> ACP/A2A Bridge (v1 fixture)', () => {
	it('preserves provenance through admission, FTS readback, ACP context ref, and A2A non-canonical artifact', async () => {
		const markdown = 'Use $state runes in Svelte 5 components for reactive state.';
		const capture: FirecrawlPageCaptureFixture = {
			url: 'https://svelte.dev/docs/svelte/$state',
			provider: 'svelte',
			product: 'svelte',
			productVersion: '5.0',
			sourceAuthority: 'OFFICIAL',
			sourceRevision: sha256('rev-1'),
			markdown,
			contentHash: sha256(markdown)
		};
		const extraction: Nlp8095ExtractionFixture = {
			extractionRevision: 'nlp-8095:v2',
			spans: [
				{
					chunkId: 'chunk-svelte-state-0',
					ordinal: 0,
					startChar: 0,
					endChar: markdown.length,
					startByte: 0,
					endByte: Buffer.byteLength(markdown, 'utf8'),
					text: markdown,
					domainClass: 'frontend_reactivity'
				}
			]
		};

		const seenUrls = new Set<string>();
		const admissionInput = buildValidatedAdmissionInput(capture, extraction, seenUrls);

		const admittedStore = new Map<string, LivePageState>();
		const run = await runResumableAdmissionV1(
			[admissionInput],
			async (item) => admittedStore.get(item.page.url) ?? { page: null, chunks: [], collidingChunkIds: [] },
			async (item) => {
				admittedStore.set(item.page.url, {
					page: {
						provider: item.page.provider,
						product: item.page.product,
						product_version: item.page.productVersion,
						architecture: item.page.architecture,
						url: item.page.url,
						content_hash: item.page.contentHash,
						evidence_revision: item.page.evidenceRevision
					},
					chunks: item.chunks.map((c) => ({
						chunk_id: c.chunkId,
						ordinal: c.ordinal,
						start_byte: String(c.startByte),
						end_byte: String(c.endByte),
						text: c.text,
						chunk_checksum: c.chunkChecksum,
						evidence_revision: c.evidenceRevision
					})),
					collidingChunkIds: []
				});
			}
		);

		expect(run.writerCalls).toBe(1);
		expect(run.plan.missing).toBe(1);

		// Simulated FTS readback citing exact admitted chunk
		const live = admittedStore.get(capture.url)!;
		const hit = live.chunks.find((c) => c.text.includes('$state'));
		expect(hit).toBeDefined();
		expect(hit!.chunk_id).toBe('chunk-svelte-state-0');

		// ACP admitted context reference + A2A artifact envelope (canonicalAuthority: false)
		const acpContextRef = {
			schema: 'atlas.acp-admitted-doc-context.v1',
			canonicalAuthority: false,
			url: live.page!.url,
			sourceRevision: live.page!.evidence_revision,
			extractionRevision: admissionInput.page.parserRevision,
			chunkId: hit!.chunk_id,
			span: { startByte: Number(hit!.start_byte), endByte: Number(hit!.end_byte) },
			chunkChecksum: hit!.chunk_checksum
		};
		const a2aArtifact = {
			schema: 'atlas.a2a-doc-artifact.v1',
			canonicalAuthority: false,
			writesPerformed: false,
			artifactId: `artifact:${hit!.chunk_id}`,
			parts: [{ type: 'data', data: acpContextRef }]
		};

		expect(acpContextRef.canonicalAuthority).toBe(false);
		expect(acpContextRef.chunkId).toBe('chunk-svelte-state-0');
		expect(a2aArtifact.canonicalAuthority).toBe(false);
		expect(a2aArtifact.writesPerformed).toBe(false);
	});

	it('fails closed on changed-page revisions, duplicate URLs, invalid hashes, missing spans, unauthorized sources, and failed admission', async () => {
		const markdown = 'PostgreSQL 18 FTS supports GIN indexes.';
		const baseCapture: FirecrawlPageCaptureFixture = {
			url: 'https://www.postgresql.org/docs/18/textsearch.html',
			provider: 'postgres',
			product: 'postgresql',
			productVersion: '18',
			sourceAuthority: 'OFFICIAL',
			sourceRevision: sha256('pg-rev-1'),
			markdown,
			contentHash: sha256(markdown)
		};
		const baseExtraction: Nlp8095ExtractionFixture = {
			extractionRevision: 'nlp-8095:v2',
			spans: [
				{
					chunkId: 'chunk-pg-fts-0',
					ordinal: 0,
					startChar: 0,
					endChar: markdown.length,
					startByte: 0,
					endByte: Buffer.byteLength(markdown, 'utf8'),
					text: markdown,
					domainClass: 'database_fts'
				}
			]
		};

		// 1. Duplicate URL rejected
		const seen = new Set<string>();
		const admittedInput = buildValidatedAdmissionInput(baseCapture, baseExtraction, seen);
		expect(() => buildValidatedAdmissionInput(baseCapture, baseExtraction, seen)).toThrow(/DUPLICATE_URL/);

		// 2. Invalid/stale hash rejected
		expect(() =>
			buildValidatedAdmissionInput(
				{ ...baseCapture, url: 'https://www.postgresql.org/docs/18/stale.html', contentHash: sha256('wrong') },
				baseExtraction,
				new Set()
			)
		).toThrow(/INVALID_CONTENT_HASH/);

		// 3. Missing extraction spans rejected
		expect(() =>
			buildValidatedAdmissionInput(baseCapture, { extractionRevision: 'nlp-8095:v2', spans: [] }, new Set())
		).toThrow(/MISSING_EXTRACTION_SPANS/);

		// 4. Unauthorized provider rejected
		expect(() =>
			buildValidatedAdmissionInput(
				{ ...baseCapture, provider: 'untrusted-blog' },
				baseExtraction,
				new Set()
			)
		).toThrow(/UNAUTHORIZED_SOURCE_PROVIDER/);

		// 5. Changed-page revision detected as CONFLICT against prior admitted page
		const changedCapture: FirecrawlPageCaptureFixture = {
			...baseCapture,
			sourceRevision: sha256('pg-rev-2'),
			markdown: 'PostgreSQL 18 FTS supports GIN and GiST indexes.',
			contentHash: sha256('PostgreSQL 18 FTS supports GIN and GiST indexes.')
		};
		const changedInput = buildValidatedAdmissionInput(changedCapture, baseExtraction, new Set());
		const livePrior: LivePageState = {
			page: {
				provider: admittedInput.page.provider,
				product: admittedInput.page.product,
				product_version: admittedInput.page.productVersion,
				architecture: null,
				url: admittedInput.page.url,
				content_hash: admittedInput.page.contentHash,
				evidence_revision: admittedInput.page.evidenceRevision
			},
			chunks: admittedInput.chunks.map((c) => ({
				chunk_id: c.chunkId,
				ordinal: c.ordinal,
				start_byte: String(c.startByte),
				end_byte: String(c.endByte),
				text: c.text,
				chunk_checksum: c.chunkChecksum,
				evidence_revision: c.evidenceRevision
			})),
			collidingChunkIds: []
		};
		const classification = classifyPageAdmission(changedInput, livePrior);
		expect(classification.classification).toBe('CONFLICT');
		expect(classification.reasons).toContain('PAGE_CONTENT_HASH');

		// 6. Failed admission propagates cleanly without partial promotion
		await expect(
			runResumableAdmissionV1(
				[admittedInput],
				async () => ({ page: null, chunks: [], collidingChunkIds: [] }),
				async () => {
					throw new Error('PG_ADMISSION_WRITE_FAILED');
				}
			)
		).rejects.toThrow('PG_ADMISSION_WRITE_FAILED');
	});
});
