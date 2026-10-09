import { describe, expect, it, vi } from 'vitest';
import { createAtlasOperationRequestV1 } from '@deeds/parent-atlas';
import type { AtlasStructuralEvidence } from '$lib/server/nlp/miniforge-nlp-sidecar.js';
import type { AstProvider } from '$lib/server/atlas/indexing/graphify-structural-materializer.js';
import { executeAtlasOperationV1 } from './atlas-operation-runtime-v1.js';
import * as structuralAdapter from '$lib/server/atlas/indexing/graphify-structural-intelligence-adapter.js';

vi.mock('$lib/server/atlas/indexing/graphify-structural-intelligence-adapter.js', async (importOriginal) => {
	const actual = await importOriginal<typeof import('$lib/server/atlas/indexing/graphify-structural-intelligence-adapter.js')>();
	return { ...actual, compileGraphifyStructuralIntelligence: vi.fn(actual.compileGraphifyStructuralIntelligence) };
});

describe('executeAtlasOperationV1 AST evidence forwarding', () => {
	it('preserves sidecar structural edges in the read-only operation result', async () => {
		const edge: AtlasStructuralEvidence['edges'][number] = {
			from_evidence_key: 'file:src/a.ts',
			to_evidence_key: 'import:src/b.ts',
			type: 'IMPORTS',
			evidence_start_line: 1,
			evidence_start_column: 0,
			evidence_end_line: 1,
			evidence_end_column: 20,
			resolved: false,
			resolution: 'syntax_only',
			occurrence_positions: [[1, 0]],
		};
		const evidence: AtlasStructuralEvidence = {
			schema: 'atlas.ast.evidence.v1',
			engine: 'tree-sitter',
			engine_version: 'fixture',
			language: 'typescript',
			file_path: 'src/a.ts',
			source_revision: 'sha256:source',
			chunks: [],
			edges: [edge],
			diagnostics: [],
			syntax_status: 'CLEAN',
		};
		const astProvider: AstProvider = {
			materialize: vi.fn().mockResolvedValue({
				provider: 'treesitter-chunker-8095',
				status: 'PROVEN',
				evidence,
				diagnostics: [],
			}),
		};
		const request = createAtlasOperationRequestV1({
			requestId: 'ast-edge-forwarding-test',
			operation: 'AST_CHUNK',
			revisions: { sourceRevision: 'sha256:source' },
			payload: { sourceRef: 'src/a.ts', sourceRevision: 'sha256:source', language: 'typescript', source: 'import "./b";' },
		});

		const result = await executeAtlasOperationV1(request, { astProvider });

		expect(result.status).toBe('SUCCESS');
		expect(result.receipt.canonicalAuthority).toBe(false);
		expect(result.payload).toMatchObject({ edges: [edge], chunks: [] });
		expect(astProvider.materialize).toHaveBeenCalledOnce();
	});
});

describe('executeAtlasOperationV1 AST -> structural compiler wiring (diagnostic, in-memory)', () => {
	const source = 'export function a() { return 1; }';
	const chunk = {
		upstream_chunk_id: 'chunk-a', upstream_node_id: 'node-a', upstream_file_id: 'file-a', upstream_symbol_id: 'symbol-a',
		node_type: 'function_declaration', kind: 'function', name: 'a', parent_route: [], parent_context: null,
		start_byte: 0, end_byte: source.length, start_line: 0, start_column: 0, end_line: 0, end_column: source.length,
		calls: [], imports: [], exports: ['a'],
	};
	const evidence = {
		schema: 'atlas.ast.evidence.v1', engine: 'tree-sitter', engine_version: 'fixture', language: 'typescript',
		file_path: 'src/a.ts', source_revision: 'caller-token', chunks: [chunk], edges: [], diagnostics: [], syntax_status: 'CLEAN',
	} as unknown as AtlasStructuralEvidence;
	const makeProvider = (): AstProvider => ({
		materialize: vi.fn().mockResolvedValue({ provider: 'treesitter-chunker-8095', status: 'PROVEN', evidence, diagnostics: [] }),
	});
	const makeRequest = (revisions: Record<string, string>) => createAtlasOperationRequestV1({
		requestId: 'ast-structural-wiring-test',
		operation: 'AST_CHUNK',
		revisions,
		payload: { sourceRef: 'src/a.ts', sourceRevision: 'caller-token', language: 'typescript', source },
	});

	it('reaches the compiler exactly once with the forwarded chunks, source and workspace revision; stays noncanonical', async () => {
		vi.mocked(structuralAdapter.compileGraphifyStructuralIntelligence).mockClear();
		const astProvider = makeProvider();
		const result = await executeAtlasOperationV1(makeRequest({ sourceRevision: 'caller-token', workspaceRevision: 'ws-1' }), { astProvider });

		expect(astProvider.materialize).toHaveBeenCalledOnce();
		expect(structuralAdapter.compileGraphifyStructuralIntelligence).toHaveBeenCalledOnce();
		const arg = vi.mocked(structuralAdapter.compileGraphifyStructuralIntelligence).mock.calls[0]![0];
		expect(arg.workspaceRevision).toBe('ws-1');
		expect(arg.source).toBe(source);
		expect(arg.materialization.evidence?.chunks).toEqual([chunk]);
		expect(arg.materialization.sourceRevision).toBeNull();
		expect(arg.materialization.sourceRevisionAuthority).toBe('UNPROVEN');

		const structural = (result.payload as { structural?: any }).structural;
		expect(structural.status).toBe('COMPILED');
		expect(structural.canonicalAuthority).toBe(false);
		expect(structural.persistence).toBe('NOT_ATTEMPTED');
		expect(structural.compilation.receipt.workspaceRevision).toBe('ws-1');
		expect(structural.compilation.receipt.canonicalIdentityCreated).toBe(false);
		expect(structural.compilation.receipt.canonicalPromotionMayBeAttempted).toBe(false);
		expect(structural.projectionDiagnostic).toMatchObject({
			status: 'BLOCKED_WORKSPACE_BINDING',
			canonicalAuthority: false,
			writesPerformed: false,
			counts: { totalEdges: 0, compiledCoordinates: 1, admissible: 0 },
		});
	});

	it('fails closed without calling the compiler when no workspace revision is supplied', async () => {
		vi.mocked(structuralAdapter.compileGraphifyStructuralIntelligence).mockClear();
		const result = await executeAtlasOperationV1(makeRequest({ sourceRevision: 'caller-token' }), { astProvider: makeProvider() });

		expect(structuralAdapter.compileGraphifyStructuralIntelligence).not.toHaveBeenCalled();
		const structural = (result.payload as { structural?: any }).structural;
		expect(structural.status).toBe('SKIPPED_WORKSPACE_REVISION_UNBOUND');
		expect(structural.compilation).toBeNull();
		expect(structural.diagnostics).toContain('WORKSPACE_REVISION_UNBOUND');
	});

	it('classifies an import source that has no symbol subject separately from target failures', async () => {
		const importEdge: AtlasStructuralEvidence['edges'][number] = {
			from_evidence_key: 'file:src/a.ts', to_evidence_key: 'import:src/b.ts', type: 'IMPORTS',
			evidence_start_line: 1, evidence_start_column: 0, evidence_end_line: 1, evidence_end_column: 13,
			resolved: false, resolution: 'syntax_only', occurrence_positions: [[1, 0]],
		};
		const importEvidence = { ...evidence, edges: [importEdge] } as AtlasStructuralEvidence;
		const result = await executeAtlasOperationV1(
			createAtlasOperationRequestV1({
				requestId: 'ast-import-subject-diagnostic', operation: 'AST_CHUNK',
				revisions: { sourceRevision: 'caller-token', workspaceRevision: 'caller-workspace-token' },
				payload: { sourceRef: 'src/a.ts', sourceRevision: 'caller-token', workspaceRevision: 'caller-workspace-token', language: 'typescript', source },
			}),
			{ astProvider: { materialize: vi.fn().mockResolvedValue({ provider: 'treesitter-chunker-8095', status: 'PROVEN', evidence: importEvidence, diagnostics: [] }) } },
		);
		const structural = (result.payload as { structural?: any }).structural;
		expect(structural.projectionDiagnostic.failureCounts).toMatchObject({
			GRAPHIFY_EDGE_SUBJECT_SYMBOL_UNMAPPED: 1,
		});
		expect(structural.projectionDiagnostic.counts).toMatchObject({ totalEdges: 1, compiledFacts: 0, admissible: 0 });
		expect(structural.diagnostics).toContain('PROJECTION_MAPPER_BLOCKED_SOURCE_BINDING');
	});

	it('classifies a nominated source with an unresolved target separately', async () => {
		const referenceEdge: AtlasStructuralEvidence['edges'][number] = {
			from_evidence_key: 'node-a', to_evidence_key: 'external-symbol:missing', type: 'REFERENCES',
			evidence_start_line: 1, evidence_start_column: 0, evidence_end_line: 1, evidence_end_column: 13,
			resolved: false, resolution: 'unresolved', occurrence_positions: [[1, 0]],
		};
		const referenceEvidence = { ...evidence, edges: [referenceEdge] } as AtlasStructuralEvidence;
		const result = await executeAtlasOperationV1(
			createAtlasOperationRequestV1({
				requestId: 'ast-target-unresolved-diagnostic', operation: 'AST_CHUNK',
				revisions: { sourceRevision: 'caller-token', workspaceRevision: 'caller-workspace-token' },
				payload: { sourceRef: 'src/a.ts', sourceRevision: 'caller-token', workspaceRevision: 'caller-workspace-token', language: 'typescript', source },
			}),
			{ astProvider: { materialize: vi.fn().mockResolvedValue({ provider: 'treesitter-chunker-8095', status: 'PROVEN', evidence: referenceEvidence, diagnostics: [] }) } },
		);
		const structural = (result.payload as { structural?: any }).structural;
		expect(structural.projectionDiagnostic.counts).toMatchObject({ sourceSymbolNominated: 1, sourceSpanPresent: 1, sourceEligible: 1, targetSymbolNominated: 0 });
		expect(structural.projectionDiagnostic.failureCounts).toMatchObject({ GRAPHIFY_EDGE_TARGET_SYMBOL_UNRESOLVED: 1 });
	});
});
