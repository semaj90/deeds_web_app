// @vitest-environment node
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
	computeVersionDrift, readAnalysisStatus, readLangExtractStatus, readSymbolIndexStatus, type CoordinatesFile, type RuntimeVersions, type SourceCapture
} from './doc-intelligence-read-model.js';
import {
	candidateChunkEvidenceRevision, ExternalDocAnalysisV1Schema, externalDocAnalysisId, toExternalDocAdmissionInputV1,
	validateExternalDocAdmissionHandoff, type ExternalDocAdmissionEnvelopeV1
} from './external-doc-intelligence-contracts-v1.js';

const RUNTIME: RuntimeVersions = { postgres: '18.4 (Debian)', pgvector: '0.8.3', drizzleOrm: '0.45.2', drizzleKit: '0.31.10', pg: '8.16.0', svelte: '5.46.0', svelteKit: '2.59.1', bitsUi: '2.16.2' };
const sha = (t: string) => createHash('sha256').update(t, 'utf8').digest('hex');
const NOW = new Date('2026-09-23T00:00:00Z');

const coords: CoordinatesFile = {
	sources: {
		'postgresql-18': { provider: 'postgresql', product: 'postgresql', versionQualification: 'MAJOR_VERSION', productVersion: '18', authorityClass: 'OFFICIAL_PRIMARY', runtime: { kind: 'postgres', setting: 'server_version' } },
		sveltekit: { provider: 'sveltejs', product: 'sveltekit', versionQualification: 'CURRENT_UPSTREAM', authorityClass: 'OFFICIAL_PRIMARY', runtime: { kind: 'npm', package: '@sveltejs/kit' } },
		'bits-ui': { provider: 'huntabyte', product: 'bits-ui', versionQualification: 'EXACT_VERSION', productVersion: '2.16.2', authorityClass: 'OFFICIAL_PRIMARY', runtime: { kind: 'npm', package: 'bits-ui' } },
		'drizzle-kit': { provider: 'drizzle-team', product: 'drizzle-kit', versionQualification: 'MAJOR_VERSION', productVersion: '1', authorityClass: 'OFFICIAL_PRIMARY', runtime: { kind: 'npm', package: 'drizzle-kit' } },
		pgvector: { provider: 'pgvector', product: 'pgvector', versionQualification: 'CURRENT_UPSTREAM', authorityClass: 'OFFICIAL_PRIMARY', runtime: { kind: 'pgvector' } }
	}
};

const cap = (sourceId: string, capturedAt: string): SourceCapture => ({
	sourceId, sourceUrl: `https://x/${sourceId}`, title: sourceId, provenance: 'PINNED_CAPTURE', authorityClass: 'OFFICIAL_PRIMARY', capturedAt,
	contentChecksum: 'c', versionQualification: 'CURRENT_UPSTREAM', runtimeCompatibility: 'UNKNOWN', markdownPath: null, fileExists: true, checksumMatches: true
});

describe('version drift', () => {
	const fresh = '2026-09-20T00:00:00Z';
	const rows = computeVersionDrift(coords, [cap('postgresql-18', fresh), cap('sveltekit', fresh), cap('bits-ui', fresh), cap('drizzle-kit', fresh)], RUNTIME, NOW);
	const status = (id: string) => rows.find((r) => r.sourceId === id)?.status;

	it('classifies each product from runtime vs captured doc version', () => {
		expect(status('postgresql-18')).toBe('COMPATIBLE_SERIES'); // major 18 doc vs runtime 18.4
		expect(status('bits-ui')).toBe('EXACT_MATCH');
		expect(status('sveltekit')).toBe('UNVERSIONED'); // live "latest" page: never fabricate an exact version
		expect(status('drizzle-kit')).toBe('UPSTREAM_NEWER'); // doc major 1 > runtime 0.x
		expect(status('pgvector')).toBe('DOC_MISSING');
	});

	it('does not call a version stale when the runtime version is unknown (no database)', () => {
		const noRuntime = computeVersionDrift(coords, [cap('postgresql-18', '2026-09-20T00:00:00Z')], { ...RUNTIME, postgres: null, pgvector: null }, NOW);
		expect(noRuntime.find((r) => r.sourceId === 'postgresql-18')).toMatchObject({ runtimeVersion: null, status: 'UNVERSIONED' });
	});

	it('reports DOC_STALE for old captures and never mutates dependencies', () => {
		const stale = computeVersionDrift(coords, [cap('bits-ui', '2026-06-01T00:00:00Z')], RUNTIME, NOW);
		expect(stale.find((r) => r.sourceId === 'bits-ui')?.status).toBe('DOC_STALE');
		expect(rows.find((r) => r.sourceId === 'postgresql-18')).toMatchObject({ runtimeVersion: '18.4', capturedDocVersion: '18' });
	});
});

describe('langextract / symbol index / analysis status', () => {
	let root: string;
	beforeEach(() => { root = mkdtempSync(join(tmpdir(), 'doc-intel-')); });
	afterEach(() => { rmSync(root, { recursive: true, force: true }); });

	it('blocks the LangExtract join when rows have no coordinate or byte spans', () => {
		mkdirSync(join(root, 'docs', '.okf', 'langextract'), { recursive: true });
		writeFileSync(join(root, 'docs', '.okf', 'langextract', 'corpus.jsonl'), JSON.stringify({ source_id: 'a', source_url: 'https://x', markdown_path: 'C:\\x\\y.md' }));
		const s = readLangExtractStatus(root);
		expect(s.result).toBe('LANGEXTRACT_DOC_EVIDENCE_JOIN_BLOCKED');
		expect(s.blockers.map((b) => b.code)).toEqual(expect.arrayContaining(['LANGEXTRACT_ROWS_LACK_DOC_COORDINATE', 'LANGEXTRACT_ROWS_LACK_CHUNK_ID_AND_BYTE_SPANS', 'LANGEXTRACT_JOIN_WOULD_BE_URL_ONLY']));
		expect(s.authority).toBe('GENERATED_CORPUS');
	});

	it('is READY only when every row carries coordinate, chunk id and byte spans', () => {
		mkdirSync(join(root, 'docs', '.okf', 'langextract'), { recursive: true });
		writeFileSync(join(root, 'docs', '.okf', 'langextract', 'corpus.jsonl'), JSON.stringify({ evidence_revision: 'sha256:e', chunk_id: 'doc:x:0', start_byte: 0, end_byte: 4, markdown_path: 'docs/.okf/x.md' }));
		expect(readLangExtractStatus(root).result).toBe('LANGEXTRACT_DOC_EVIDENCE_JOIN_READY');
	});

	it('reads the tracked manifest documents when the gitignored corpus.jsonl is absent', () => {
		mkdirSync(join(root, 'docs', '.okf', 'langextract'), { recursive: true });
		writeFileSync(join(root, 'docs', '.okf', 'langextract', 'manifest.json'), JSON.stringify({ documents: [{ source_id: 'a', source_url: 'https://x' }] }));
		const s = readLangExtractStatus(root);
		expect(s.documents).toBe(1);
		expect(s.result).toBe('LANGEXTRACT_DOC_EVIDENCE_JOIN_BLOCKED');
	});

	it('reports the ast-grep symbol mapping as incomplete when records have no chunk link or byte span', () => {
		mkdirSync(join(root, 'scripts', 'docs-atlas'), { recursive: true });
		mkdirSync(join(root, 'docs', '.okf', 'dev'), { recursive: true });
		writeFileSync(join(root, 'scripts', 'docs-atlas', 'index-okf-dev-corpus.mjs'), "import astGrep from '@ast-grep/napi'; import { Project } from 'ts-morph'; const RAW='docs/.okf/dev/raw'; r={markdown_line:1, source_revision: sha256(markdown)}");
		writeFileSync(join(root, 'docs', '.okf', 'dev', 'symbol-summary.json'), JSON.stringify({ code_blocks: 0, symbols: 0 }));
		const s = readSymbolIndexStatus(root);
		expect(s.result).toBe('AST_GREP_DOC_SYMBOL_MAPPING_INCOMPLETE');
		expect(s.methods).toEqual(['ast-grep', 'ts-morph']);
		expect(s.blockers).toEqual(expect.arrayContaining(['SYMBOL_RECORD_HAS_NO_CHUNK_ID_BYTE_SPAN_OR_EVIDENCE_REVISION', 'SYMBOL_SPAN_IS_MARKDOWN_LINE_NOT_UTF8_BYTES', 'SYMBOL_INDEX_HAS_ZERO_SYMBOLS_TODAY']));
	});

	it('proves the ExternalDocAnalysisV1 contract keeps multiple revisions without overwriting', () => {
		const status = readAnalysisStatus();
		expect(status).toMatchObject({ result: 'EXTERNAL_DOC_ANALYSIS_CONTRACT_READY', authority: 'DERIVED_ANALYSIS', persistedRows: null, ornithSummary: 'NOT_RUN' });
	});
});

describe('ExternalDocAnalysisV1', () => {
	const base = {
		schema: 'atlas.external-doc-analysis.v1' as const, chunkId: 'doc:s:0', chunkEvidenceRevision: 'sha256:c', analysisType: 'SUMMARY' as const,
		producerId: 'ornith', producerRevision: 'r1', modelId: 'ornith-1.5-9b', modelRevision: 'm1', promptRevision: 'p1',
		inputChecksum: 'a'.repeat(64), outputChecksum: 'b'.repeat(64), summaryText: 'x', metadata: {}, canonicalAuthority: false as const, createdAt: '2026-09-23T00:00:00Z'
	};

	it('gives distinct ids per model/prompt revision and the same id for identical inputs', () => {
		expect(externalDocAnalysisId({ ...base })).toBe(externalDocAnalysisId({ ...base }));
		expect(externalDocAnalysisId({ ...base })).not.toBe(externalDocAnalysisId({ ...base, promptRevision: 'p2' }));
		expect(externalDocAnalysisId({ ...base })).not.toBe(externalDocAnalysisId({ ...base, modelRevision: 'm2' }));
	});

	it('rejects canonical authority, a SUMMARY without text, and a model without revisions', () => {
		const ok = { ...base, analysisId: externalDocAnalysisId(base) };
		expect(ExternalDocAnalysisV1Schema.safeParse(ok).success).toBe(true);
		expect(ExternalDocAnalysisV1Schema.safeParse({ ...ok, canonicalAuthority: true }).success).toBe(false);
		expect(ExternalDocAnalysisV1Schema.safeParse({ ...ok, summaryText: undefined }).success).toBe(false);
		expect(ExternalDocAnalysisV1Schema.safeParse({ ...ok, promptRevision: null }).success).toBe(false);
	});
});

describe('DOC-06A admission handoff (pure, no writer)', () => {
	function envelope(id: string, texts: string[], sharedChunkRevision = false): ExternalDocAdmissionEnvelopeV1 {
		let offset = 0;
		return {
			manifestRevision: 'm1', sourceRevision: `s-${id}`, sourceId: id, authorityClass: 'OFFICIAL_PRIMARY', versionQualification: 'MAJOR_VERSION',
			page: {
				provider: 'p', product: id, productVersion: '18', architecture: null, language: 'sql', url: `https://example.org/${id}`, title: id, publisher: null,
				sourceAuthority: 'OFFICIAL', fetcher: 'BEAUTIFULSOUP_HTTP', crawlRevision: 'c1', parserRevision: 'bs4', contentHash: sha(texts.join()), evidenceRevision: `sha256:page-${id}`, retrievedAt: '2026-09-23T00:00:00Z'
			},
			chunks: texts.map((text, i) => {
				const startByte = offset;
				offset += Buffer.byteLength(text, 'utf8');
				return {
					chunkId: `doc:${id}:${i}`, ordinal: i, headingPath: ['H'], sectionAnchor: 'H', startChar: 0, endChar: text.length, startByte, endByte: offset, text,
					domainClass: 'api', ontologyClasses: [], codeBlocks: [], apiSignatures: [], chunkChecksum: sha(text),
					evidenceRevision: sharedChunkRevision ? `sha256:shared-${id}` : `sha256:chunk-${id}-${i}`
				};
			})
		};
	}

	it('is READY when envelopes satisfy every admission and uniqueness check', () => {
		const r = validateExternalDocAdmissionHandoff([envelope('a', ['one', 'two']), envelope('b', ['three'])]);
		expect(r).toMatchObject({ result: 'EXTERNAL_DOC_ADMISSION_HANDOFF_READY', pages: 2, chunks: 3, blockers: [] });
	});

	it('is BLOCKED when several chunks share DocCoordinateV1\'s chunk revision, and a deterministic candidate is unique', () => {
		const r = validateExternalDocAdmissionHandoff([envelope('a', ['one', 'two', 'three'], true)]);
		expect(r.result).toBe('DOC_ADMISSION_HANDOFF_BLOCKED');
		expect(r.blockers.map((b) => b.code)).toContain('CHUNK_EVIDENCE_REVISION_NOT_UNIQUE');
		expect(r.duplicateNativeChunkRevisions).toBe(2);
		expect(r.candidateChunkRevision).toMatchObject({ unique: true, distinct: 3, total: 3 });
	});

	it('is BLOCKED when the pipeline emitted no doc_coordinate, on checksum drift, and on byte-span drift', () => {
		const e = envelope('a', ['one']);
		e.chunks[0].chunkChecksum = sha('tampered');
		e.chunks[0].endByte += 1;
		const r = validateExternalDocAdmissionHandoff([e], { nativeChunks: 1, nativeChunksWithoutDocCoordinate: 1 });
		expect(r.blockers.map((b) => b.code)).toEqual(expect.arrayContaining(['PIPELINE_DOES_NOT_EMIT_DOC_COORDINATE', 'ADMISSION_CHUNK_CHECKSUM_MISMATCH', 'BYTE_SPAN_LENGTH_MISMATCH']));
	});

	it('is BLOCKED on duplicate page identity and on a schema-invalid envelope', () => {
		const a = envelope('a', ['one']);
		expect(validateExternalDocAdmissionHandoff([a, { ...a, page: { ...a.page, evidenceRevision: 'sha256:other' } }]).blockers.map((b) => b.code)).toContain('PAGE_IDENTITY_NOT_UNIQUE');
		expect(validateExternalDocAdmissionHandoff([{ nope: true }]).blockers[0].code).toBe('ENVELOPE_SCHEMA_INVALID');
	});

	it('maps an envelope to ExternalDocAdmissionInputV1 with either revision strategy', () => {
		const e = envelope('a', ['one', 'two'], true);
		const native = toExternalDocAdmissionInputV1(e, 'native');
		const candidate = toExternalDocAdmissionInputV1(e, 'candidate');
		expect(new Set(native.chunks.map((c) => c.evidenceRevision)).size).toBe(1);
		expect(new Set(candidate.chunks.map((c) => c.evidenceRevision)).size).toBe(2);
		expect(candidate.chunks[0].evidenceRevision).toBe(candidateChunkEvidenceRevision(e.page.evidenceRevision, e.chunks[0]));
		expect(candidate.page.architecture).toBeNull();
	});
});
