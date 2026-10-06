import type { StructuralExtractionFabricResultV1 } from '@deeds/parent-atlas';
import type { AtlasStructuralEvidence } from '$lib/server/nlp/miniforge-nlp-sidecar.js';

export type GraphifyStructuralProjectionDiagnosticV1 = {
	schema: 'atlas.graphify-structural-projection-diagnostic.v1';
	status: 'DIAGNOSTIC_ONLY' | 'BLOCKED_WORKSPACE_BINDING';
	counts: {
		totalEdges: number;
		compiledFacts: number;
		compiledCoordinates: number;
		spanEvidenceCandidates: number;
		evidenceMapEntries: number;
		sourceSymbolNominated: number;
		sourceSpanPresent: number;
		sourceEligible: number;
		targetSymbolNominated: number;
		bothSymbolEndpointsNominated: number;
		workspaceQualified: number;
		graphQualified: number;
		admissible: number;
		rejectedFacts: number;
	};
	failureCounts: Record<string, number>;
	canonicalAuthority: false;
	writesPerformed: false;
};

function positionToByte(source: Buffer, line1: number, column0: number): number | null {
	if (!Number.isInteger(line1) || line1 < 1 || !Number.isInteger(column0) || column0 < 0) return null;
	let lineStart = 0;
	for (let line = 1; line < line1; line += 1) {
		const newline = source.indexOf(10, lineStart);
		if (newline < 0) return null;
		lineStart = newline + 1;
	}
	let lineEnd = source.indexOf(10, lineStart);
	if (lineEnd < 0) lineEnd = source.length;
	else if (lineEnd > lineStart && source[lineEnd - 1] === 13) lineEnd -= 1;
	const byte = lineStart + column0;
	return byte <= lineEnd ? byte : null;
}

function hasExactSpan(source: Buffer, edge: AtlasStructuralEvidence['edges'][number]): boolean {
	const start = positionToByte(source, edge.evidence_start_line, edge.evidence_start_column);
	const end = positionToByte(source, edge.evidence_end_line, edge.evidence_end_column);
	return start !== null && end !== null && end > start;
}

export function diagnoseGraphifyStructuralProjectionV1(input: {
	source: string;
	evidence: AtlasStructuralEvidence;
	fabric: StructuralExtractionFabricResultV1;
	workspaceBindingVerified: boolean;
	graphSnapshotVerified: boolean;
	evidenceMapEntryCount: number;
}): GraphifyStructuralProjectionDiagnosticV1 {
	const source = Buffer.from(input.source, 'utf8');
	const nominationNodeIds = new Set(input.fabric.symbol_nominations.map((item) => item.upstream_node_id));
	const edgeByFact = new Map<string, AtlasStructuralEvidence['edges'][number]>();
	for (const fact of input.fabric.reference_facts) {
		const edge = input.evidence.edges.find((candidate) =>
			candidate.from_evidence_key === fact.captures.xref_source_key
			&& candidate.to_evidence_key === fact.captures.xref_target_key
			&& candidate.type.toUpperCase() === fact.captures.xref_type?.toUpperCase());
		if (edge) edgeByFact.set(fact.reference_id, edge);
	}
	const failureCounts: Record<string, number> = {};
	let sourceSymbolNominated = 0;
	let sourceSpanPresent = 0;
	let sourceEligible = 0;
	let targetSymbolResolved = 0;
	let bothEndpointsResolved = 0;
	let spanEvidenceCandidates = 0;
	let rejectedFacts = input.fabric.receipt.unresolved_xref_source_count;

	if (rejectedFacts > 0) failureCounts.GRAPHIFY_EDGE_SUBJECT_SYMBOL_UNMAPPED = rejectedFacts;
	for (const fact of input.fabric.reference_facts) {
		const sourceNominated = nominationNodeIds.has(fact.upstream_source_node_id);
		const targetResolved = Boolean(fact.upstream_target_node_id && nominationNodeIds.has(fact.upstream_target_node_id));
		const edge = edgeByFact.get(fact.reference_id);
		const spanPresent = Boolean(edge && hasExactSpan(source, edge));
		if (sourceNominated) sourceSymbolNominated += 1;
		if (spanPresent) {
			sourceSpanPresent += 1;
			spanEvidenceCandidates += 1;
		}
		if (targetResolved) targetSymbolResolved += 1;
		if (sourceNominated && spanPresent) sourceEligible += 1;
		if (sourceNominated && targetResolved && spanPresent) bothEndpointsResolved += 1;

		let failure: string | null = null;
		if (!sourceNominated) failure = 'GRAPHIFY_EDGE_SUBJECT_SYMBOL_UNMAPPED';
		else if (!spanPresent) failure = 'GRAPHIFY_EDGE_SOURCE_SPAN_MISSING';
		else if (!targetResolved) failure = 'GRAPHIFY_EDGE_TARGET_SYMBOL_UNRESOLVED';
		else failure = 'PACKET_KEY_UNRESOLVED';
		failureCounts[failure] = (failureCounts[failure] ?? 0) + 1;
		rejectedFacts += 1;
	}
	if (!input.workspaceBindingVerified) failureCounts.WORKSPACE_REVISION_UNBOUND = input.fabric.reference_facts.length;
	if (!input.graphSnapshotVerified) failureCounts.GRAPH_REVISION_MISSING = input.fabric.reference_facts.length;

	return {
		schema: 'atlas.graphify-structural-projection-diagnostic.v1',
		status: input.workspaceBindingVerified ? 'DIAGNOSTIC_ONLY' : 'BLOCKED_WORKSPACE_BINDING',
		counts: {
			totalEdges: input.evidence.edges.length,
			compiledFacts: input.fabric.reference_facts.length,
			compiledCoordinates: input.fabric.chunks.filter((chunk) => chunk.byte_start >= 0 && chunk.byte_end <= source.length && chunk.byte_end >= chunk.byte_start).length,
			spanEvidenceCandidates,
			evidenceMapEntries: input.evidenceMapEntryCount,
			sourceSymbolNominated,
			sourceSpanPresent,
			sourceEligible,
			targetSymbolNominated: targetSymbolResolved,
			bothSymbolEndpointsNominated: bothEndpointsResolved,
			workspaceQualified: input.workspaceBindingVerified ? input.fabric.reference_facts.length : 0,
			graphQualified: input.graphSnapshotVerified ? input.fabric.reference_facts.length : 0,
			admissible: 0,
			rejectedFacts,
		},
		failureCounts,
		canonicalAuthority: false,
		writesPerformed: false,
	};
}
