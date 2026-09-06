/**
 * ModelResolutionV1 — distinguishes requested, internal-canonical, and runtime-reported model
 * identity, so callers and tests stop asserting against a specific physical GGUF filename.
 *
 * Per `openspec/changes/parent-atlas-retrieval-staging-planes/specs/model-resolution-identity/spec.md`:
 * llama-server's `/v1/models` contract reports the model file path by default unless the server was
 * started with a `--alias` override — a live-runtime detail, not a stable application contract. This
 * repo has already been bitten by hardcoded-model-name test assertions going stale across the
 * Gemma4 -> Ornith 1.5 chat/synthesis model switch (see root CLAUDE.md, "Ollama Phase-Out" section).
 * `ModelResolutionV1` makes the three layers explicit so tests can assert against the layer that's
 * actually stable (a mocked runtime-discovery result, or the internal profile mapping) instead of a
 * literal model name that will drift the next time the loaded model changes.
 */

import { z } from 'zod';

export const MODEL_RESOLUTION_SOURCE_VALUES = [
  'REQUEST_ALIAS',
  'CONFIG',
  'LLAMA_V1_MODELS',
  'LLAMA_PROPS',
] as const;

export const modelResolutionSourceSchema = z.enum(MODEL_RESOLUTION_SOURCE_VALUES);

export const ModelResolutionV1Schema = z.object({
  schema: z.literal('atlas.model-resolution.v1').default('atlas.model-resolution.v1'),
  requestedModel: z.string().min(1),
  internalModel: z.string().min(1),
  runtimeModelId: z.string().min(1).nullable(),
  runtimeModelPath: z.string().min(1).nullable(),
  resolutionSource: modelResolutionSourceSchema,
  runtimeDiscovered: z.boolean(),
}).strict().superRefine((value, ctx) => {
  if (value.runtimeDiscovered && value.runtimeModelId === null) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['runtimeModelId'],
      message: 'runtimeDiscovered=true requires a non-null runtimeModelId (it was actually queried)',
    });
  }
});

export type ModelResolutionV1 = z.infer<typeof ModelResolutionV1Schema>;

/**
 * Asserts that a test/caller is not comparing against a hardcoded physical model name when the
 * resolution wasn't actually confirmed live. Use in place of `expect(res.model).toBe('some-gguf')`.
 */
export function assertRuntimeIdentityIsMocked(resolution: ModelResolutionV1, expectedMockedId: string): void {
  if (!resolution.runtimeDiscovered) {
    throw new Error(
      'assertRuntimeIdentityIsMocked called with runtimeDiscovered=false — nothing was actually ' +
        'queried, so there is no live runtime identity to assert against. Mock runtime discovery ' +
        'first, or assert against internalModel instead if testing the alias-resolution layer.'
    );
  }
  if (resolution.runtimeModelId !== expectedMockedId) {
    throw new Error(
      `Expected mocked runtimeModelId '${expectedMockedId}', got '${resolution.runtimeModelId}'. ` +
        `Assert against the mocked runtime-discovery result, not a hardcoded production model name.`
    );
  }
}
