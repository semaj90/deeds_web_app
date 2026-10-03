import { z } from 'zod';
import { sha256Stable } from './contracts.js';

// AFC-PARAM-01: parameter resolution modes for planner-assembled tool/helper calls.
// EXACT: value came directly from a validated upstream contract (no inference).
// DERIVED: value was computed deterministically from other EXACT/DERIVED values.
// DEFAULTED: value was filled in from a policy default because no evidence existed.
//
// Hard rule: DEFAULTED is never permitted for an identity/revision parameter. A planner
// may default `topK`/`timeoutMs`-style tuning knobs, but never an identity or revision
// field — a defaulted `sourceRevision`, for example, is silent staleness, not a knob.

export const PARAMETER_BINDING_SCHEMA_V1 = 'atlas.parameter-binding.v1' as const;

export const ParameterBindingModeSchema = z.enum(['EXACT', 'DERIVED', 'DEFAULTED']);
export type ParameterBindingMode = z.infer<typeof ParameterBindingModeSchema>;

export const IDENTITY_REVISION_PARAMETER_NAMES = [
	'canonicalId',
	'packetKey',
	'sourceRevision',
	'workspaceRevision',
	'symbolVersionId',
	'candidateSnapshotRevision',
	'ordinalMapChecksum',
	'representationRevision',
] as const;
export type IdentityRevisionParameterName = (typeof IDENTITY_REVISION_PARAMETER_NAMES)[number];

const IDENTITY_REVISION_PARAMETER_NAME_SET: ReadonlySet<string> = new Set(IDENTITY_REVISION_PARAMETER_NAMES);
export function isIdentityRevisionParameterName(name: string): name is IdentityRevisionParameterName {
	return IDENTITY_REVISION_PARAMETER_NAME_SET.has(name);
}

export const ParameterBindingV1Schema = z.object({
	schema: z.literal(PARAMETER_BINDING_SCHEMA_V1),
	parameterName: z.string().min(1),
	mode: ParameterBindingModeSchema,
	value: z.string().min(1),
	derivedFromRefs: z.array(z.string().min(1)),
	checksum: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();
export type ParameterBindingV1 = z.infer<typeof ParameterBindingV1Schema>;

export function buildParameterBindingV1(input: {
	parameterName: string;
	mode: ParameterBindingMode;
	value: string;
	derivedFromRefs?: readonly string[];
}): ParameterBindingV1 {
	if (input.mode === 'DEFAULTED' && isIdentityRevisionParameterName(input.parameterName)) {
		throw new Error(`DEFAULTED_IDENTITY_REVISION_PARAMETER:${input.parameterName}`);
	}
	if (input.mode === 'EXACT' && (input.derivedFromRefs?.length ?? 0) > 0) {
		throw new Error(`EXACT_PARAMETER_MUST_NOT_CARRY_DERIVATION_REFS:${input.parameterName}`);
	}
	if (input.mode === 'DERIVED' && (input.derivedFromRefs?.length ?? 0) === 0) {
		throw new Error(`DERIVED_PARAMETER_REQUIRES_DERIVATION_REFS:${input.parameterName}`);
	}
	const body = {
		schema: PARAMETER_BINDING_SCHEMA_V1,
		parameterName: input.parameterName,
		mode: input.mode,
		value: input.value,
		derivedFromRefs: [...new Set(input.derivedFromRefs ?? [])].sort(),
	};
	return ParameterBindingV1Schema.parse({ ...body, checksum: sha256Stable(body) });
}

export function assertParameterBindingV1(value: ParameterBindingV1): ParameterBindingV1 {
	const binding = ParameterBindingV1Schema.parse(value);
	const { checksum, ...body } = binding;
	if (sha256Stable(body) !== checksum) throw new Error('PARAMETER_BINDING_CHECKSUM_MISMATCH');
	if (binding.mode === 'DEFAULTED' && isIdentityRevisionParameterName(binding.parameterName)) {
		throw new Error(`DEFAULTED_IDENTITY_REVISION_PARAMETER:${binding.parameterName}`);
	}
	return binding;
}

export const PARAMETER_BINDING_SET_SCHEMA_V1 = 'atlas.parameter-binding-set.v1' as const;
export const ParameterBindingSetV1Schema = z.object({
	schema: z.literal(PARAMETER_BINDING_SET_SCHEMA_V1),
	bindings: z.array(ParameterBindingV1Schema),
	checksum: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();
export type ParameterBindingSetV1 = z.infer<typeof ParameterBindingSetV1Schema>;

export function buildParameterBindingSetV1(bindings: readonly ParameterBindingV1[]): ParameterBindingSetV1 {
	const validated = bindings.map(assertParameterBindingV1).sort((a, b) => (a.parameterName < b.parameterName ? -1 : a.parameterName > b.parameterName ? 1 : 0));
	if (new Set(validated.map((binding) => binding.parameterName)).size !== validated.length) {
		throw new Error('DUPLICATE_PARAMETER_BINDING');
	}
	const body = { schema: PARAMETER_BINDING_SET_SCHEMA_V1, bindings: validated };
	return ParameterBindingSetV1Schema.parse({ ...body, checksum: sha256Stable(body) });
}
