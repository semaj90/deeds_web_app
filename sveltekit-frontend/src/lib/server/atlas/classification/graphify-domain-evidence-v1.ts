import { createHash } from 'node:crypto';
import { classifyDomainTaxonomy, type DomainClassification } from '../domain-taxonomy.js';

export interface GraphifyDomainEvidenceInputV1 {
	requestId: string;
	workspaceRevision: string;
	sourceRef: string;
	sourceRevision: string;
	sourceBytes: Uint8Array;
	summary?: string | null;
	astSymbols?: readonly string[];
	imports?: readonly string[];
	routes?: readonly string[];
	schemas?: readonly string[];
	dependencies?: readonly string[];
	lspSymbols?: ReadonlyArray<{ name: string; sourceRevision: string; startByte: number; endByte: number }>;
	langExtractFacts?: ReadonlyArray<{ text: string; sourceRevision: string; startByte: number; endByte: number }>;
}

export interface GraphifyDomainEvidenceResultV1 {
	schema: 'atlas.graphify-domain-evidence.v1';
	requestId: string;
	sourceRef: string;
	sourceRevision: string;
	workspaceRevision: string;
	classification: DomainClassification;
	evidenceRefs: string[];
	status: 'PROPOSAL_ONLY';
	canonicalAuthority: false;
	writesPerformed: false;
	retrievalVoteAdded: false;
	langExtractFacts?: Array<Record<string, unknown>>;
}

export interface LangExtractFactV1 {
	sourceRevision: string;
	evidenceText: string;
	startChar: number;
	endChar: number;
	[key: string]: unknown;
}

function nonEmpty(value: string, field: string): string {
	const normalized = value.trim();
	if (!normalized) throw new Error(`GRAPHIFY_DOMAIN_EVIDENCE_${field}_REQUIRED`);
	return normalized;
}

function verifySpan(
	bytes: Uint8Array,
	revision: string,
	span: { text: string; sourceRevision: string; startByte: number; endByte: number },
	field: string
): string {
	if (span.sourceRevision !== revision) throw new Error(`GRAPHIFY_DOMAIN_EVIDENCE_${field}_REVISION_MISMATCH`);
	if (!Number.isSafeInteger(span.startByte) || !Number.isSafeInteger(span.endByte) || span.startByte < 0 || span.endByte <= span.startByte || span.endByte > bytes.byteLength) {
		throw new Error(`GRAPHIFY_DOMAIN_EVIDENCE_${field}_SPAN_INVALID`);
	}
	const exactText = Buffer.from(bytes).subarray(span.startByte, span.endByte).toString('utf8');
	if (exactText !== span.text) throw new Error(`GRAPHIFY_DOMAIN_EVIDENCE_${field}_SPAN_MISMATCH`);
	if (!Buffer.from(exactText, 'utf8').equals(Buffer.from(bytes).subarray(span.startByte, span.endByte))) {
		throw new Error(`GRAPHIFY_DOMAIN_EVIDENCE_${field}_UTF8_BOUNDARY_INVALID`);
	}
	return exactText;
}

export function buildGraphifyDomainEvidenceV1(
	input: GraphifyDomainEvidenceInputV1
): GraphifyDomainEvidenceResultV1 {
	const requestId = nonEmpty(input.requestId, 'REQUEST_ID');
	const sourceRef = nonEmpty(input.sourceRef, 'SOURCE_REF');
	const sourceRevision = nonEmpty(input.sourceRevision, 'SOURCE_REVISION');
	const workspaceRevision = nonEmpty(input.workspaceRevision, 'WORKSPACE_REVISION');
	const sourceBytes = Buffer.from(input.sourceBytes);
	const sourceDigest = createHash('sha256').update(sourceBytes).digest('hex');
	if (sourceRevision !== `sha256:${sourceDigest}`) {
		throw new Error('GRAPHIFY_DOMAIN_EVIDENCE_SOURCE_DIGEST_MISMATCH');
	}

	const symbols = (input.astSymbols ?? []).map((value) => nonEmpty(value, 'AST_SYMBOL'));
	const lspSymbols = (input.lspSymbols ?? []).map((span) => verifySpan(sourceBytes, sourceRevision, {
		text: span.name,
		sourceRevision: span.sourceRevision,
		startByte: span.startByte,
		endByte: span.endByte,
	}, 'LSP'));
	const langExtractTerms = (input.langExtractFacts ?? []).map((span) => verifySpan(sourceBytes, sourceRevision, span, 'LANGEXTRACT'));
	const classification = classifyDomainTaxonomy({
		sourceRef,
		workspaceRevision,
		summary: input.summary,
		symbol: [...symbols, ...lspSymbols].join(' '),
		imports: input.imports ? [...input.imports] : undefined,
		routes: input.routes ? [...input.routes] : undefined,
		schema: input.schemas ? [...input.schemas] : undefined,
		dependencies: input.dependencies ? [...input.dependencies] : undefined,
		metadata: [...langExtractTerms],
	});
	const evidenceRefs = [...new Set([
		`source:${sourceRef}@${sourceRevision}`,
		...(input.langExtractFacts ?? []).map((span) => `span:${sourceRef}@${sourceRevision}:${span.startByte}-${span.endByte}`),
		...(input.lspSymbols ?? []).map((span) => `lsp:${sourceRef}@${sourceRevision}:${span.startByte}-${span.endByte}`),
	])].sort();

	return {
		schema: 'atlas.graphify-domain-evidence.v1',
		requestId,
		sourceRef,
		sourceRevision,
		workspaceRevision,
		classification,
		evidenceRefs,
		status: 'PROPOSAL_ONLY',
		canonicalAuthority: false,
		writesPerformed: false,
		retrievalVoteAdded: false,
	};
}

export function buildGraphifyDomainEvidenceFromLangExtractV1(
	input: Omit<GraphifyDomainEvidenceInputV1, 'langExtractFacts'> & { facts: readonly LangExtractFactV1[] }
): GraphifyDomainEvidenceResultV1 {
	const sourceBytes = Buffer.from(input.sourceBytes);
	const sourceText = new TextDecoder('utf-8', { fatal: true }).decode(sourceBytes);
	const codePoints = Array.from(sourceText);
	const groundedFacts = input.facts.map((fact) => {
		if (!Number.isSafeInteger(fact.startChar) || !Number.isSafeInteger(fact.endChar) || fact.startChar < 0 || fact.endChar <= fact.startChar || fact.endChar > codePoints.length) {
			throw new Error('GRAPHIFY_LANGEXTRACT_CHARACTER_SPAN_INVALID');
		}
		const exactText = codePoints.slice(fact.startChar, fact.endChar).join('');
		if (!exactText || exactText !== fact.evidenceText) {
			throw new Error('GRAPHIFY_LANGEXTRACT_TEXT_SPAN_MISMATCH');
		}
		const startByte = Buffer.byteLength(codePoints.slice(0, fact.startChar).join(''), 'utf8');
		const endByte = startByte + Buffer.byteLength(exactText, 'utf8');
		return {
			...fact,
			text: exactText,
			sourceRevision: fact.sourceRevision,
			startByte,
			endByte,
		};
	});
	const result = buildGraphifyDomainEvidenceV1({
		...input,
		langExtractFacts: groundedFacts,
	});
	return {
		...result,
		langExtractFacts: groundedFacts.map((fact) => ({
			...fact,
			sourceRef: input.sourceRef,
			workspaceRevision: input.workspaceRevision,
			status: 'PROPOSAL_ONLY',
			canonicalAuthority: false,
		})),
	};
}
