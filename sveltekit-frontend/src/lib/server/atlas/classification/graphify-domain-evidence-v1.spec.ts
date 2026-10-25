import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { buildGraphifyDomainEvidenceFromLangExtractV1, buildGraphifyDomainEvidenceV1 } from './graphify-domain-evidence-v1.js';

function fixture(source: string) {
	const sourceBytes = Buffer.from(source, 'utf8');
	const sourceRevision = `sha256:${createHash('sha256').update(sourceBytes).digest('hex')}`;
	const fact = 'PostgreSQL';
	const startByte = sourceBytes.indexOf(Buffer.from(fact));
	return {
		requestId: 'req-1',
		workspaceRevision: 'workspace-r1',
		sourceRef: 'src/db.ts',
		sourceRevision,
		sourceBytes,
		langExtractFacts: [{ text: fact, sourceRevision, startByte, endByte: startByte + Buffer.byteLength(fact) }],
	};
}

describe('Graphify domain evidence helper', () => {
	it('combines structural and byte-grounded terms as a non-authoritative proposal', () => {
		const input = fixture('const db = "PostgreSQL";');
		const result = buildGraphifyDomainEvidenceV1({
			...input,
			summary: 'Postgres database schema table migration',
			imports: ['pgvector'],
			astSymbols: ['queryChunks'],
		});

		expect(result.classification.primary_domain).toBe('database');
		expect(result.evidenceRefs.some((ref) => ref.includes('span:src/db.ts@'))).toBe(true);
		expect(result.status).toBe('PROPOSAL_ONLY');
		expect(result.canonicalAuthority).toBe(false);
		expect(result.writesPerformed).toBe(false);
		expect(result.retrievalVoteAdded).toBe(false);
	});

	it('rejects a stale producer revision and invalid byte spans', () => {
		const input = fixture('const db = "PostgreSQL";');
		expect(() => buildGraphifyDomainEvidenceV1({
			...input,
			langExtractFacts: [{ ...input.langExtractFacts[0], sourceRevision: 'sha256:stale' }],
		})).toThrow('LANGEXTRACT_REVISION_MISMATCH');
		expect(() => buildGraphifyDomainEvidenceV1({
			...input,
			langExtractFacts: [{ ...input.langExtractFacts[0], startByte: 0, endByte: 3 }],
		})).toThrow('LANGEXTRACT_SPAN_MISMATCH');
	});

	it('uses UTF-8 byte coordinates for non-ASCII source', () => {
		const input = fixture('const label = "🧠 PostgreSQL";');
		const result = buildGraphifyDomainEvidenceV1(input);
		expect(result.evidenceRefs.some((ref) => ref.endsWith(`${input.langExtractFacts[0].startByte}-${input.langExtractFacts[0].endByte}`))).toBe(true);
	});

	it('validates LSP symbol names against canonical UTF-8 source bytes', () => {
		const input = fixture('const label = "🧠 PostgreSQL";');
		const sourceText = Buffer.from(input.sourceBytes).toString('utf8');
		const symbolName = 'PostgreSQL';
		const startByte = Buffer.from(input.sourceBytes).indexOf(Buffer.from(symbolName));
		const result = buildGraphifyDomainEvidenceV1({
			...input,
			lspSymbols: [{ name: symbolName, sourceRevision: input.sourceRevision, startByte, endByte: startByte + Buffer.byteLength(symbolName) }],
		});

		expect(result.classification.evidence.some((evidence) => evidence.value.includes(symbolName))).toBe(true);
		expect(result.evidenceRefs).not.toContain(`classification:symbol:${symbolName}`);
		expect(sourceText).toContain(symbolName);
	});

	it('rejects spans that split a multibyte UTF-8 character', () => {
		const input = fixture('const label = "🧠 PostgreSQL";');
		const sourceBytes = Buffer.from(input.sourceBytes);
		const startByte = sourceBytes.indexOf(Buffer.from('🧠')) + 1;
		const endByte = startByte + 2;
		expect(() => buildGraphifyDomainEvidenceV1({
			...input,
			langExtractFacts: [{ text: sourceBytes.subarray(startByte, endByte).toString('utf8'), sourceRevision: input.sourceRevision, startByte, endByte }],
		})).toThrow('LANGEXTRACT_UTF8_BOUNDARY_INVALID');
	});

	it('rejects bytes that do not match the declared source digest', () => {
		const input = fixture('const db = "PostgreSQL";');
		expect(() => buildGraphifyDomainEvidenceV1({ ...input, sourceRevision: 'sha256:wrong' }))
			.toThrow('SOURCE_DIGEST_MISMATCH');
	});

	it('converts LangExtract code-point spans into exact UTF-8 byte evidence', () => {
		const source = 'const label = "🧠 PostgreSQL";';
		const input = fixture(source);
		const startChar = Array.from(source.slice(0, source.indexOf('PostgreSQL'))).length;
		const result = buildGraphifyDomainEvidenceFromLangExtractV1({
			...input,
			facts: [{
				sourceRevision: input.sourceRevision,
				evidenceText: 'PostgreSQL',
				startChar,
				endChar: startChar + 'PostgreSQL'.length,
					subject: 'application',
					predicate: 'uses',
					object: 'PostgreSQL',
					confidence: 0.91,
					customAttributes: { sourceKind: 'code', extractorRule: 'db-access' },
			}],
		});

		expect(result.evidenceRefs.some((ref) => ref.endsWith(`${input.langExtractFacts[0].startByte}-${input.langExtractFacts[0].endByte}`))).toBe(true);
		expect(result.langExtractFacts?.[0]).toMatchObject({
			subject: 'application',
			predicate: 'uses',
			object: 'PostgreSQL',
			confidence: 0.91,
			customAttributes: { sourceKind: 'code', extractorRule: 'db-access' },
			sourceRef: input.sourceRef,
			workspaceRevision: input.workspaceRevision,
			status: 'PROPOSAL_ONLY',
			canonicalAuthority: false,
		});
		expect(result.status).toBe('PROPOSAL_ONLY');
	});

	it('rejects LangExtract spans with incorrect text or character offsets', () => {
		const input = fixture('const label = "🧠 PostgreSQL";');
		expect(() => buildGraphifyDomainEvidenceFromLangExtractV1({
			...input,
			facts: [{ sourceRevision: input.sourceRevision, evidenceText: 'PostgreSQL', startChar: 0, endChar: 10 }],
		})).toThrow('GRAPHIFY_LANGEXTRACT_TEXT_SPAN_MISMATCH');
		expect(() => buildGraphifyDomainEvidenceFromLangExtractV1({
			...input,
			facts: [{ sourceRevision: input.sourceRevision, evidenceText: 'PostgreSQL', startChar: -1, endChar: 8 }],
		})).toThrow('GRAPHIFY_LANGEXTRACT_CHARACTER_SPAN_INVALID');
	});
});
