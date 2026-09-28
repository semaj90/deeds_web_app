import { createHash } from 'node:crypto';
import { z } from 'zod';
import {
	prepareStrictEmbeddingRequestV2,
	type StrictEmbeddingRequestV2,
} from './semantic-embedding-request-v2.js';
import {
	semanticEmbeddingInputV1Schema,
	semanticInputArtifactV1Schema,
	type SemanticEmbeddingInputV1,
	type SemanticInputArtifactV1,
} from './semantic-input-artifact-v1.js';

const sha256 = z.string().regex(/^sha256:[0-9a-f]{64}$/);
const vectorV2Schema = z.array(z.number().finite()).length(768);

const capabilityV2Schema = z.object({
	schema: z.literal('atlas.embedding-capability.v2'),
	serviceBuildRevision: sha256,
	modelName: z.string().min(1),
	ollamaModelDigest: sha256,
	ggufArtifactDigest: sha256.nullable(),
	ggufArtifactBindingStatus: z.literal('UNAVAILABLE_NOT_PROVEN'),
	backendRuntimeRevision: z.string().min(1),
	tokenizerRevision: sha256,
	tokenizerBindingStatus: z.literal('CONFIGURED_REVISION_NOT_RUNTIME_ATTESTED'),
	dimensions: z.literal(768),
	dtype: z.literal('float32-le'),
	normalizationPolicyRevision: z.string().min(1),
	preprocessingPolicyRevision: z.string().min(1),
	representationRevision: sha256,
}).strict();

const receiptV2Schema = z.object({
	schema: z.literal('atlas.embedding-receipt.v2'),
	inputChecksum: sha256,
	inputArtifactChecksum: sha256,
	contentSelectionRevision: z.string().min(1),
	inputPolicyRevision: z.string().min(1),
	tokenizerRevision: sha256,
	representationRevision: sha256,
	ollamaModelDigest: sha256,
	ggufArtifactDigest: sha256.nullable(),
	serviceBuildRevision: sha256,
	runtimeBindingStatus: z.enum([
		'OBSERVED_PRE_POST_RESIDENT_DIGEST_STABLE',
		'CACHE_HIT_NO_MODEL_EXECUTION',
	]),
	residentModelDigestBefore: sha256.optional(),
	residentModelDigestAfter: sha256.optional(),
	responseModelName: z.string().min(1).optional(),
	atomicPerCallModelBinding: z.literal(false),
	dimensions: z.literal(768),
	dtype: z.literal('float32-le'),
	normalized: z.literal(true),
	l2Norm: z.number().finite().min(0.99).max(1.01),
	vectorChecksum: sha256,
	cacheKeyRevision: z.literal('v2'),
	cacheHit: z.boolean(),
	canonicalAuthority: z.literal(false),
}).strict();

export const StrictEmbeddingResponseV2Schema = z.object({
	schema: z.literal('atlas.embedding-response.v2'),
	status: z.literal('ADMITTED'),
	embedding: vectorV2Schema,
	capability: capabilityV2Schema,
	receipt: receiptV2Schema,
	error: z.string(),
}).strict();

export type StrictEmbeddingResponseV2 = z.infer<typeof StrictEmbeddingResponseV2Schema>;

export const SEMANTIC_EMBEDDING_OBSERVATION_SCHEMA_V2 = 'atlas.semantic-embedding-observation.v2' as const;

export interface SemanticEmbeddingObservationV2 {
	schema: typeof SEMANTIC_EMBEDDING_OBSERVATION_SCHEMA_V2;
	status: 'OBSERVED_NONCANONICAL';
	identity: {
		canonicalId: string;
		packetKey: string | null;
		sourceRef: string;
		sourceRevision: string;
	};
	request: StrictEmbeddingRequestV2;
	encoder: {
		modelName: string;
		ollamaModelDigest: string;
		ggufArtifactDigest: string | null;
		ggufArtifactBindingStatus: 'UNAVAILABLE_NOT_PROVEN';
		backendRuntimeRevision: string;
		tokenizerRevision: string;
		tokenizerBindingStatus: 'CONFIGURED_REVISION_NOT_RUNTIME_ATTESTED';
		serviceBuildRevision: string;
		representationRevision: string;
	};
	execution: {
		cacheHit: boolean;
		runtimeBindingStatus: StrictEmbeddingResponseV2['receipt']['runtimeBindingStatus'];
		atomicPerCallModelBinding: false;
	};
	vector: {
		dimensions: 768;
		dtype: 'float32-le';
		normalized: true;
		checksum: string;
		values: number[];
	};
	canonicalAuthority: false;
	blockers: string[];
}

function sha256Prefixed(bytes: Buffer): string {
	return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

function vectorBytesAndNorm(values: readonly number[]): { bytes: Buffer; norm: number } {
	const bytes = Buffer.allocUnsafe(values.length * Float32Array.BYTES_PER_ELEMENT);
	let squaredNorm = 0;
	for (let i = 0; i < values.length; i += 1) {
		const value = Math.fround(values[i]!);
		if (!Number.isFinite(value)) throw new Error('EMBEDDING_RESPONSE_VECTOR_NON_FINITE_FLOAT32');
		bytes.writeFloatLE(value, i * Float32Array.BYTES_PER_ELEMENT);
		squaredNorm += value * value;
	}
	return { bytes, norm: Math.sqrt(squaredNorm) };
}

/**
 * Verify an /embed/v2 response against the exact compiler artifact, current
 * source bytes, request policy, and returned float32 bytes. This is an
 * observation/admission check only: it never writes a vector or grants
 * canonical authority. The current service deliberately reports configured
 * tokenizer identity and non-atomic Ollama model binding.
 */
export function validateStrictEmbeddingResponseV2(input: {
	artifact: SemanticInputArtifactV1;
	fileBuffer: Buffer;
	embeddingInput: SemanticEmbeddingInputV1;
	response: unknown;
}): SemanticEmbeddingObservationV2 {
	const artifact = semanticInputArtifactV1Schema.parse(input.artifact);
	const embeddingInput = semanticEmbeddingInputV1Schema.parse(input.embeddingInput);
	const prepared = prepareStrictEmbeddingRequestV2({
		artifact,
		fileBuffer: input.fileBuffer,
		embeddingInput,
	});
	const response = StrictEmbeddingResponseV2Schema.parse(input.response);
	const { capability, receipt } = response;

	if (receipt.inputChecksum !== prepared.request.inputChecksum
		|| receipt.inputArtifactChecksum !== prepared.request.inputArtifactChecksum
		|| receipt.contentSelectionRevision !== prepared.request.contentSelectionRevision
		|| receipt.inputPolicyRevision !== prepared.request.inputPolicyRevision) {
		throw new Error('EMBEDDING_RESPONSE_REQUEST_BINDING_MISMATCH');
	}
	if (receipt.tokenizerRevision !== embeddingInput.tokenizerRevision
		|| capability.tokenizerRevision !== receipt.tokenizerRevision
		|| receipt.representationRevision !== capability.representationRevision
		|| receipt.ollamaModelDigest !== capability.ollamaModelDigest
		|| receipt.ggufArtifactDigest !== capability.ggufArtifactDigest
		|| receipt.serviceBuildRevision !== capability.serviceBuildRevision) {
		throw new Error('EMBEDDING_RESPONSE_CAPABILITY_BINDING_MISMATCH');
	}

	const { bytes, norm } = vectorBytesAndNorm(response.embedding);
	if (sha256Prefixed(bytes) !== receipt.vectorChecksum) {
		throw new Error('EMBEDDING_RESPONSE_VECTOR_CHECKSUM_MISMATCH');
	}
	if (Math.abs(norm - receipt.l2Norm) > 1e-6) {
		throw new Error('EMBEDDING_RESPONSE_VECTOR_NORM_MISMATCH');
	}
	if (receipt.cacheHit) {
		if (receipt.runtimeBindingStatus !== 'CACHE_HIT_NO_MODEL_EXECUTION'
			|| receipt.residentModelDigestBefore !== undefined
			|| receipt.residentModelDigestAfter !== undefined
			|| receipt.responseModelName !== undefined) {
			throw new Error('EMBEDDING_RESPONSE_CACHE_EXECUTION_CLAIM_MISMATCH');
		}
	} else if (receipt.runtimeBindingStatus !== 'OBSERVED_PRE_POST_RESIDENT_DIGEST_STABLE'
		|| receipt.residentModelDigestBefore !== capability.ollamaModelDigest
		|| receipt.residentModelDigestAfter !== capability.ollamaModelDigest
		|| receipt.responseModelName?.trim().toLowerCase() !== capability.modelName.trim().toLowerCase()) {
		throw new Error('EMBEDDING_RESPONSE_RESIDENT_MODEL_OBSERVATION_MISMATCH');
	}

	const blockers = [
		'GGUF_ARTIFACT_BINDING_UNPROVEN',
		'TOKENIZER_RUNTIME_ATTESTATION_MISSING',
		'ATOMIC_PER_CALL_MODEL_BINDING_UNPROVEN',
		'CANONICAL_ROW_READBACK_NOT_PERFORMED',
	];
	if (receipt.cacheHit) blockers.push('MODEL_NOT_EXECUTED_FOR_THIS_REQUEST');

	return {
		schema: SEMANTIC_EMBEDDING_OBSERVATION_SCHEMA_V2,
		status: 'OBSERVED_NONCANONICAL',
		identity: {
			canonicalId: artifact.canonicalId,
			packetKey: artifact.packetKey,
			sourceRef: artifact.sourceRef,
			sourceRevision: artifact.sourceRevision,
		},
		request: prepared.request,
		encoder: {
			modelName: capability.modelName,
			ollamaModelDigest: capability.ollamaModelDigest,
			ggufArtifactDigest: capability.ggufArtifactDigest,
			ggufArtifactBindingStatus: capability.ggufArtifactBindingStatus,
			backendRuntimeRevision: capability.backendRuntimeRevision,
			tokenizerRevision: capability.tokenizerRevision,
			tokenizerBindingStatus: capability.tokenizerBindingStatus,
			serviceBuildRevision: capability.serviceBuildRevision,
			representationRevision: capability.representationRevision,
		},
		execution: {
			cacheHit: receipt.cacheHit,
			runtimeBindingStatus: receipt.runtimeBindingStatus,
			atomicPerCallModelBinding: false,
		},
		vector: {
			dimensions: 768,
			dtype: 'float32-le',
			normalized: true,
			checksum: receipt.vectorChecksum,
			values: response.embedding,
		},
		canonicalAuthority: false,
		blockers,
	};
}
