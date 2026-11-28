import { z } from 'zod';

/**
 * Zod contract for the active Parent Atlas runtime stack:
 * - :8090 llama-server -> Gemma 4 legal merge (supersedes Ornith 1.5)
 * - :8094 EG2 ONNX -> EmbeddingGemma 2 MRL 768/512/256/128 (supersedes embeddinggemma_300m_onnx / 384-dim / Nomic)
 * - :8095 miniforge-nlp-sidecar -> oaklib + OBO + PFB1
 * - :8098 FastAPI/RAPIDS -> domain classifier & ML sidecar (.safetensors / .pt / .onnx), advisory only
 */

export const RETIRED_SYNTHESIS_MODELS = ['ornith-1.5', 'ornith-1_5', 'ornith-1.5-9b'] as const;
export const RETIRED_EMBEDDING_MODELS = ['embeddinggemma_300m_onnx', 'nomic-embed-text', 'all-minilm'] as const;

export const CurrentStackContractV1Schema = z.object({
	schema: z.literal('atlas.current-stack-contract.v1'),
	synthesis8090: z.object({
		port: z.literal(8090),
		modelId: z.string().min(1).refine(
			(id) => !RETIRED_SYNTHESIS_MODELS.some((retired) => id.toLowerCase().includes(retired)),
			{ message: 'SUPERSEDED_SYNTHESIS_MODEL: Ornith 1.5 is superseded by gemma4-legal-iq4xs-direct.gguf on :8090' },
		),
	}),
	embedding8094: z.object({
		port: z.literal(8094),
		modelFamily: z.literal('embeddinggemma2'),
		modelId: z.string().min(1).refine(
			(id) => !RETIRED_EMBEDDING_MODELS.some((retired) => id.toLowerCase().includes(retired)),
			{ message: 'SUPERSEDED_EMBEDDING_MODEL: legacy embeddinggemma_300m_onnx / nomic is superseded by :8094 embeddinggemma2' },
		),
		canonicalDim: z.literal(768),
		mrlDims: z.tuple([z.literal(768), z.literal(512), z.literal(256), z.literal(128)]),
	}),
	nlpSidecar8095: z.object({
		port: z.literal(8095),
		ontologyProvider: z.literal('oaklib'),
		primaryObo: z.literal('atlas-domain-and-language-terms-v1.obo'),
		companionObo: z.literal('atlas-codebase-semantic-terms-v1.obo'),
		pfb1HeaderBytes: z.literal(104),
	}),
	classifierFastApi8098: z.object({
		port: z.literal(8098),
		framework: z.literal('fastapi'),
		checkpointFormats: z.array(z.enum(['.safetensors', '.pt', '.onnx'])).min(1),
		canonicalAuthority: z.literal(false),
	}),
}).strict();

export type CurrentStackContractV1 = z.infer<typeof CurrentStackContractV1Schema>;

export interface StackAuditResultV1 {
	status: 'CURRENT' | 'STALE_OR_SUPERSEDED';
	issues: string[];
}

export function auditCurrentStackContractV1(input: unknown): StackAuditResultV1 {
	const parsed = CurrentStackContractV1Schema.safeParse(input);
	if (parsed.success) {
		return { status: 'CURRENT', issues: [] };
	}
	return {
		status: 'STALE_OR_SUPERSEDED',
		issues: parsed.error.issues.map((issue) => `${issue.path.join('.') || 'root'}: ${issue.message}`),
	};
}

export const CURRENT_WORKSTATION_STACK_V1: CurrentStackContractV1 = {
	schema: 'atlas.current-stack-contract.v1',
	synthesis8090: {
		port: 8090,
		modelId: 'gemma4-legal-iq4xs-direct.gguf',
	},
	embedding8094: {
		port: 8094,
		modelFamily: 'embeddinggemma2',
		modelId: 'onnx-community/embeddinggemma2-q8:onnx/model_quantized.onnx',
		canonicalDim: 768,
		mrlDims: [768, 512, 256, 128],
	},
	nlpSidecar8095: {
		port: 8095,
		ontologyProvider: 'oaklib',
		primaryObo: 'atlas-domain-and-language-terms-v1.obo',
		companionObo: 'atlas-codebase-semantic-terms-v1.obo',
		pfb1HeaderBytes: 104,
	},
	classifierFastApi8098: {
		port: 8098,
		framework: 'fastapi',
		checkpointFormats: ['.safetensors', '.pt', '.onnx'],
		canonicalAuthority: false,
	},
};
