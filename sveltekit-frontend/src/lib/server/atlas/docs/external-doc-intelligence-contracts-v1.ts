/**
 * Pure, DB-free contracts for the external-doc corpus tranche.
 *
 *  1. Admission handoff validator: checks the Python builder's envelopes against the DOC-06A admission
 *     contract (external-doc-admission.ts) WITHOUT calling the writer, so a batch can be judged
 *     READY/BLOCKED before any write is authorised. It mirrors admitExternalDocPage's pre-DB checks and adds
 *     the unique-constraint checks the live tables enforce (page/chunk evidence_revision are UNIQUE).
 *  2. ExternalDocAnalysisV1: candidate DERIVED contract (Ornith summaries, LangExtract entities, ...) that is
 *     keyed to canonical chunk evidence and never overwrites history. No migration is defined here.
 */
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { canonicalSha256V1 } from '../prefill/canonical-hash-v1.js';
import type { ExternalDocAdmissionInputV1 } from './external-doc-admission.js';

const sha256 = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex');

// ---------------------------------------------------------------------------------------------
// 1. admission handoff

const chunkEnvelopeSchema = z.object({
	chunkId: z.string().min(1),
	ordinal: z.number().int().nonnegative(),
	headingPath: z.array(z.string()),
	sectionAnchor: z.string().nullable(),
	startChar: z.number().int().nonnegative(),
	endChar: z.number().int().nonnegative(),
	startByte: z.number().int().nonnegative(),
	endByte: z.number().int().positive(),
	text: z.string().min(1),
	domainClass: z.string().min(1),
	ontologyClasses: z.array(z.string()),
	codeBlocks: z.array(z.object({ language: z.string().nullable(), code: z.string() })),
	apiSignatures: z.array(z.string()),
	chunkChecksum: z.string().regex(/^[a-f0-9]{64}$/),
	evidenceRevision: z.string().min(1)
});

export const ExternalDocAdmissionEnvelopeV1Schema = z.object({
	manifestRevision: z.string().min(1),
	sourceRevision: z.string().min(1),
	sourceId: z.string().min(1),
	authorityClass: z.string().min(1),
	versionQualification: z.enum(['EXACT_VERSION', 'MAJOR_VERSION', 'CURRENT_UPSTREAM', 'UNVERSIONED']),
	page: z.object({
		provider: z.string().min(1),
		product: z.string().min(1),
		productVersion: z.string().min(1),
		architecture: z.string().nullable(),
		language: z.string().nullable(),
		url: z.string().min(8),
		title: z.string().min(1),
		publisher: z.string().nullable(),
		sourceAuthority: z.enum(['OFFICIAL', 'COMMUNITY', 'THIRD_PARTY']),
		fetcher: z.string().min(1),
		crawlRevision: z.string().min(1),
		parserRevision: z.string().min(1),
		contentHash: z.string().regex(/^[a-f0-9]{64}$/),
		evidenceRevision: z.string().min(1),
		retrievedAt: z.string().min(10)
	}),
	chunks: z.array(chunkEnvelopeSchema)
});
export type ExternalDocAdmissionEnvelopeV1 = z.infer<typeof ExternalDocAdmissionEnvelopeV1Schema>;

export interface HandoffBlocker {
	code: string;
	detail: string;
	count?: number;
}

export interface AdmissionHandoffResult {
	result: 'EXTERNAL_DOC_ADMISSION_HANDOFF_READY' | 'DOC_ADMISSION_HANDOFF_BLOCKED';
	pages: number;
	chunks: number;
	blockers: HandoffBlocker[];
	chunkEvidence: { formula: string; uniquePageEvidenceRevisions: number; uniqueChunkEvidenceRevisions: number; duplicateChunkEvidenceRevisionGroups: number; duplicateChunkEvidenceRevisionRows: number };
}

export const EXTERNAL_DOC_CHUNK_EVIDENCE_SCHEMA = 'atlas.external-doc-chunk-evidence.v1';
export const CHUNK_EVIDENCE_FORMULA = 'sha256:canonicalSha256V1{schema,pageEvidenceRevision,ordinal,startByte,endByte,chunkChecksum}';

/**
 * ExternalDocChunkEvidenceV1: CHUNK-grain evidence identity. DocCoordinateV1 stays PAGE/VERSION identity; a chunk is its exact
 * UTF-8 span + bytes under that page revision. heading/section, parser/chunker and model revisions are provenance, not identity.
 * Byte-identical to python/atlas_doc_coordinate.py chunk_evidence_revision (golden value asserted in both test suites).
 */
export function chunkEvidenceRevisionV1(pageEvidenceRevision: string, chunk: { ordinal: number; startByte: number; endByte: number; chunkChecksum: string }): string {
	return `sha256:${canonicalSha256V1({
		schema: EXTERNAL_DOC_CHUNK_EVIDENCE_SCHEMA, pageEvidenceRevision, ordinal: chunk.ordinal, startByte: chunk.startByte, endByte: chunk.endByte, chunkChecksum: chunk.chunkChecksum
	})}`;
}

/** Maps a Python envelope to ExternalDocAdmissionInputV1. Page and chunk evidenceRevision are different grains and are never interchanged. */
export function toExternalDocAdmissionInputV1(envelope: ExternalDocAdmissionEnvelopeV1): ExternalDocAdmissionInputV1 {
	return {
		manifestRevision: envelope.manifestRevision,
		sourceRevision: envelope.sourceRevision,
		page: {
			...envelope.page,
			architecture: envelope.page.architecture ?? null,
			language: envelope.page.language ?? null,
			publisher: envelope.page.publisher ?? null
		},
		chunks: envelope.chunks.map((c) => ({
			chunkId: c.chunkId, ordinal: c.ordinal, headingPath: c.headingPath, sectionAnchor: c.sectionAnchor ?? null,
			startChar: c.startChar, endChar: c.endChar, startByte: c.startByte, endByte: c.endByte, text: c.text,
			domainClass: c.domainClass, ontologyClasses: c.ontologyClasses, codeBlocks: c.codeBlocks.map((b) => ({ language: b.language ?? null, code: b.code })), apiSignatures: c.apiSignatures,
			chunkChecksum: c.chunkChecksum,
			evidenceRevision: c.evidenceRevision
		}))
	};
}

function duplicates(values: string[]): number {
	return values.length - new Set(values).size;
}

export function validateExternalDocAdmissionHandoff(input: unknown, native: { nativeChunks?: number; nativeChunksWithoutDocCoordinate?: number } = {}): AdmissionHandoffResult {
	const blockers: HandoffBlocker[] = [];
	const parsed = z.array(ExternalDocAdmissionEnvelopeV1Schema).safeParse(input);
	if (!parsed.success) {
		return {
			result: 'DOC_ADMISSION_HANDOFF_BLOCKED', pages: 0, chunks: 0,
			blockers: [{ code: 'ENVELOPE_SCHEMA_INVALID', detail: parsed.error.issues.slice(0, 3).map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') }],
			chunkEvidence: { formula: CHUNK_EVIDENCE_FORMULA, uniquePageEvidenceRevisions: 0, uniqueChunkEvidenceRevisions: 0, duplicateChunkEvidenceRevisionGroups: 0, duplicateChunkEvidenceRevisionRows: 0 }
		};
	}
	const envelopes = parsed.data;
	const chunks = envelopes.flatMap((e) => e.chunks.map((c) => ({ e, c })));

	if (native.nativeChunksWithoutDocCoordinate && native.nativeChunksWithoutDocCoordinate > 0) {
		blockers.push({
			code: 'PIPELINE_DOES_NOT_EMIT_DOC_COORDINATE',
			detail: 'atlas_okf_docs_pipeline chunks carry doc_coordinate=null: the manifest source declares no provider/product, so the pipeline built no page DocCoordinateV1.',
			count: native.nativeChunksWithoutDocCoordinate
		});
	}
	const empty = envelopes.filter((e) => e.chunks.length === 0).length;
	if (empty) blockers.push({ code: 'ADMISSION_REQUIRES_AT_LEAST_ONE_CHUNK', detail: 'pages with zero chunks', count: empty });
	const badChecksum = chunks.filter(({ c }) => sha256(c.text) !== c.chunkChecksum).length;
	if (badChecksum) blockers.push({ code: 'ADMISSION_CHUNK_CHECKSUM_MISMATCH', detail: 'recomputed sha256(text) differs', count: badChecksum });
	const badSpan = chunks.filter(({ c }) => c.endByte - c.startByte !== Buffer.byteLength(c.text, 'utf8')).length;
	if (badSpan) blockers.push({ code: 'BYTE_SPAN_LENGTH_MISMATCH', detail: 'endByte-startByte != UTF-8 byte length of text', count: badSpan });
	const dupChunkIds = duplicates(chunks.map(({ c }) => c.chunkId));
	if (dupChunkIds) blockers.push({ code: 'ADMISSION_DUPLICATE_CHUNK_ID', detail: 'chunk_id is UNIQUE in atlas_external_doc_chunks', count: dupChunkIds });
	const dupPageRev = duplicates(envelopes.map((e) => e.page.evidenceRevision));
	if (dupPageRev) blockers.push({ code: 'PAGE_EVIDENCE_REVISION_NOT_UNIQUE', detail: 'atlas_external_doc_pages_evidence_revision_uq', count: dupPageRev });
	const dupIdentity = duplicates(envelopes.map((e) => [e.page.provider, e.page.product, e.page.productVersion, e.page.url].join('|')));
	if (dupIdentity) blockers.push({ code: 'PAGE_IDENTITY_NOT_UNIQUE', detail: 'atlas_external_doc_pages_identity_uq (provider, product, product_version, url)', count: dupIdentity });

	const wrongRevision = chunks.filter(({ e, c }) => c.evidenceRevision !== chunkEvidenceRevisionV1(e.page.evidenceRevision, c)).length;
	if (wrongRevision) blockers.push({ code: 'CHUNK_EVIDENCE_REVISION_MISMATCH', detail: 'envelope chunk evidenceRevision differs from ExternalDocChunkEvidenceV1 recomputed from page revision + ordinal + byte span + checksum', count: wrongRevision });
	const pageAsChunk = chunks.filter(({ e, c }) => c.evidenceRevision === e.page.evidenceRevision).length;
	if (pageAsChunk) blockers.push({ code: 'CHUNK_EVIDENCE_REVISION_EQUALS_PAGE_REVISION', detail: 'page evidence revision must never be sent as a chunk evidence revision', count: pageAsChunk });
	const chunkRevisions = chunks.map(({ c }) => c.evidenceRevision);
	const dupGroups = new Map<string, number>();
	for (const revision of chunkRevisions) dupGroups.set(revision, (dupGroups.get(revision) ?? 0) + 1);
	const duplicated = [...dupGroups.values()].filter((n) => n > 1);
	if (duplicated.length) {
		blockers.push({ code: 'CHUNK_EVIDENCE_REVISION_NOT_UNIQUE', detail: 'atlas_external_doc_chunks_evidence_revision_uq would reject the duplicates', count: duplicated.reduce((a, b) => a + b, 0) });
	}

	return {
		result: blockers.length ? 'DOC_ADMISSION_HANDOFF_BLOCKED' : 'EXTERNAL_DOC_ADMISSION_HANDOFF_READY',
		pages: envelopes.length, chunks: chunks.length, blockers,
		chunkEvidence: {
			formula: CHUNK_EVIDENCE_FORMULA, uniquePageEvidenceRevisions: new Set(envelopes.map((e) => e.page.evidenceRevision)).size,
			uniqueChunkEvidenceRevisions: dupGroups.size, duplicateChunkEvidenceRevisionGroups: duplicated.length, duplicateChunkEvidenceRevisionRows: duplicated.reduce((a, b) => a + b, 0)
		}
	};
}

// ---------------------------------------------------------------------------------------------
// 2. ExternalDocAnalysisV1 (candidate derived contract; no migration)

export const ExternalDocAnalysisTypeSchema = z.enum(['SUMMARY', 'ENTITY_EXTRACTION', 'SYMBOL_INFERENCE', 'RELATION_EXTRACTION', 'RECOMMENDATION']);

export const ExternalDocAnalysisV1Schema = z.object({
	schema: z.literal('atlas.external-doc-analysis.v1'),
	analysisId: z.string().min(1),
	chunkId: z.string().min(1),
	chunkEvidenceRevision: z.string().min(1),
	analysisType: ExternalDocAnalysisTypeSchema,
	producerId: z.string().min(1),
	producerRevision: z.string().min(1),
	modelId: z.string().min(1).nullable(),
	modelRevision: z.string().min(1).nullable(),
	promptRevision: z.string().min(1).nullable(),
	inputChecksum: z.string().regex(/^[a-f0-9]{64}$/),
	outputChecksum: z.string().regex(/^[a-f0-9]{64}$/),
	summaryText: z.string().optional(),
	entities: z.array(z.object({ label: z.string().min(1), text: z.string().min(1), startByte: z.number().int().nonnegative().optional(), endByte: z.number().int().positive().optional() })).optional(),
	relations: z.array(z.object({ subject: z.string().min(1), predicate: z.string().min(1), object: z.string().min(1) })).optional(),
	metadata: z.record(z.string(), z.unknown()),
	canonicalAuthority: z.literal(false),
	createdAt: z.string().min(10)
}).strict().superRefine((value, ctx) => {
	if (value.analysisType === 'SUMMARY' && !value.summaryText) ctx.addIssue({ code: 'custom', message: 'SUMMARY requires summaryText', path: ['summaryText'] });
	if (value.modelId !== null && (!value.modelRevision || !value.promptRevision)) {
		ctx.addIssue({ code: 'custom', message: 'model-derived analysis requires modelRevision and promptRevision', path: ['modelRevision'] });
	}
});
export type ExternalDocAnalysisV1 = z.infer<typeof ExternalDocAnalysisV1Schema>;

/**
 * Identity of one analysis row. Distinct model/prompt/producer revisions over the SAME canonical chunk produce distinct ids,
 * so history is appended, never overwritten; identical inputs and producers are idempotent (same id).
 */
export function externalDocAnalysisId(v: Pick<ExternalDocAnalysisV1, 'chunkEvidenceRevision' | 'analysisType' | 'producerId' | 'producerRevision' | 'modelId' | 'modelRevision' | 'promptRevision' | 'inputChecksum'>): string {
	return `eda:${sha256(JSON.stringify([v.chunkEvidenceRevision, v.analysisType, v.producerId, v.producerRevision, v.modelId, v.modelRevision, v.promptRevision, v.inputChecksum]))}`;
}
