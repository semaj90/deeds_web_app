import {
	createAtlasOperationRequestV1,
	somCoordinates,
	somNeuronOrdinal,
	type AtlasOperationRequestV1,
	type AtlasOperationResponseV1,
} from '@deeds/parent-atlas';
import { createHash } from 'node:crypto';
import { GraphifyStructuralMaterializer, create8095AstProvider } from '$lib/server/atlas/indexing/graphify-structural-materializer.js';
import type { AstProvider, AstProviderResult } from '$lib/server/atlas/indexing/graphify-structural-materializer.js';
import {
	compileGraphifyStructuralIntelligence,
	type GraphifyStructuralIntelligenceResult,
} from '$lib/server/atlas/indexing/graphify-structural-intelligence-adapter.js';
import type { AtlasStructuralEvidenceEdge } from '$lib/server/nlp/miniforge-nlp-sidecar.js';
import { classifyDomainTaxonomy, type DomainTaxonomyInput } from '$lib/server/atlas/domain-taxonomy.js';
import {
	diagnoseGraphifyStructuralProjectionV1,
	type GraphifyStructuralProjectionDiagnosticV1,
} from '$lib/server/atlas/indexing/graphify-structural-projection-diagnostic-v1.js';

export type AstChunkOperationPayloadV1 = {
	sourceRef: string;
	sourceRevision: string;
	workspaceRevision?: string;
	language: string;
	source: string;
};

/**
 * In-memory diagnostic only: the structural fabric compiled from the forwarded AST evidence.
 * Never persisted, never canonical. The request's source revision is a caller-supplied parser
 * correlation token, so authority is recorded as UNPROVEN (content anchor = sha256 of the source).
 */
export type AstStructuralDiagnosticV1 = {
	schema: 'atlas.ast-structural-diagnostic.v1';
	status: 'COMPILED' | 'SKIPPED_PROVIDER_FAILED' | 'SKIPPED_WORKSPACE_REVISION_UNBOUND' | 'COMPILE_FAILED';
	canonicalAuthority: false;
	persistence: 'NOT_ATTEMPTED';
	workspaceRevision: string | null;
	workspaceRevisionAuthority: 'UNPROVEN';
	compilation: GraphifyStructuralIntelligenceResult | null;
	projectionDiagnostic: GraphifyStructuralProjectionDiagnosticV1 | null;
	diagnostics: string[];
};

export type AstChunkOperationResultV1 = {
	provider: 'treesitter-chunker-8095';
	status: 'PROVEN' | 'RECOVERED_WITH_ERRORS' | 'FAILED';
	chunks: unknown[];
	edges: AtlasStructuralEvidenceEdge[];
	diagnostics: string[];
	errorTag?: string | null;
	structural?: AstStructuralDiagnosticV1;
};

const AST_DIAGNOSTIC_REVISIONS = {
	astGrep: 'not-run',
	langExtract: 'not-run',
	adapter: 'atlas-operation-ast-chunk-diagnostic-v1',
	fabric: 'atlas-operation-ast-chunk-diagnostic-v1',
} as const;

async function compileAstStructuralDiagnostic(
	payload: AstChunkOperationPayloadV1,
	providerResult: AstProviderResult,
	workspaceRevision: string | undefined,
): Promise<AstStructuralDiagnosticV1> {
	const base = {
		schema: 'atlas.ast-structural-diagnostic.v1' as const,
		canonicalAuthority: false as const,
		persistence: 'NOT_ATTEMPTED' as const,
		workspaceRevision: workspaceRevision ?? null,
		workspaceRevisionAuthority: 'UNPROVEN' as const,
		compilation: null,
		projectionDiagnostic: null,
	};
	if (providerResult.status === 'FAILED' || !providerResult.evidence) {
		return { ...base, status: 'SKIPPED_PROVIDER_FAILED', diagnostics: ['STRUCTURAL_COMPILE_SKIPPED_PROVIDER_FAILED'] };
	}
	if (!workspaceRevision?.trim()) {
		return { ...base, status: 'SKIPPED_WORKSPACE_REVISION_UNBOUND', diagnostics: ['WORKSPACE_REVISION_UNBOUND'] };
	}
	try {
		// Replay the already-fetched provider result: the sidecar is called exactly once per operation.
		const materialization = await new GraphifyStructuralMaterializer({
			materialize: async () => providerResult,
		}).materialize({
			sourceRef: payload.sourceRef,
			sourceRevision: null,
			sourceVersionAnchor: `sha256:${createHash('sha256').update(payload.source, 'utf8').digest('hex')}`,
			sourceRevisionAuthority: 'UNPROVEN',
			language: payload.language,
			source: payload.source,
		});
		const compilation = compileGraphifyStructuralIntelligence({
			source: payload.source,
			parserBuffer: Buffer.from(payload.source, 'utf8'),
			workspaceRevision,
			materialization,
			revisions: { chunker: providerResult.evidence.engine_version, ...AST_DIAGNOSTIC_REVISIONS },
		});
		const projectionDiagnostic = compilation.fabric
			? diagnoseGraphifyStructuralProjectionV1({
				source: payload.source,
				evidence: providerResult.evidence,
				fabric: compilation.fabric,
				workspaceBindingVerified: false,
				graphSnapshotVerified: false,
				evidenceMapEntryCount: Object.keys(compilation.projectionEvidence?.referenceEvidenceByReferenceId ?? {}).length,
			})
			: null;
		return {
			...base,
			status: 'COMPILED',
			compilation,
			projectionDiagnostic,
			diagnostics: [
				...compilation.receipt.diagnostics,
				...(projectionDiagnostic ? Object.keys(projectionDiagnostic.failureCounts).map((code) => `PROJECTION_DIAGNOSTIC:${code}:${projectionDiagnostic.failureCounts[code]}`) : []),
				'PROJECTION_MAPPER_BLOCKED_SOURCE_BINDING',
			],
		};
	} catch (error) {
		return {
			...base,
			status: 'COMPILE_FAILED',
			diagnostics: [`STRUCTURAL_COMPILE_FAILED:${error instanceof Error ? error.message : String(error)}`],
		};
	}
}

export type DomainClassifyOperationPayloadV1 = DomainTaxonomyInput;
export type DomainClassifyOperationResultV1 = ReturnType<typeof classifyDomainTaxonomy>;
export type SomNeighborhoodOperationPayloadV1 = { neuronOrdinal: number; radius: number };
export type SomNeighborhoodOperationResultV1 = {
	neuronOrdinal: number;
	row: number;
	col: number;
	radius: number;
	neuronOrdinals: number[];
};

const AST_EXECUTOR = {
	implementation: 'treesitter-chunker-8095',
	language: 'python',
	backend: 'http-json',
} as const;

const DOMAIN_EXECUTOR = {
	implementation: 'parent-atlas-domain-taxonomy-v1',
	language: 'typescript',
	backend: 'deterministic-rules',
} as const;

function isAstPayload(value: unknown): value is AstChunkOperationPayloadV1 {
	if (!value || typeof value !== 'object') return false;
	const payload = value as Record<string, unknown>;
	return ['sourceRef', 'sourceRevision', 'language', 'source'].every(
		(key) => typeof payload[key] === 'string' && payload[key].length > 0,
	) && (payload.workspaceRevision === undefined || (typeof payload.workspaceRevision === 'string' && payload.workspaceRevision.length > 0));
}

function isDomainPayload(value: unknown): value is DomainClassifyOperationPayloadV1 {
	return Boolean(value && typeof value === 'object');
}

function isSomNeighborhoodPayload(value: unknown): value is SomNeighborhoodOperationPayloadV1 {
	if (!value || typeof value !== 'object') return false;
	const payload = value as Record<string, unknown>;
	return Number.isInteger(payload.neuronOrdinal) && Number.isInteger(payload.radius)
		&& Number(payload.neuronOrdinal) >= 0 && Number(payload.neuronOrdinal) < 400
		&& Number(payload.radius) >= 0 && Number(payload.radius) <= 19;
}

export async function executeAtlasOperationV1(
	request: AtlasOperationRequestV1,
	options: { astProvider?: AstProvider } = {},
): Promise<AtlasOperationResponseV1<AstChunkOperationResultV1 | DomainClassifyOperationResultV1 | SomNeighborhoodOperationResultV1>> {
	const started = Date.now();
	const receipt = (evidenceRefs: string[] = []) => ({
		elapsedMs: Date.now() - started,
		canonicalAuthority: false as const,
		requestedRevisions: request.revisions,
		effectiveRevisions: request.revisions,
		evidenceRefs,
	});

	if (request.operation !== 'AST_CHUNK') {
		if (request.operation === 'SOM_NEIGHBORHOOD' && isSomNeighborhoodPayload(request.payload)) {
			const [row, col] = somCoordinates(request.payload.neuronOrdinal);
			const neuronOrdinals: number[] = [];
			for (let candidateRow = Math.max(0, row - request.payload.radius); candidateRow <= Math.min(19, row + request.payload.radius); candidateRow += 1) {
				for (let candidateCol = Math.max(0, col - request.payload.radius); candidateCol <= Math.min(19, col + request.payload.radius); candidateCol += 1) {
					neuronOrdinals.push(somNeuronOrdinal(candidateRow, candidateCol));
				}
			}
			return {
				schema: 'atlas.operation.v1',
				status: 'SUCCESS',
				operation: request.operation,
				executor: { implementation: 'parent-atlas-som-lattice-v1', language: 'typescript', backend: 'deterministic-ordinal' },
				receipt: receipt(),
				payload: { neuronOrdinal: request.payload.neuronOrdinal, row, col, radius: request.payload.radius, neuronOrdinals },
			};
		}
		if (request.operation === 'DOMAIN_CLASSIFY' && isDomainPayload(request.payload)) {
			const classification = classifyDomainTaxonomy(request.payload);
			return {
				schema: 'atlas.operation.v1',
				status: 'SUCCESS',
				operation: request.operation,
				executor: DOMAIN_EXECUTOR,
				receipt: receipt(),
				payload: classification,
			};
		}
		return {
			schema: 'atlas.operation.v1',
			status: 'FAILED',
			operation: request.operation,
			executor: { implementation: 'none', language: 'typescript', backend: 'fail-closed' },
			receipt: receipt(),
			errorCode: 'ATLAS_OPERATION_NOT_IMPLEMENTED',
			errorMessage: `${request.operation} has no registered executor`,
		};
	}

	if (!isAstPayload(request.payload)) {
		return {
			schema: 'atlas.operation.v1',
			status: 'FAILED',
			operation: request.operation,
			executor: AST_EXECUTOR,
			receipt: receipt(),
			errorCode: 'ATLAS_OPERATION_FAILED',
			errorMessage: 'AST_CHUNK payload is invalid',
		};
	}

	const result = await (options.astProvider ?? create8095AstProvider()).materialize(request.payload);
	const payload: AstChunkOperationResultV1 = {
		provider: 'treesitter-chunker-8095',
		status: result.status,
		chunks: result.evidence?.chunks ?? [],
		edges: result.evidence?.edges ?? [],
		diagnostics: result.diagnostics,
		errorTag: result.errorTag ?? null,
		structural: await compileAstStructuralDiagnostic(
			request.payload,
			result,
			request.revisions.workspaceRevision ?? request.payload.workspaceRevision,
		),
	};

	return {
		schema: 'atlas.operation.v1',
		status: result.status === 'FAILED' ? 'FAILED' : result.status === 'PROVEN' ? 'SUCCESS' : 'DEGRADED',
		operation: request.operation,
		executor: AST_EXECUTOR,
		receipt: receipt([request.payload.sourceRef]),
		payload,
	};
}

export function createAstChunkOperationRequestV1(input: AstChunkOperationPayloadV1, requestId: string) {
	return createAtlasOperationRequestV1({
		requestId,
		operation: 'AST_CHUNK',
		revisions: {
			sourceRevision: input.sourceRevision,
			...(input.workspaceRevision ? { workspaceRevision: input.workspaceRevision } : {}),
		},
		payload: input,
	});
}

export function createDomainClassifyOperationRequestV1(
	input: DomainClassifyOperationPayloadV1,
	requestId: string,
) {
	return createAtlasOperationRequestV1({
		requestId,
		operation: 'DOMAIN_CLASSIFY',
		revisions: {},
		payload: input,
	});
}

export function createSomNeighborhoodOperationRequestV1(
	input: SomNeighborhoodOperationPayloadV1,
	requestId: string,
) {
	return createAtlasOperationRequestV1({
		requestId,
		operation: 'SOM_NEIGHBORHOOD',
		revisions: { featureRevision: 'topology-feature4-v1' },
		payload: input,
	});
}
