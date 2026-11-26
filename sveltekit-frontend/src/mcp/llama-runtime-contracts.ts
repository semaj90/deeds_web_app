/**
 * Typed contracts for the llama-server :8090 MCP tools. The PowerShell controller
 * (scripts/atlas/llama-server-control.ps1) is the only owner of stop/start behaviour; these
 * schemas describe its inputs and JSON receipt. The spec checks the profile list matches it.
 */
import { z } from 'zod/v3';

export const LLAMA_PROFILE_IDS = ['gemma4-legal-iq4xs', 'gemma4-legal-iq4xs-vlm', 'ornith-1.5', 'ornith-1.5-vlm'] as const;
export const llamaProfileSchema = z.enum(LLAMA_PROFILE_IDS);
export type LlamaControlProfile = z.infer<typeof llamaProfileSchema>;

export interface LlamaProfileDescriptorV1 {
	family: 'gemma4' | 'ornith-1.5';
	modelId: string;
	vision: boolean;
	/** Paths under <repo>/models that must exist before a switch stops anything. */
	files: readonly string[];
}

export const LLAMA_PROFILES: Readonly<Record<LlamaControlProfile, LlamaProfileDescriptorV1>> = {
	'gemma4-legal-iq4xs': { family: 'gemma4', modelId: 'gemma4-legal-iq4xs-direct.gguf', vision: false, files: ['gemma4-legal-iq4xs-direct.gguf'] },
	'gemma4-legal-iq4xs-vlm': { family: 'gemma4', modelId: 'gemma4-legal-iq4xs-direct.gguf', vision: true, files: ['gemma4-legal-iq4xs-direct.gguf', 'mmproj-F16.gguf'] },
	'ornith-1.5': { family: 'ornith-1.5', modelId: 'ornith-1.5-9b', vision: false, files: ['ornith-1_5-9b-ad-q5_k-q4_k/hforf.gguf'] },
	'ornith-1.5-vlm': { family: 'ornith-1.5', modelId: 'ornith-1.5-9b', vision: true, files: ['ornith-1_5-9b-ad-q5_k-q4_k/hforf.gguf', 'mmproj-Ornith-1.5-9B-BF16.gguf'] },
};

export const llamaActionSchema = z.enum(['status', 'start', 'unload', 'switch']);
export type LlamaControlAction = z.infer<typeof llamaActionSchema>;
export type LlamaMutationAction = Exclude<LlamaControlAction, 'status'>;

// `confirm` only guards against accidental calls. Authorization comes from the lifecycle gate.
export const llamaNoInputSchema = z.object({}).strict();
export const llamaStartInputSchema = z.object({ confirm: z.literal(true), profile: llamaProfileSchema.optional() }).strict();
export const llamaUnloadInputSchema = z.object({ confirm: z.literal(true) }).strict();
export const llamaSwitchInputSchema = z.object({ confirm: z.literal(true), profile: llamaProfileSchema }).strict();

const gpuSampleSchema = z.object({ uuid: z.string(), totalMiB: z.number(), usedMiB: z.number(), freeMiB: z.number() });
// PowerShell writes a one-element array as an array here, but empty or missing fields may be null.
export const llamaSnapshotSchema = z.object({
	observedAt: z.string(),
	listenerPids: z.array(z.number()),
	processIds: z.array(z.number()),
	healthy: z.boolean(),
	modelId: z.string().nullable(),
	modelFile: z.string().nullable().optional(),
	vision: z.boolean().nullable().optional(),
	slots: z.unknown(),
	gpus: z.array(gpuSampleSchema),
	gpuError: z.string().nullable(),
}).passthrough();
export type LlamaSnapshotV1 = z.infer<typeof llamaSnapshotSchema>;

export const llamaControlReceiptSchema = z.object({
	schema: z.literal('atlas.llama-runtime-control.v1'),
	action: llamaActionSchema,
	port: z.literal(8090),
	status: z.enum(['ERROR', 'RUNNING', 'STOPPED', 'UNHEALTHY', 'ALREADY_RUNNING']),
	serviceMutationPerformed: z.boolean(),
	before: llamaSnapshotSchema.nullable(),
	after: llamaSnapshotSchema.nullable(),
	memoryDeltas: z.array(z.object({ uuid: z.string(), usedMiBChange: z.number(), freeMiBChange: z.number() })),
	memoryReleaseObserved: z.boolean().nullable(),
	restoreProfile: llamaProfileSchema.nullable().optional(),
	profileSource: z.string().nullable().optional(),
	previousProfile: llamaProfileSchema.nullable().optional(),
	rolledBack: z.boolean().nullable().optional(),
	error: z.string().nullable(),
});
export type LlamaControlReceiptV1 = z.infer<typeof llamaControlReceiptSchema>;

/** One-use, short-lived approval written by scripts/atlas/grant-llama-lifecycle.ps1. */
export const llamaLifecycleGrantSchema = z.object({
	schema: z.literal('atlas.llama-lifecycle-grant.v1'),
	nonce: z.string().regex(/^[a-f0-9]{32}$/),
	action: z.enum(['start', 'unload', 'switch']),
	profile: llamaProfileSchema.nullable(),
	createdAt: z.string().datetime({ offset: true }),
	expiresAt: z.string().datetime({ offset: true }),
}).strict();
export type LlamaLifecycleGrantV1 = z.infer<typeof llamaLifecycleGrantSchema>;
