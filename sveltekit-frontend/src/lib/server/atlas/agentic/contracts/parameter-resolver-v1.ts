import { z } from 'zod';
import {
  matchesParameterArtifactLookupV1,
  ParameterArtifactLookupV1Schema,
  type ParameterArtifactCompatibilityQueryV1,
  type ParameterArtifactLookupV1,
} from '../../contracts/parameter-artifact-lookup-v1.js';

export const ParameterResolutionV1Schema = z.object({
  schema: z.literal('atlas.parameter-resolution.v1'),
  status: z.enum(['RESOLVED', 'UNAVAILABLE', 'AMBIGUOUS']),
  query: z.record(z.string(), z.unknown()),
  artifact: ParameterArtifactLookupV1Schema.nullable(),
  candidateCount: z.number().int().nonnegative(),
  canonicalAuthority: z.boolean(),
  writesPerformed: z.literal(false),
}).strict();

export type ParameterResolutionV1 = z.infer<typeof ParameterResolutionV1Schema>;

/**
 * Read-only resolver over the existing parameter-artifact receipt owner.
 * It intentionally does not fetch, register, mutate, or choose between
 * multiple compatible artifacts.
 */
export function resolveParameterArtifactV1(
  query: ParameterArtifactCompatibilityQueryV1,
  candidates: readonly ParameterArtifactLookupV1[],
): ParameterResolutionV1 {
  const parsed = candidates.map((candidate) => ParameterArtifactLookupV1Schema.parse(candidate));
  const matches = parsed.filter((candidate) => matchesParameterArtifactLookupV1(candidate, query));
  const status = matches.length === 1 ? 'RESOLVED' : matches.length === 0 ? 'UNAVAILABLE' : 'AMBIGUOUS';
  return ParameterResolutionV1Schema.parse({
    schema: 'atlas.parameter-resolution.v1',
    status,
    query,
    artifact: matches.length === 1 ? matches[0] : null,
    candidateCount: matches.length,
    canonicalAuthority: matches.length === 1 ? matches[0].canonicalAuthority : false,
    writesPerformed: false,
  });
}
