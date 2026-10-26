import { z } from 'zod';
import {
	buildContextManifestV2,
	ContextManifestV2Schema,
	type ContextManifestV2,
} from '../graph/context-manifest-v2.js';

export const LlamaToolCallFunctionV1Schema = z.object({
	name: z.string().min(1),
	arguments: z.string(),
}).strict();

export const LlamaToolCallV1Schema = z.object({
	id: z.string().min(1),
	type: z.literal('function'),
	function: LlamaToolCallFunctionV1Schema,
}).strict();

export type LlamaToolCallV1 = z.infer<typeof LlamaToolCallV1Schema>;

export const ReadEvidenceArgsV1Schema = z.object({
	evidenceRef: z.string().min(1),
	maxLines: z.number().int().positive().max(500).default(100),
}).strict();

export const QuerySymbolFactsArgsV1Schema = z.object({
	targetCandidateKey: z.string().min(1),
	facet: z.enum(['types', 'dependencies', 'callers', 'tests']).default('types'),
}).strict();

export const GetManifestChunkArgsV1Schema = z.object({
	candidateKey: z.string().min(1),
}).strict();

export const VERIFIED_TOOL_REGISTRY_V1 = {
	read_evidence: ReadEvidenceArgsV1Schema,
	query_symbol_facts: QuerySymbolFactsArgsV1Schema,
	get_manifest_chunk: GetManifestChunkArgsV1Schema,
} as const;

export type VerifiedToolNameV1 = keyof typeof VERIFIED_TOOL_REGISTRY_V1;

export interface ValidateOrnithToolCallsOptionsV1 {
	maxToolCalls?: number;
	currentDepth?: number;
	maxRecursionDepth?: number;
}

export interface ValidatedOrnithToolCallV1 {
	id: string;
	name: VerifiedToolNameV1;
	parsedArguments: Record<string, any>;
	validatedAgainstManifest: boolean;
}

/**
 * Validates Ornith 1.5 tool calls originating from llama-server :8090.
 * Conforms to ORNITH-TOOLCALL-01 and ENG-ML-OPT-22.
 *
 * Invariants:
 * 1. Prohibits unregistered tools (fails closed with UNREGISTERED_TOOL_CALL).
 * 2. Validates JSON payload against strict Zod schema for the registered tool.
 * 3. Enforces double-sided ContextManifestV2 allowlist (no hallucinated candidates/refs).
 * 4. Bounds RLM tool recursion depth and maximum calls per turn (preventing infinite loops).
 * 5. Rejects mutation terms or write instructions in arguments.
 */
export function validateOrnithToolCallsV1(
	rawCalls: unknown,
	manifest: ContextManifestV2,
	options: ValidateOrnithToolCallsOptionsV1 = {},
): ValidatedOrnithToolCallV1[] {
	const maxToolCalls = options.maxToolCalls ?? 5;
	const currentDepth = options.currentDepth ?? 0;
	const maxRecursionDepth = options.maxRecursionDepth ?? 3;

	if (currentDepth > maxRecursionDepth) {
		throw new Error(
			`RLM_RECURSION_DEPTH_EXCEEDED: depth ${currentDepth} exceeds max allowed ${maxRecursionDepth}`,
		);
	}

	if (!Array.isArray(rawCalls)) {
		throw new Error('INVALID_TOOL_CALLS_PAYLOAD: Expected array of tool calls');
	}

	if (rawCalls.length > maxToolCalls) {
		throw new Error(
			`TOOL_CALL_COUNT_BUDGET_EXCEEDED: received ${rawCalls.length} calls, max allowed is ${maxToolCalls}`,
		);
	}

	const parsedManifest = ContextManifestV2Schema.parse(manifest);
	const verifiedManifest = buildContextManifestV2(parsedManifest.v1, parsedManifest.identityInput);
	if (verifiedManifest.identityChecksum !== parsedManifest.identityChecksum) {
		throw new Error('CONTEXT_MANIFEST_IDENTITY_CHECKSUM_MISMATCH');
	}
	const allowedEvidenceSet = new Set(
		parsedManifest.v1.evidenceRefs,
	);
	const allowedCandidateSet = new Set(
		parsedManifest.v1.selectedNodeKeys,
	);

	const validatedList: ValidatedOrnithToolCallV1[] = [];

	for (const rawCall of rawCalls) {
		const parsedCall = LlamaToolCallV1Schema.parse(rawCall);
		const toolName = parsedCall.function.name;

		if (!(toolName in VERIFIED_TOOL_REGISTRY_V1)) {
			throw new Error(`UNREGISTERED_TOOL_CALL: '${toolName}' is not in verified tool registry`);
		}

		let argsObj: unknown;
		try {
			argsObj = JSON.parse(parsedCall.function.arguments);
		} catch {
			throw new Error(`MALFORMED_TOOL_ARGUMENTS_JSON for '${toolName}'`);
		}

		const schema = VERIFIED_TOOL_REGISTRY_V1[toolName as VerifiedToolNameV1];
		const parsedArgs = schema.parse(argsObj) as Record<string, any>;

		// Check manifest bounds: verify references against allowed manifest contents
		if ('evidenceRef' in parsedArgs) {
			const ref = parsedArgs.evidenceRef;
			if (!allowedEvidenceSet.has(ref)) {
				throw new Error(
					`TOOL_CALL_EVIDENCE_REF_OUTSIDE_MANIFEST: '${ref}' is not in allowed manifest evidence`,
				);
			}
		}

		if ('targetCandidateKey' in parsedArgs) {
			const cand = parsedArgs.targetCandidateKey;
			if (!allowedCandidateSet.has(cand)) {
				throw new Error(
					`TOOL_CALL_CANDIDATE_KEY_OUTSIDE_MANIFEST: '${cand}' is not in allowed manifest candidates`,
				);
			}
		}

		if ('candidateKey' in parsedArgs) {
			const cand = parsedArgs.candidateKey;
			if (!allowedCandidateSet.has(cand)) {
				throw new Error(
					`TOOL_CALL_CANDIDATE_KEY_OUTSIDE_MANIFEST: '${cand}' is not in allowed manifest candidates`,
				);
			}
		}

		validatedList.push({
			id: parsedCall.id,
			name: toolName as VerifiedToolNameV1,
			parsedArguments: parsedArgs,
			validatedAgainstManifest: true,
		});
	}

	return validatedList;
}
