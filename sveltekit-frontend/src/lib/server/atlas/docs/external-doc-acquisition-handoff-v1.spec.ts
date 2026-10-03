import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
	admitExternalDocPage,
	buildExternalDocAcquisitionHandoffV1,
	type ExternalDocAdmissionInputV1,
	type ExternalDocAdmissionReceiptV1,
} from './external-doc-admission.js';
import type { AcquisitionResultV1, ExtractionResultV1 } from '../acquisition/contracts.js';
import type { Pool } from 'pg';

const sha256 = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const fetchId = '10000000-0000-4000-8000-000000000001';
const sourceRevisionId = '20000000-0000-4000-8000-000000000002';
const pageId = '30000000-0000-4000-8000-000000000003';
const canonicalText = 'café section\nsecond β';
const canonicalBytes = Buffer.from(canonicalText, 'utf8');
const firstText = 'café section';
const secondText = 'second β';
const firstEnd = Buffer.byteLength(firstText, 'utf8');
const secondStart = Buffer.byteLength(`${firstText}\n`, 'utf8');

function fixture() {
	const rawContentDigest = sha256('<html><p>café section</p><p>second β</p></html>');
	const normalizedTextDigest = sha256(canonicalBytes);
	const chunks: ExternalDocAdmissionInputV1['chunks'] = [
		{
			chunkId: 'chunk-0', ordinal: 0, headingPath: ['First'], sectionAnchor: 'first',
			startChar: 0, endChar: firstText.length, startByte: 0, endByte: firstEnd,
			text: firstText, domainClass: 'docs', ontologyClasses: [], codeBlocks: [], apiSignatures: [],
			chunkChecksum: sha256(firstText), evidenceRevision: 'chunk-revision-0',
		},
		{
			chunkId: 'chunk-1', ordinal: 1, headingPath: ['Second'], sectionAnchor: 'second',
			startChar: firstText.length + 1, endChar: canonicalText.length,
			startByte: secondStart, endByte: canonicalBytes.byteLength,
			text: secondText, domainClass: 'docs', ontologyClasses: [], codeBlocks: [], apiSignatures: [],
			chunkChecksum: sha256(secondText), evidenceRevision: 'chunk-revision-1',
		},
	];
	const page: ExternalDocAdmissionInputV1['page'] = {
		provider: 'synthetic', product: 'parent-atlas-fixture', productVersion: '1.0', architecture: 'x64',
		language: 'en', url: 'https://example.org/manual/1.0', title: 'Synthetic fixture', publisher: 'synthetic',
		sourceAuthority: 'OFFICIAL', fetcher: 'FIXTURE', crawlRevision: 'crawl-r1', parserRevision: 'parser-r1',
		contentHash: normalizedTextDigest, evidenceRevision: 'page-evidence-r1', retrievedAt: '2026-09-22T00:00:00.000Z',
	};
	const acquisition: AcquisitionResultV1 = {
		schemaVersion: 'atlas.acquisition.result.v1', eventId: '40000000-0000-4000-8000-000000000004',
		researchRunId: '50000000-0000-4000-8000-000000000005', fetchId,
		requestedUrl: page.url, finalUrl: page.url, redirectChain: [], status: 'fetched', httpStatus: 200,
		contentType: 'text/html', contentLength: 48, cache: { decision: 'network_fetch' },
		contentDigest: rawContentDigest, storageUri: 's3://fixture/raw.html', sourceRevisionId,
		startedAt: '2026-09-22T00:00:00.000Z', completedAt: '2026-09-22T00:00:01.000Z', durationMs: 1000,
	};
	const extraction: ExtractionResultV1 = {
		schemaVersion: 'atlas.extraction.result.v1', workflowRunId: 'run-fixture', fetchId, sourceRevisionId,
		extractionId: 'extract-fixture', extractor: { name: 'fixture-parser', version: '1' },
		contentDigest: rawContentDigest, normalizedTextDigest, title: 'Synthetic fixture', language: 'en',
		metadata: {}, warnings: [],
	};
	const pageReadback: ExternalDocAdmissionReceiptV1['pageReadback'] = {
		provider: page.provider, product: page.product, productVersion: page.productVersion,
		architecture: page.architecture, crawlRevision: page.crawlRevision, parserRevision: page.parserRevision,
		url: page.url, contentHash: page.contentHash, evidenceRevision: page.evidenceRevision,
	};
	const receipt: ExternalDocAdmissionReceiptV1 = {
		schema: 'atlas.external-doc-admission-receipt.v1', manifestRevision: 'manifest-r1',
		sourceRevision: 'doc-source-version-r1', pageEvidenceRevision: page.evidenceRevision, pageId,
		chunkIds: chunks.map((chunk) => chunk.chunkId), pageCount: 1, chunkCount: chunks.length,
		expectedChecksums: chunks.map((chunk) => chunk.chunkChecksum),
		readbackChecksums: chunks.map((chunk) => chunk.chunkChecksum), pageReadback,
		versionQualified: true, architectureQualified: true, transactionCommitted: true, writesPerformed: true,
	};
	const admissionInput: ExternalDocAdmissionInputV1 = {
		manifestRevision: 'manifest-r1', sourceRevision: 'doc-source-version-r1', page, chunks,
	};
	return { rawContentDigest, normalizedTextDigest, page, chunks, acquisition, extraction, receipt, admissionInput };
}

function fixturePool(pageReadbackOverride?: Record<string, unknown>) {
	const f = fixture();
	const statements: string[] = [];
	const pageReadback = pageReadbackOverride ?? {
		provider: f.page.provider, product: f.page.product, product_version: f.page.productVersion,
		architecture: f.page.architecture, crawl_revision: f.page.crawlRevision, parser_revision: f.page.parserRevision,
		url: f.page.url, content_hash: f.page.contentHash,
		evidence_revision: f.page.evidenceRevision,
	};
	const client = {
		query: async (sql: string) => {
			statements.push(sql.trim());
			if (sql.includes('INSERT INTO atlas_external_doc_pages')) return { rows: [{ id: pageId }] };
			if (sql.includes('SELECT provider, product, product_version')) return { rows: [pageReadback] };
			if (sql.includes('SELECT chunk_id, chunk_checksum')) return {
				rows: [...f.chunks].sort((a, b) => a.ordinal - b.ordinal)
					.map((chunk) => ({ chunk_id: chunk.chunkId, chunk_checksum: chunk.chunkChecksum })),
			};
			return { rows: [] };
		},
		release: () => undefined,
	};
	const pool = { connect: async () => client } as unknown as Pool;
	return { pool, statements };
}

function build() {
	const f = fixture();
	return buildExternalDocAcquisitionHandoffV1({
		acquisition: f.acquisition, extraction: f.extraction,
		documentSourceRevision: f.receipt.sourceRevision,
		manifestRevision: f.receipt.manifestRevision, page: f.page, canonicalText,
		chunks: f.chunks, admissionReceipt: f.receipt,
	});
}

describe('ExternalDocAcquisitionHandoffV1', () => {
	it('links raw acquisition and normalized document evidence without equating their revisions or hashes', () => {
		const handoff = build();
		const f = fixture();
		expect(handoff.acquisitionSourceRevisionId).toBe(sourceRevisionId);
		expect(handoff.documentSourceRevision).toBe('doc-source-version-r1');
		expect(handoff.acquisitionSourceRevisionId).not.toBe(handoff.documentSourceRevision);
		expect(handoff.rawContentDigest).toBe(f.rawContentDigest);
		expect(handoff.normalizedTextDigest).toBe(f.normalizedTextDigest);
		expect(handoff.rawContentDigest).not.toBe(handoff.normalizedTextDigest);
		expect(handoff.byteSpans.map((span) => [span.startByte, span.endByte])).toEqual([
			[0, firstEnd], [secondStart, canonicalBytes.byteLength],
		]);
		expect(handoff.pageVersionReadback).toBe(true);
		expect(handoff.pageContentHashReadback).toBe(true);
		expect(handoff.chunkChecksumReadback).toBe(true);
		expect(handoff.writesPerformed).toBe(false);
		expect(handoff.canonicalAuthority).toBe(false);
	});

	it('fails closed if extraction points to a different acquisition revision', () => {
		const f = fixture();
		expect(() => buildExternalDocAcquisitionHandoffV1({
			acquisition: f.acquisition,
			extraction: { ...f.extraction, sourceRevisionId: '60000000-0000-4000-8000-000000000006' },
			documentSourceRevision: f.receipt.sourceRevision, manifestRevision: f.receipt.manifestRevision,
			page: f.page, canonicalText, chunks: f.chunks, admissionReceipt: f.receipt,
		})).toThrow('DOC_HANDOFF_ACQUISITION_EXTRACTION_REVISION_MISMATCH');
	});

	it('fails closed if the normalized digest does not match the versioned page hash', () => {
		const f = fixture();
		expect(() => buildExternalDocAcquisitionHandoffV1({
			acquisition: f.acquisition, extraction: f.extraction,
			documentSourceRevision: f.receipt.sourceRevision, manifestRevision: f.receipt.manifestRevision,
			page: { ...f.page, contentHash: '0'.repeat(64) }, canonicalText, chunks: f.chunks, admissionReceipt: f.receipt,
		})).toThrow('DOC_HANDOFF_NORMALIZED_TEXT_DIGEST_MISMATCH');
	});

	it('fails closed if a UTF-8 span or chunk checksum is wrong', () => {
		const f = fixture();
		expect(() => buildExternalDocAcquisitionHandoffV1({
			acquisition: f.acquisition, extraction: f.extraction,
			documentSourceRevision: f.receipt.sourceRevision, manifestRevision: f.receipt.manifestRevision,
			page: f.page, canonicalText, chunks: [{ ...f.chunks[0]!, endByte: firstEnd - 1 }, f.chunks[1]!],
			admissionReceipt: f.receipt,
		})).toThrow('DOC_HANDOFF_BYTE_SPAN_OR_CHECKSUM_MISMATCH');
	});

	it('requires exact page version/content-hash readback and ordered chunk readback', () => {
		const f = fixture();
		expect(() => buildExternalDocAcquisitionHandoffV1({
			acquisition: f.acquisition, extraction: f.extraction,
			documentSourceRevision: f.receipt.sourceRevision, manifestRevision: f.receipt.manifestRevision,
			page: f.page, canonicalText, chunks: f.chunks,
			admissionReceipt: { ...f.receipt, pageReadback: { ...f.receipt.pageReadback, productVersion: 'other' } },
		})).toThrow('DOC_HANDOFF_PAGE_VERSION_READBACK_MISMATCH');
		const reversedReceipt = { ...f.receipt, readbackChecksums: [...f.receipt.readbackChecksums].reverse() };
		expect(() => buildExternalDocAcquisitionHandoffV1({
			acquisition: f.acquisition, extraction: f.extraction,
			documentSourceRevision: f.receipt.sourceRevision, manifestRevision: f.receipt.manifestRevision,
			page: f.page, canonicalText, chunks: f.chunks, admissionReceipt: reversedReceipt,
		})).toThrow('DOC_HANDOFF_CHUNK_READBACK_MISMATCH');
	});

	it('DOC-06A reads back persisted page version and content hash before commit', async () => {
		const f = fixture();
		const { pool, statements } = fixturePool();
		const receipt = await admitExternalDocPage(pool, f.admissionInput);
		expect(receipt.pageReadback.productVersion).toBe(f.page.productVersion);
		expect(receipt.pageReadback.contentHash).toBe(f.page.contentHash);
		expect(receipt.transactionCommitted).toBe(true);
		expect(statements.findIndex((sql) => sql.includes('SELECT provider, product, product_version')))
			.toBeLessThan(statements.findIndex((sql) => sql === 'COMMIT'));
	});

	it('DOC-06A rolls back if the persisted page version readback differs', async () => {
		const f = fixture();
		const { pool, statements } = fixturePool({
			provider: f.page.provider, product: f.page.product, product_version: 'wrong-version',
			architecture: f.page.architecture, crawl_revision: f.page.crawlRevision, parser_revision: f.page.parserRevision,
			url: f.page.url, content_hash: f.page.contentHash,
			evidence_revision: f.page.evidenceRevision,
		});
		await expect(admitExternalDocPage(pool, f.admissionInput)).rejects.toThrow('ADMISSION_PAGE_READBACK_MISMATCH');
		expect(statements).toContain('ROLLBACK');
		expect(statements).not.toContain('COMMIT');
	});
});
