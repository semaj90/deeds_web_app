import { createHash } from 'node:crypto';
import { z } from 'zod';

const id = z.string().min(1);
const sha256Hex = z.string().regex(/^[a-f0-9]{64}$/);

export const parameterArtifactV1Schema = z.object({
  schema: z.literal('atlas.parameter-artifact.v1'),
  artifactId: id,
  actionId: id,
  actionKind: id,
  schemaRef: id,
  schemaRevision: id,
  boundArguments: z.record(z.string(), z.unknown()),
  parameterChecksum: sha256Hex,
  artifactChecksum: sha256Hex,
  canonicalAuthority: z.literal(false),
  writesPerformed: z.literal(false),
}).strict();

export type ParameterArtifactV1 = z.infer<typeof parameterArtifactV1Schema>;

function stableJson(value: unknown): string {
  return JSON.stringify(value, (_key, item) => item && typeof item === 'object' && !Array.isArray(item)
    ? Object.keys(item as Record<string, unknown>).sort().reduce<Record<string, unknown>>((out, key) => {
      out[key] = (item as Record<string, unknown>)[key];
      return out;
    }, {})
    : item);
}

function sha256(value: unknown): string {
  return createHash('sha256').update(stableJson(value), 'utf8').digest('hex');
}

export function buildParameterArtifactV1(input: {
  actionId: string;
  actionKind: string;
  schemaRef: string;
  schemaRevision: string;
  boundArguments: Record<string, unknown>;
}): ParameterArtifactV1 {
  const parameterChecksum = sha256(input.boundArguments);
  const body = {
    schema: 'atlas.parameter-artifact.v1' as const,
    actionId: input.actionId,
    actionKind: input.actionKind,
    schemaRef: input.schemaRef,
    schemaRevision: input.schemaRevision,
    boundArguments: input.boundArguments,
    parameterChecksum,
    canonicalAuthority: false as const,
    writesPerformed: false as const,
  };
  const artifactChecksum = sha256(body);
  return parameterArtifactV1Schema.parse({
    ...body,
    artifactId: `parameter:v1:${artifactChecksum}`,
    artifactChecksum,
  });
}
