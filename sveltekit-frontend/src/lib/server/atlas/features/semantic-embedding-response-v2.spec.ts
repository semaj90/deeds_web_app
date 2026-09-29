import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { validateStrictEmbeddingResponseV2 } from './semantic-embedding-response-v2.js';
import { prepareStrictEmbeddingRequestV2 } from './semantic-embedding-request-v2.js';
import {
	SEMANTIC_EMBEDDING_INPUT_MAX_TOKENS,
	SEMANTIC_EMBEDDING_INPUT_POLICY_REVISION,
	SEMANTIC_INPUT_ARTIFACT_SCHEMA,
	SEMANTIC_EMBEDDING_INPUT_SCHEMA,
	type SemanticEmbeddingInputV1,
	type SemanticInputArtifactV1,
} from './semantic-input-artifact-v1.js';

const sha = (bytes: Buffer | string) => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
const TEXT = 'export function foo() { return 1; }\n';
const FILE = Buffer.from(TEXT, 'utf8');
const TOKENIZER = sha('tokenizer-config');
const MODEL = sha('ollama-catalog-model');
const BUILD = sha('service-build');
const REPRESENTATION = sha('representation-revision');
const VECTOR = Array.from({ length: 768 }, () => Math.fround(1 / Math.sqrt(768)));

const artifact: SemanticInputArtifactV1 = {
	schema: SEMANTIC_INPUT_ARTIFACT_SCHEMA,
	canonicalId: 'packet:foo',
	packetKey: 'packet:foo',
	sourceRef: 'src/foo.ts',
	sourceRevision: sha(FILE),
	selectionPolicyRevision: 'semantic-input-compiler-v1:ts-js-top-level-declarations',
	segments: [{ kind: 'DECLARATION', startByte: 0, endByte: FILE.length, checksum: sha(FILE) }],
	renderedTextChecksum: sha(FILE),
	tokenCount: 10,
};

const embeddingInput: SemanticEmbeddingInputV1 = {
	schema: SEMANTIC_EMBEDDING_INPUT_SCHEMA,
	canonicalId: artifact.canonicalId,
	packetKey: artifact.packetKey,
	sourceRef: artifact.sourceRef,
	sourceRevision: artifact.sourceRevision,
	contentSelectionRevision: artifact.selectionPolicyRevision,
	inputPolicyRevision: SEMANTIC_EMBEDDING_INPUT_POLICY_REVISION,
	tokenizerRevision: TOKENIZER,
	maxInputTokens: SEMANTIC_EMBEDDING_INPUT_MAX_TOKENS,
	renderedTextChecksum: sha(FILE),
	embeddedInputChecksum: sha(FILE),
	embeddedTokenCount: 10,
	status: 'ADMITTED',
	inputText: TEXT,
};

function response(overrides: Record<string, unknown> = {}) {
	const prepared = prepareStrictEmbeddingRequestV2({ artifact, fileBuffer: FILE, embeddingInput });
	const base = {
		schema: 'atlas.embedding-response.v2',
		status: 'ADMITTED',
		embedding: VECTOR,
		capability: {
			schema: 'atlas.embedding-capability.v2',
			serviceBuildRevision: BUILD,
			modelName: 'embeddinggemma:latest',
			ollamaModelDigest: MODEL,
			ggufArtifactDigest: null,
			ggufArtifactBindingStatus: 'UNAVAILABLE_NOT_PROVEN',
			backendRuntimeRevision: 'ollama-0.34.4',
			tokenizerRevision: TOKENIZER,
			tokenizerBindingStatus: 'CONFIGURED_REVISION_NOT_RUNTIME_ATTESTED',
			dimensions: 768,
			dtype: 'float32-le',
			normalizationPolicyRevision: 'verify-unit-l2-v1',
			preprocessingPolicyRevision: 'ollama-api-embed-direct-text-v1',
			representationRevision: REPRESENTATION,
		},
		receipt: {
			schema: 'atlas.embedding-receipt.v2',
			inputChecksum: prepared.request.inputChecksum,
			inputArtifactChecksum: prepared.request.inputArtifactChecksum,
			contentSelectionRevision: prepared.request.contentSelectionRevision,
			inputPolicyRevision: prepared.request.inputPolicyRevision,
			tokenizerRevision: TOKENIZER,
			representationRevision: REPRESENTATION,
			ollamaModelDigest: MODEL,
			ggufArtifactDigest: null,
			serviceBuildRevision: BUILD,
			runtimeBindingStatus: 'OBSERVED_PRE_POST_RESIDENT_DIGEST_STABLE',
			residentModelDigestBefore: MODEL,
			residentModelDigestAfter: MODEL,
			responseModelName: 'embeddinggemma:latest',
			atomicPerCallModelBinding: false,
			dimensions: 768,
			dtype: 'float32-le',
			normalized: true,
			l2Norm: Math.sqrt(VECTOR.reduce((sum, value) => sum + value * value, 0)),
			vectorChecksum: sha(vectorBytes(VECTOR)),
			cacheKeyRevision: 'v2',
			cacheHit: false,
			canonicalAuthority: false,
		},
		error: '',
	};
	return {
		...base,
		...overrides,
		receipt: { ...base.receipt, ...(overrides.receipt as object | undefined) },
		capability: { ...base.capability, ...(overrides.capability as object | undefined) },
	};
}

function vectorBytes(values: readonly number[]): Buffer {
	const bytes = Buffer.alloc(values.length * 4);
	values.forEach((value, index) => bytes.writeFloatLE(Math.fround(value), index * 4));
	return bytes;
}

function validate(raw = response(), source = FILE) {
	return validateStrictEmbeddingResponseV2({ artifact, fileBuffer: source, embeddingInput, response: raw });
}

describe('validateStrictEmbeddingResponseV2', () => {
	it('binds exact source/input, encoder observations, and float32 vector bytes without granting authority', () => {
		const result = validate();
		expect(result.identity).toEqual({
			canonicalId: artifact.canonicalId,
			packetKey: artifact.packetKey,
			sourceRef: artifact.sourceRef,
			sourceRevision: artifact.sourceRevision,
		});
		expect(result.status).toBe('OBSERVED_NONCANONICAL');
		expect(result.canonicalAuthority).toBe(false);
		expect(result.encoder.ollamaModelDigest).toBe(MODEL);
		expect(result.encoder.ggufArtifactDigest).toBeNull();
		expect(result.execution.atomicPerCallModelBinding).toBe(false);
		expect(result.vector.checksum).toBe(sha(vectorBytes(VECTOR)));
		expect(result.blockers).toContain('TOKENIZER_RUNTIME_ATTESTATION_MISSING');
	});

	it('rejects current-source byte drift before accepting a response', () => {
		const driftedSource = Buffer.from(FILE);
		driftedSource[0] = driftedSource[0]! ^ 1;
		expect(() => validate(response(), driftedSource))
			.toThrow('SEMANTIC_INPUT_SOURCE_REVISION_MISMATCH');
	});

	it('rejects request and receipt checksum disagreement', () => {
		expect(() => validate(response({ receipt: { inputArtifactChecksum: sha('other-artifact') } })))
			.toThrow('EMBEDDING_RESPONSE_REQUEST_BINDING_MISMATCH');
	});

	it('rejects a model digest that changes across observed inference', () => {
		expect(() => validate(response({ receipt: { residentModelDigestAfter: sha('changed-model') } })))
			.toThrow('EMBEDDING_RESPONSE_RESIDENT_MODEL_OBSERVATION_MISMATCH');
	});

	it('rejects altered vector bytes even when source and model receipts match', () => {
		const altered = [...VECTOR];
		altered[0] = 0.25;
		expect(() => validate(response({ embedding: altered })))
			.toThrow('EMBEDDING_RESPONSE_VECTOR_CHECKSUM_MISMATCH');
	});

	it('rejects service claims of canonical or atomic per-call authority', () => {
		expect(() => validate(response({ receipt: { canonicalAuthority: true } }))).toThrow();
		expect(() => validate(response({ receipt: { atomicPerCallModelBinding: true } }))).toThrow();
	});

	it('admits a cache hit only as a non-executing replay observation', () => {
		const cached = response({ receipt: {
			cacheHit: true,
			runtimeBindingStatus: 'CACHE_HIT_NO_MODEL_EXECUTION',
			residentModelDigestBefore: undefined,
			residentModelDigestAfter: undefined,
			responseModelName: undefined,
		} });
		const result = validate(cached);
		expect(result.execution.cacheHit).toBe(true);
		expect(result.blockers).toContain('MODEL_NOT_EXECUTED_FOR_THIS_REQUEST');
	});

	it('rejects malformed and wrong-dimension vectors', () => {
		expect(() => validate(response({ embedding: VECTOR.slice(1) }))).toThrow();
		const nonFinite = [...VECTOR];
		nonFinite[4] = Number.POSITIVE_INFINITY;
		expect(() => validate(response({ embedding: nonFinite }))).toThrow();
	});
});
