import {
	createAtlasOperationRequestV1,
	somCoordinates,
	somNeuronOrdinal,
	type AtlasOperationRequestV1,
	type AtlasOperationResponseV1,
} from '@deeds/parent-atlas';
import { create8095AstProvider } from '$lib/server/atlas/indexing/graphify-structural-materializer.js';
import { classifyDomainTaxonomy, type DomainTaxonomyInput } from '$lib/server/atlas/domain-taxonomy.js';

export type AstChunkOperationPayloadV1 = {
	sourceRef: string;
	sourceRevision: string;
	language: string;
	source: string;
};

export type AstChunkOperationResultV1 = {
	provider: 'treesitter-chunker-8095';
	status: 'PROVEN' | 'RECOVERED_WITH_ERRORS' | 'FAILED';
	chunks: unknown[];
	diagnostics: string[];
	errorTag?: string | null;
};

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
	);
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
): Promise<AtlasOperationResponseV1<AstChunkOperationResultV1 | DomainClassifyOperationResultV1 | SomNeighborhoodOperationResultV1>> {
	const started = Date.now();
	const receipt = (evidenceRefs: string[] = []) => ({
		elapsedMs: Date.now() - started,
		canonicalAuthority: request.operation === 'AST_CHUNK',
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

	const result = await create8095AstProvider().materialize(request.payload);
	const payload: AstChunkOperationResultV1 = {
		provider: 'treesitter-chunker-8095',
		status: result.status,
		chunks: result.evidence?.chunks ?? [],
		diagnostics: result.diagnostics,
		errorTag: result.errorTag ?? null,
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
		revisions: { sourceRevision: input.sourceRevision },
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
