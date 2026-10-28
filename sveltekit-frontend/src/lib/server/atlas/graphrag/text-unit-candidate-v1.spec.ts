import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
	buildTextUnitCandidateV1,
	toGraphRagTextUnitDraftV1,
	validateTextUnitCandidateV1,
	TextUnitCandidateErrorV1,
} from './text-unit-candidate-v1.js';

const ROOT = '01a13137-1378-7df9-9968-53738dbf0e48';
const digest = (bytes: Buffer) => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
const bytes = Buffer.from('export const a = 1;\nexport const b = "é";\n', 'utf8');

const base = () => ({ repositoryId: ROOT, sourceRef: 'src/a.ts', sourceBytes: bytes, boundSourceRevision: digest(bytes) });

describe('buildTextUnitCandidateV1', () => {
	it('builds a whole-file candidate that keeps Parent Atlas identity separate from GraphRAG fields', () => {
		const candidate = buildTextUnitCandidateV1({ ...base(), workspaceRevisionPrefix: 'c63620c4', historicalPacketKey: 'packet:0123456789ab' });
		expect(candidate.sourceRevision).toBe(digest(bytes));
		expect(candidate.nBytes).toBe(bytes.length);
		expect(candidate.span).toBeNull();
		expect(validateTextUnitCandidateV1(candidate)).toEqual([]);
		const draft = toGraphRagTextUnitDraftV1(candidate);
		expect(draft.document_id).toBe(candidate.sourceRevision);
		expect(draft.provenance.historicalPacketKey).toBe('packet:0123456789ab');
	});

	it('is deterministic for identical bytes', () => {
		expect(buildTextUnitCandidateV1(base())).toEqual(buildTextUnitCandidateV1(base()));
	});

	it('rejects bytes that do not match the bound source revision', () => {
		const wrong = { ...base(), boundSourceRevision: digest(Buffer.from('other')) };
		expect(() => buildTextUnitCandidateV1(wrong)).toThrowError(/SOURCE_REVISION_MISMATCH/);
	});

	it('rejects invalid repository ids, revisions and source refs', () => {
		expect(() => buildTextUnitCandidateV1({ ...base(), repositoryId: 'deeds-web-app' })).toThrowError(/REPOSITORY_ID_INVALID/);
		expect(() => buildTextUnitCandidateV1({ ...base(), boundSourceRevision: 'abc' })).toThrowError(/SOURCE_REVISION_INVALID/);
		expect(() => buildTextUnitCandidateV1({ ...base(), sourceRef: '/abs/a.ts' })).toThrowError(/SOURCE_REF_INVALID/);
		expect(() => buildTextUnitCandidateV1({ ...base(), sourceRef: '../a.ts' })).toThrowError(/SOURCE_REF_INVALID/);
	});

	it('rejects non-UTF-8 sources and empty text', () => {
		const binary = Buffer.from([0xff, 0xfe, 0xfd]);
		expect(() => buildTextUnitCandidateV1({ ...base(), sourceBytes: binary, boundSourceRevision: digest(binary) })).toThrowError(/NOT_UTF8/);
		const empty = Buffer.alloc(0);
		expect(() => buildTextUnitCandidateV1({ ...base(), sourceBytes: empty, boundSourceRevision: digest(empty) })).toThrowError(/TEXT_EMPTY/);
	});

	it('qualifies a byte span and rejects spans that are out of bounds or split a UTF-8 code point', () => {
		const first = bytes.indexOf(0xc3); // start of the two-byte "é"
		const ok = buildTextUnitCandidateV1({ ...base(), span: { byteStart: 0, byteEnd: first } });
		expect(ok.span).toEqual({ byteStart: 0, byteEnd: first });
		expect(ok.nBytes).toBe(first);
		expect(() => buildTextUnitCandidateV1({ ...base(), span: { byteStart: 0, byteEnd: first + 1 } })).toThrowError(/SPAN_SPLITS_UTF8_CODEPOINT/);
		expect(() => buildTextUnitCandidateV1({ ...base(), span: { byteStart: 5, byteEnd: 5 } })).toThrowError(/SPAN_OUT_OF_BOUNDS/);
		expect(() => buildTextUnitCandidateV1({ ...base(), span: { byteStart: 0, byteEnd: bytes.length + 1 } })).toThrowError(/SPAN_OUT_OF_BOUNDS/);
	});
});

describe('GraphRAG draft', () => {
	it('reports the fields it cannot compute instead of inventing them', () => {
		const draft = toGraphRagTextUnitDraftV1(buildTextUnitCandidateV1(base()));
		expect(draft.n_tokens).toBeNull();
		expect(draft.entity_ids).toEqual([]);
		expect(draft.relationship_ids).toEqual([]);
		expect(draft.byogMissingFields).toEqual(['n_tokens', 'entity_ids', 'relationship_ids']);
	});

	it('refuses to draft a candidate whose text was altered', () => {
		const candidate = { ...buildTextUnitCandidateV1(base()), text: 'tampered' };
		expect(validateTextUnitCandidateV1(candidate)).toContain('TEXT_SHA256_MISMATCH');
		expect(() => toGraphRagTextUnitDraftV1(candidate)).toThrowError(TextUnitCandidateErrorV1);
	});
});
