import { beforeEach, describe, expect, it, vi } from 'vitest';

const { executeAtlasOperationV1, createAstChunkOperationRequestV1 } = vi.hoisted(() => ({
	executeAtlasOperationV1: vi.fn(),
	createAstChunkOperationRequestV1: vi.fn(),
}));

vi.mock('$lib/server/atlas/operations/atlas-operation-runtime-v1.js', () => ({
	executeAtlasOperationV1,
	createAstChunkOperationRequestV1,
}));

import { astSidecarRouter } from './ast-sidecar.js';

describe('astSidecarRouter.chunk', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		createAstChunkOperationRequestV1.mockReturnValue({ requestId: 'ast-test' });
	});

	it('forwards structural edge observations through the validated output', async () => {
		const edge = {
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
		executeAtlasOperationV1.mockResolvedValue({
			status: 'SUCCESS',
			payload: { provider: 'treesitter-chunker-8095', status: 'PROVEN', chunks: [], edges: [edge], diagnostics: [] },
		});

		const result = await astSidecarRouter.createCaller({} as never).chunk({
			sourceRef: 'src/a.ts',
			sourceRevision: 'sha256:source',
			workspaceRevision: undefined,
			language: 'typescript',
			source: 'import "./b";',
		});

		expect(result.edges).toEqual([edge]);
		expect(result.chunks).toEqual([]);
		expect(result.canonicalAuthority).toBe(false);
		expect(result.structural).toBeNull();
	});

	it('forwards only the compact noncanonical projection diagnostic through validation', async () => {
		const projectionDiagnostic = {
			schema: 'atlas.graphify-structural-projection-diagnostic.v1',
			status: 'BLOCKED_WORKSPACE_BINDING',
			counts: {
				totalEdges: 1, compiledFacts: 0, compiledCoordinates: 1, spanEvidenceCandidates: 0, evidenceMapEntries: 0,
				sourceSymbolNominated: 0, sourceSpanPresent: 0, sourceEligible: 0,
				targetSymbolNominated: 0, bothSymbolEndpointsNominated: 0, workspaceQualified: 0,
				graphQualified: 0, admissible: 0, rejectedFacts: 1,
			},
			failureCounts: { GRAPHIFY_EDGE_SUBJECT_SYMBOL_UNMAPPED: 1 },
			canonicalAuthority: false,
			writesPerformed: false,
		};
		executeAtlasOperationV1.mockResolvedValue({
			status: 'SUCCESS',
			payload: {
				provider: 'treesitter-chunker-8095', status: 'PROVEN', chunks: [], edges: [], diagnostics: [],
				structural: {
				schema: 'atlas.ast-structural-diagnostic.v1', status: 'COMPILED', canonicalAuthority: false,
					persistence: 'NOT_ATTEMPTED', workspaceRevision: 'untrusted-workspace-hint',
					workspaceRevisionAuthority: 'UNPROVEN',
					projectionDiagnostic, diagnostics: ['PROJECTION_MAPPER_BLOCKED_SOURCE_BINDING'], compilation: null,
				},
			},
		});

		const result = await astSidecarRouter.createCaller({} as never).chunk({
			sourceRef: 'src/a.ts', sourceRevision: 'sha256:source', workspaceRevision: 'untrusted-workspace-hint',
			language: 'typescript', source: 'import "./b";',
		});

		expect(result.structural?.projectionDiagnostic).toEqual(projectionDiagnostic);
		expect(JSON.stringify(result)).not.toContain('compilation');
	});
});
