import { createHash } from 'node:crypto';

/**
 * TextUnitCandidateV1: a source-qualified text unit that MAY later become a GraphRAG `text_units` row.
 *
 * Parent Atlas identity and revision stay on the candidate. GraphRAG's own identifiers are generated
 * downstream and are never replaced by, or derived from, these fields. Nothing here writes a store or
 * invents a value: anything GraphRAG needs that cannot be computed from the verified source bytes is
 * reported in `byogMissingFields`, not filled in.
 *
 * GraphRAG `text_units` columns (https://microsoft.github.io/graphrag/index/outputs/): text, n_tokens,
 * document_id, entity_ids, relationship_ids, covariate_ids.
 */

export interface TextUnitCandidateV1 {
	candidateId: string;
	repositoryId: string;
	sourceRef: string;
	/** `sha256:<64 hex>` over the exact source bytes that were qualified. */
	sourceRevision: string;
	workspaceRevisionPrefix: string | null;
	/** Historical packet key observed for this source; a storage locator, not a canonical identity. */
	historicalPacketKey: string | null;
	text: string;
	textSha256: string;
	nBytes: number;
	/** Present only when a byte span or chunk locator was verified; otherwise null (whole-file unit). */
	span: { byteStart: number; byteEnd: number } | null;
	provenance: 'EXACT_SOURCE_BYTES_VERIFIED_AGAINST_BINDING';
}

export class TextUnitCandidateErrorV1 extends Error {
	constructor(public readonly code: string, detail: string) {
		super(`TEXT_UNIT_CANDIDATE_${code}: ${detail}`);
		this.name = 'TextUnitCandidateErrorV1';
	}
}

const SHA256 = /^sha256:[0-9a-f]{64}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const sha256 = (value: Buffer | string): string => `sha256:${createHash('sha256').update(value).digest('hex')}`;

export interface BuildTextUnitCandidateInputV1 {
	repositoryId: string;
	sourceRef: string;
	/** The qualified bytes. The caller proves they equal the admitted binding before calling. */
	sourceBytes: Buffer;
	/** Revision recorded by the admitted binding (`sha256:...`); must equal the digest of `sourceBytes`. */
	boundSourceRevision: string;
	workspaceRevisionPrefix?: string | null;
	historicalPacketKey?: string | null;
	span?: { byteStart: number; byteEnd: number } | null;
}

export function buildTextUnitCandidateV1(input: BuildTextUnitCandidateInputV1): TextUnitCandidateV1 {
	if (!UUID.test(input.repositoryId)) throw new TextUnitCandidateErrorV1('REPOSITORY_ID_INVALID', input.repositoryId);
	if (!input.sourceRef || input.sourceRef !== input.sourceRef.trim() || input.sourceRef.startsWith('/') || input.sourceRef.includes('..')) {
		throw new TextUnitCandidateErrorV1('SOURCE_REF_INVALID', input.sourceRef);
	}
	if (!SHA256.test(input.boundSourceRevision)) throw new TextUnitCandidateErrorV1('SOURCE_REVISION_INVALID', input.boundSourceRevision);
	if (sha256(input.sourceBytes) !== input.boundSourceRevision) {
		throw new TextUnitCandidateErrorV1('SOURCE_REVISION_MISMATCH', input.sourceRef);
	}
	let fullText: string;
	try {
		fullText = new TextDecoder('utf-8', { fatal: true }).decode(input.sourceBytes);
	} catch {
		throw new TextUnitCandidateErrorV1('NOT_UTF8', input.sourceRef);
	}
	let bytes = input.sourceBytes;
	let span: TextUnitCandidateV1['span'] = null;
	if (input.span) {
		const { byteStart, byteEnd } = input.span;
		if (!Number.isInteger(byteStart) || !Number.isInteger(byteEnd) || byteStart < 0 || byteEnd <= byteStart || byteEnd > input.sourceBytes.length) {
			throw new TextUnitCandidateErrorV1('SPAN_OUT_OF_BOUNDS', `${byteStart}-${byteEnd}`);
		}
		bytes = input.sourceBytes.subarray(byteStart, byteEnd);
		try {
			fullText = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
		} catch {
			throw new TextUnitCandidateErrorV1('SPAN_SPLITS_UTF8_CODEPOINT', `${byteStart}-${byteEnd}`);
		}
		span = { byteStart, byteEnd };
	}
	if (fullText.length === 0) throw new TextUnitCandidateErrorV1('TEXT_EMPTY', input.sourceRef);
	return {
		candidateId: `tu:${input.boundSourceRevision.slice(7, 23)}:${span ? `${span.byteStart}-${span.byteEnd}` : '0'}`,
		repositoryId: input.repositoryId,
		sourceRef: input.sourceRef,
		sourceRevision: input.boundSourceRevision,
		workspaceRevisionPrefix: input.workspaceRevisionPrefix ?? null,
		historicalPacketKey: input.historicalPacketKey ?? null,
		text: fullText,
		textSha256: sha256(fullText),
		nBytes: bytes.length,
		span,
		provenance: 'EXACT_SOURCE_BYTES_VERIFIED_AGAINST_BINDING',
	};
}

/** Re-checks a candidate's internal consistency (for receipts read back from disk). */
export function validateTextUnitCandidateV1(candidate: TextUnitCandidateV1): string[] {
	const problems: string[] = [];
	if (!UUID.test(candidate.repositoryId)) problems.push('REPOSITORY_ID_INVALID');
	if (!SHA256.test(candidate.sourceRevision)) problems.push('SOURCE_REVISION_INVALID');
	if (!SHA256.test(candidate.textSha256)) problems.push('TEXT_SHA256_INVALID');
	if (sha256(candidate.text) !== candidate.textSha256) problems.push('TEXT_SHA256_MISMATCH');
	if (Buffer.byteLength(candidate.text, 'utf8') !== candidate.nBytes) problems.push('N_BYTES_MISMATCH');
	if (candidate.span && candidate.span.byteEnd - candidate.span.byteStart !== candidate.nBytes) problems.push('SPAN_LENGTH_MISMATCH');
	return problems;
}

export interface GraphRagTextUnitDraftV1 {
	text: string;
	/** GraphRAG's `document_id` slot. Parent Atlas source identity is kept in `provenance`, not here. */
	document_id: string;
	n_tokens: number | null;
	entity_ids: string[];
	relationship_ids: string[];
	covariate_ids: string[];
	provenance: Pick<TextUnitCandidateV1, 'candidateId' | 'repositoryId' | 'sourceRef' | 'sourceRevision' | 'workspaceRevisionPrefix' | 'historicalPacketKey' | 'span'>;
	/** GraphRAG-required fields this adapter could not compute from verified bytes. Never filled in. */
	byogMissingFields: string[];
}

/** Draft only: n_tokens needs GraphRAG's tokenizer and entity/relationship ids need qualified extraction. */
export function toGraphRagTextUnitDraftV1(candidate: TextUnitCandidateV1): GraphRagTextUnitDraftV1 {
	const problems = validateTextUnitCandidateV1(candidate);
	if (problems.length > 0) throw new TextUnitCandidateErrorV1('CANDIDATE_INVALID', problems.join(','));
	return {
		text: candidate.text,
		document_id: candidate.sourceRevision,
		n_tokens: null,
		entity_ids: [],
		relationship_ids: [],
		covariate_ids: [],
		provenance: {
			candidateId: candidate.candidateId,
			repositoryId: candidate.repositoryId,
			sourceRef: candidate.sourceRef,
			sourceRevision: candidate.sourceRevision,
			workspaceRevisionPrefix: candidate.workspaceRevisionPrefix,
			historicalPacketKey: candidate.historicalPacketKey,
			span: candidate.span,
		},
		byogMissingFields: ['n_tokens', 'entity_ids', 'relationship_ids'],
	};
}
