import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { mapExternalDocHypergraphProposalToTupleV1 } from './external-doc-hypergraph-tuple-proposals-v1.js';

const pythonProducerFixture = JSON.parse(readFileSync(
	resolve(process.cwd(), 'src/lib/server/atlas/integration/fixtures/doc14-python-proposal-v1.json'), 'utf8',
)) as { sourceText: string; proposal: unknown };

const sourceBytes = Buffer.from('Résumé 🔍: Stanza documents parser APIs.', 'utf8');
const sourceRevision = createHash('sha256').update(sourceBytes).digest('hex');
const evidenceText = 'Stanza documents parser APIs.';
const evidenceStartByte = sourceBytes.indexOf(Buffer.from(evidenceText, 'utf8'));
const evidenceEndByte = evidenceStartByte + Buffer.byteLength(evidenceText, 'utf8');
const evidenceChecksum = createHash('sha256').update(evidenceText, 'utf8').digest('hex');

function sha256(text: string): string {
	return createHash('sha256').update(text, 'utf8').digest('hex');
}

function stableJson(value: unknown, key = ''): string {
	if (Array.isArray(value)) return `[${value.map((item) => stableJson(item)).join(',')}]`;
	if (value !== null && typeof value === 'object') {
		const record = value as Record<string, unknown>;
		return `{${Object.keys(record).sort().map((childKey) =>
			`${JSON.stringify(childKey)}:${stableJson(record[childKey], childKey)}`).join(',')}}`;
	}
	if (key === 'confidence' && typeof value === 'number' && Number.isInteger(value)) return `${value}.0`;
	return JSON.stringify(value);
}

function proposal(overrides: Record<string, unknown> = {}) {
	const defaults = {
		schema: 'atlas.hypergraph-fact-proposal.v1',
		fact_id: 'doc-fact-01',
		predicate: 'UNMAPPED_VERB:documents',
		source_ref: 'firecrawl:docs-firecrawl-quickstart',
		source_revision: sourceRevision,
		workspace_revision: 'workspace:fixture-01',
		producer_revision: 'stanza:fixture-01',
		evidence_start_byte: evidenceStartByte,
		evidence_end_byte: evidenceEndByte,
		evidence_text: evidenceText,
		evidence_checksum: evidenceChecksum,
		participants: [
		{ entity_id: 'mention:subject-01', entity_kind: 'external_doc_mention', role: 'subject', label: 'Stanza' },
		{ entity_id: 'mention:object-01', entity_kind: 'external_doc_mention', role: 'object', label: 'parser APIs' },
		],
		ontology_ids: [] as string[],
		concept_ids: [] as string[],
		confidence: 0,
		graph_revision: null,
		admission_state: 'PROPOSAL_ONLY',
		canonical_authority: false,
		writes_performed: false,
	};
	const body = { ...defaults, ...overrides };
	body.participants = [...body.participants].sort((a, b) =>
		[a.role, a.entity_kind, a.entity_id, a.label ?? ''].join('\0').localeCompare(
			[b.role, b.entity_kind, b.entity_id, b.label ?? ''], 'en', { sensitivity: 'variant' },
		),
	);
	const proposalChecksum = sha256(stableJson(body));
	return {
		...body,
		proposal_id: sha256([
			body.fact_id, body.source_revision, body.workspace_revision, body.producer_revision,
			body.evidence_checksum, proposalChecksum,
		].join('|')),
		proposal_checksum: proposalChecksum,
	};
}

describe('mapExternalDocHypergraphProposalToTupleV1', () => {
	it('accepts a serialized proposal emitted by the Python producer', () => {
		const result = mapExternalDocHypergraphProposalToTupleV1({
			proposal: pythonProducerFixture.proposal,
			sourceBytes: Buffer.from(pythonProducerFixture.sourceText, 'utf8'),
		});
		expect(result.status).toBe('PROPOSAL_ONLY');
		expect(result.tuple.provenance.producerRevision).toBe('stanza-fixture-v1|stanza-en-fixture-v1');
		expect(result.tuple.ontologyIds).toEqual([]);
		expect(result.tuple.evidenceState).toBe('REFERENCE_ONLY');
	});

	it('maps verified proposal bytes to an unresolved, noncanonical shared tuple', () => {
		const result = mapExternalDocHypergraphProposalToTupleV1({ proposal: proposal(), sourceBytes });
		expect(result.status).toBe('PROPOSAL_ONLY');
		expect(result.tuple.surfaceText).toBe(evidenceText);
		expect(result.tuple.evidenceSpan).toEqual({
			sourceRef: 'firecrawl:docs-firecrawl-quickstart', start: evidenceStartByte, end: evidenceEndByte,
		});
		expect(result.tuple.provenance.sourceRevision).toBe(`sha256:${sourceRevision}`);
		expect(result.tuple.ontologyIds).toEqual([]);
		expect(result.tuple.conceptIds).toEqual([]);
		expect(result.tuple.evidenceState).toBe('REFERENCE_ONLY');
		expect(result.participantResolution).toBe('UNRESOLVED_SOURCE_MENTIONS');
		expect(result.canonicalAuthority).toBe(false);
		expect(result.writesPerformed).toBe(false);
	});

	it('rejects stale source bytes, invalid spans, or digest changes', () => {
		expect(() => mapExternalDocHypergraphProposalToTupleV1({
			proposal: proposal(), sourceBytes: Buffer.from('different source'),
		})).toThrow('EXTERNAL_DOC_TUPLE_SOURCE_REVISION_MISMATCH');
		expect(() => mapExternalDocHypergraphProposalToTupleV1({
			proposal: proposal({ evidence_start_byte: 1 }), sourceBytes,
		})).toThrow('EXTERNAL_DOC_TUPLE_EVIDENCE_READBACK_MISMATCH');
		expect(() => mapExternalDocHypergraphProposalToTupleV1({
			proposal: { ...proposal(), predicate: 'UNMAPPED_VERB:invented' }, sourceBytes,
		})).toThrow('EXTERNAL_DOC_TUPLE_PROPOSAL_CHECKSUM_MISMATCH');
	});

	it('keeps ontology mapping and unsupported participant roles gated', () => {
		expect(() => mapExternalDocHypergraphProposalToTupleV1({
			proposal: proposal({ ontology_ids: ['GO:0000001'] }), sourceBytes,
		})).toThrow('EXTERNAL_DOC_TUPLE_MAPPING_REQUIRES_REVIEWED_ADMISSION');
		const unknownRole = proposal({
			participants: [
				{ entity_id: 'mention:subject-01', entity_kind: 'external_doc_mention', role: 'subject', label: 'Stanza' },
				{ entity_id: 'mention:object-01', entity_kind: 'external_doc_mention', role: 'xcomp', label: 'parser APIs' },
			],
		});
		expect(() => mapExternalDocHypergraphProposalToTupleV1({ proposal: unknownRole, sourceBytes }))
			.toThrow('EXTERNAL_DOC_TUPLE_PARTICIPANT_ROLE_UNMAPPED:xcomp');
	});

	it('rejects non-UTF-8-aligned evidence through byte readback', () => {
		const misaligned = proposal({ evidence_start_byte: evidenceStartByte - 3 });
		expect(() => mapExternalDocHypergraphProposalToTupleV1({ proposal: misaligned, sourceBytes }))
			.toThrow('EXTERNAL_DOC_TUPLE_EVIDENCE_NOT_UTF8');
	});
});
