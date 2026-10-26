import { createWorkspaceExactPromotionSourceReader } from '../../../packages/parent-atlas/src/core/exact-promotion-workspace-source-reader.js';
import { assessTuple } from '../prove-one-ontology-tuple-readback-v1.mjs';
import {
	createSourceBindingResolverV1,
	snapshotBindingFetcherV1,
	verifyBindingAgainstExactReaderV1,
	verifyPacketSourceLinkV1,
} from './source-binding-resolver-v1.mjs';
import { SOURCE_BINDING_READONLY_SQL_V1, assertSourceBindingScopeV1 } from './source-binding-readonly-fetch-v1.mjs';

const REQUIRED_TUPLE_COLUMNS = [
	'tuple_id', 'schema_version', 'packet_key', 'source_ref', 'surface_text', 'label', 'label_kind',
	'label_source', 'ontology_ids', 'concept_ids', 'participants', 'evidence_refs', 'evidence_span', 'confidence',
	'evidence_state', 'lifecycle', 'provenance',
];
const REQUIRED_PACKET_COLUMNS = ['packet_key', 'source_ref', 'source_revision', 'workspace_revision_key'];

type TupleRowV1 = Record<string, any> & {
	tuple_id: string;
	packet_key: string;
	source_ref: string;
	provenance: Record<string, any>;
	evidence_span: { sourceRef: string; start: number; end: number };
};

function canonicalTupleRecordV1(tuple: TupleRowV1): Record<string, unknown> {
	return {
		tupleId: tuple.tuple_id,
		schemaVersion: tuple.schema_version,
		packetKey: tuple.packet_key,
		sourceRef: tuple.source_ref,
		...(tuple.tree_node_id !== null && tuple.tree_node_id !== undefined ? { treeNodeId: tuple.tree_node_id } : {}),
		...(tuple.document_id !== null && tuple.document_id !== undefined ? { documentId: tuple.document_id } : {}),
		...(tuple.title_id !== null && tuple.title_id !== undefined ? { titleId: tuple.title_id } : {}),
		surfaceText: tuple.surface_text,
		...(tuple.token_index !== undefined ? { tokenIndex: tuple.token_index } : {}),
		...(tuple.part_of_speech !== undefined ? { partOfSpeech: tuple.part_of_speech } : {}),
		label: tuple.label,
		labelKind: tuple.label_kind,
		labelSource: tuple.label_source,
		ontologyIds: tuple.ontology_ids,
		conceptIds: tuple.concept_ids,
		participants: tuple.participants,
		evidenceRefs: tuple.evidence_refs,
		...(tuple.relation_revision !== null && tuple.relation_revision !== undefined ? { relationRevision: tuple.relation_revision } : {}),
		...(tuple.evidence_span ? { evidenceSpan: tuple.evidence_span } : {}),
		confidence: tuple.confidence,
		evidenceState: tuple.evidence_state,
		lifecycle: tuple.lifecycle,
		provenance: tuple.provenance,
	};
}

type SourceBindingRowV1 = {
	repo_id: string;
	workspace_revision: string;
	canonical_source_ref: string;
	source_revision: string;
	content_digest: string;
	binding_checksum: string;
	byte_length: number | null;
	producer_revision: string | null;
};

export async function verifyOntologyTupleSourceReadbackV1(input: {
	tuple: TupleRowV1;
	packetRows: Array<{ packet_key: string; source_ref: string; source_revision: string; workspace_revision_key: string }>;
	sourceBindingRows: SourceBindingRowV1[];
	repoRoot: string;
	expectedEvidenceRef: string;
}) {
	const { tuple } = input;
	if (!tuple || typeof tuple !== 'object' || !tuple.provenance || !tuple.evidence_span) {
		return { status: 'BLOCKED', reason: 'TUPLE_SOURCE_BINDING_INPUT_INVALID' } as const;
	}
	const sourceRevision = tuple.provenance.sourceRevision;
	const workspaceRevision = tuple.provenance.workspaceRevision;
	const sourceRef = tuple.source_ref;
	if (typeof sourceRevision !== 'string' || !/^sha256:[a-f0-9]{64}$/.test(sourceRevision)
		|| typeof workspaceRevision !== 'string' || !/^sha256:[a-f0-9]{64}$/.test(workspaceRevision)
		|| typeof sourceRef !== 'string' || !sourceRef) {
		return { status: 'BLOCKED', reason: 'TUPLE_SOURCE_REVISION_BINDING_INVALID' } as const;
	}

	const tupleAssessment = assessTuple({
		...tuple,
		canonical_packet_key: input.packetRows[0]?.packet_key,
		packet_source_ref: input.packetRows[0]?.source_ref,
		packet_source_revision: input.packetRows[0]?.source_revision,
		packet_workspace_revision: input.packetRows[0]?.workspace_revision_key,
	}, { evidenceRef: input.expectedEvidenceRef });
	if (tupleAssessment.verdict !== 'PERSISTED_TUPLE_VERIFIED') {
		return { status: 'BLOCKED', reason: `TUPLE_ROW_${tupleAssessment.reason ?? 'NOT_VERIFIED'}`, tupleAssessment } as const;
	}

	const packetLink = verifyPacketSourceLinkV1({
		packetKey: tuple.packet_key,
		sourceRef,
		sourceRevision,
	}, input.packetRows);
	if (!packetLink.verified) return { status: 'BLOCKED', reason: packetLink.status, tupleAssessment } as const;

	const resolveBinding = createSourceBindingResolverV1(
		snapshotBindingFetcherV1(input.sourceBindingRows),
	);
	const sourceBinding = resolveBinding({ sourceRef, workspaceRevision });
	if (!sourceBinding) return { status: 'BLOCKED', reason: 'SOURCE_BINDING_MISSING_OR_AMBIGUOUS', tupleAssessment } as const;
	if (sourceBinding.sourceRevision !== sourceRevision || sourceBinding.contentDigest !== sourceRevision) {
		return { status: 'BLOCKED', reason: 'SOURCE_BINDING_REVISION_MISMATCH', tupleAssessment } as const;
	}

	let sourceReadback;
	try {
		const reader = createWorkspaceExactPromotionSourceReader(input.repoRoot);
		sourceReadback = await reader({
			source_ref: sourceRef,
			span_start: tuple.evidence_span.start,
			span_end: tuple.evidence_span.end,
		});
	} catch {
		return { status: 'BLOCKED', reason: 'EXACT_SOURCE_READER_FAILED', tupleAssessment } as const;
	}
	if (sourceReadback.file_found !== true || sourceReadback.span_found !== true) {
		return { status: 'BLOCKED', reason: 'EXACT_SOURCE_READBACK_UNAVAILABLE', tupleAssessment } as const;
	}
	if (sourceReadback.span_utf8_valid !== true) {
		return { status: 'BLOCKED', reason: 'SOURCE_SPAN_UTF8_INVALID', tupleAssessment } as const;
	}
	const bindingCheck = verifyBindingAgainstExactReaderV1(sourceBinding, sourceReadback);
	if (!bindingCheck.verified) return { status: 'BLOCKED', reason: bindingCheck.status, tupleAssessment } as const;

	const actualSourceRevision = `sha256:${sourceReadback.file_sha256}`;
	const actualSpanChecksum = `sha256:${sourceReadback.span_sha256}`;
	if (actualSourceRevision !== sourceRevision) {
		return { status: 'BLOCKED', reason: 'SOURCE_BYTES_REVISION_MISMATCH', tupleAssessment } as const;
	}
	if (actualSpanChecksum !== tuple.provenance.evidenceSpanChecksum
		|| sourceReadback.span_byte_length !== tuple.evidence_span.end - tuple.evidence_span.start) {
		return { status: 'BLOCKED', reason: 'SOURCE_SPAN_CHECKSUM_OR_LENGTH_MISMATCH', tupleAssessment } as const;
	}

	return {
		status: 'SOURCE_BYTES_AND_SPAN_MATCH_NOT_ADMITTED' as const,
		tupleRecord: canonicalTupleRecordV1(tuple),
		tupleId: tuple.tuple_id,
		packetKey: tuple.packet_key,
		sourceRef,
		sourceRevision,
		workspaceRevision,
		span: { start: tuple.evidence_span.start, end: tuple.evidence_span.end, checksum: actualSpanChecksum },
		bindingChecksum: sourceBinding.bindingChecksum,
		bindingProducerRevision: sourceBinding.producerRevision,
		evidenceRef: input.expectedEvidenceRef,
		sourceReaderEvidenceRef: sourceReadback.evidence_ref ?? null,
		canonicalAuthority: false as const,
		admitted: false as const,
		writesPerformed: false as const,
	};
}

export async function verifyOntologyTupleSourceReadbackFromPostgresV1(input: {
	tupleId: string;
	expectedEvidenceRef: string;
	repoRoot: string;
	connect: () => Promise<{
		query: (sql: string, parameters?: unknown[]) => Promise<{ rows: Record<string, any>[] }>;
		release?: () => void;
	}>;
}) {
	if (!input.tupleId?.trim() || input.tupleId.length > 512
		|| !input.expectedEvidenceRef?.trim() || typeof input.repoRoot !== 'string' || !input.repoRoot.trim()) {
		return { status: 'BLOCKED', reason: 'TUPLE_SOURCE_READBACK_REQUEST_INVALID' } as const;
	}
	let client: Awaited<ReturnType<typeof input.connect>> | null = null;
	let transactionOpen = false;
	try {
		client = await input.connect();
		await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
		transactionOpen = true;
		await client.query("SET LOCAL statement_timeout = '10000ms'");
		await client.query("SET LOCAL lock_timeout = '1000ms'");

		const deployedColumns = await client.query(
			"SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = ANY($1::text[])",
			[['atlas_ontology_linked_tuples', 'atlas_packets']],
		);
		const available = new Map<string, Set<string>>();
		for (const row of deployedColumns.rows) {
			const columns = available.get(row.table_name) ?? new Set<string>();
			columns.add(row.column_name);
			available.set(row.table_name, columns);
		}
		const missingTuple = REQUIRED_TUPLE_COLUMNS.filter((column) => !available.get('atlas_ontology_linked_tuples')?.has(column));
		const missingPacket = REQUIRED_PACKET_COLUMNS.filter((column) => !available.get('atlas_packets')?.has(column));
		if (missingTuple.length || missingPacket.length) {
			return { status: 'BLOCKED', reason: 'DEPLOYED_READBACK_COLUMNS_MISSING', missingTuple, missingPacket } as const;
		}

		const tupleResult = await client.query(`
SELECT t.tuple_id, t.schema_version, t.packet_key, t.source_ref, t.surface_text,
       t.label, t.label_kind, t.label_source,
       t.ontology_ids, t.concept_ids, t.participants, t.evidence_refs,
       t.evidence_span, t.confidence, t.evidence_state, t.lifecycle, t.provenance,
       p.packet_key AS canonical_packet_key, p.source_ref AS packet_source_ref,
       p.source_revision AS packet_source_revision, p.workspace_revision_key AS packet_workspace_revision
  FROM public.atlas_ontology_linked_tuples t
  LEFT JOIN public.atlas_packets p ON p.packet_key = t.packet_key
 WHERE t.tuple_id = $1
 LIMIT 2`, [input.tupleId]);
		if (tupleResult.rows.length !== 1) {
			return { status: 'BLOCKED', reason: tupleResult.rows.length === 0 ? 'TUPLE_NOT_FOUND' : 'TUPLE_ID_AMBIGUOUS' } as const;
		}
		const tuple = tupleResult.rows[0] as TupleRowV1 & {
			canonical_packet_key: string | null;
			packet_source_ref: string | null;
			packet_source_revision: string | null;
			packet_workspace_revision: string | null;
		};
		const workspaceRevision = tuple.provenance?.workspaceRevision;
		const scope = assertSourceBindingScopeV1({ sourceRef: tuple.source_ref, workspaceRevision });
		const bindingResult = await client.query(SOURCE_BINDING_READONLY_SQL_V1, [scope.workspaceRevision, scope.sourceRef]);
		const packetRows = tuple.canonical_packet_key && tuple.packet_source_ref
			&& tuple.packet_source_revision && tuple.packet_workspace_revision
			? [{
				packet_key: tuple.canonical_packet_key,
				source_ref: tuple.packet_source_ref,
				source_revision: tuple.packet_source_revision,
				workspace_revision_key: tuple.packet_workspace_revision,
			}]
			: [];
		const result = await verifyOntologyTupleSourceReadbackV1({
			tuple,
			packetRows,
			sourceBindingRows: bindingResult.rows as SourceBindingRowV1[],
			repoRoot: input.repoRoot,
			expectedEvidenceRef: input.expectedEvidenceRef,
		});
		return { ...result, tupleReadback: 'POSTGRES_REPEATABLE_READ_READ_ONLY' };
	} catch (error) {
		return { status: 'BLOCKED', reason: 'TUPLE_SOURCE_READBACK_OWNER_FAILED', detail: error instanceof Error ? error.message : String(error) } as const;
	} finally {
		if (client && transactionOpen) await client.query('ROLLBACK').catch(() => {});
		client?.release?.();
	}
}
