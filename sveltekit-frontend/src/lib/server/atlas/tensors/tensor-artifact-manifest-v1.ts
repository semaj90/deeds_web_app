import { createHash } from 'node:crypto';
import { z } from 'zod';

export const TensorArtifactManifestV1Schema = z.object({
  schema: z.literal('atlas.tensor-artifact-manifest.v1'),
  artifactId: z.string().min(1),
  artifactKind: z.enum(['CANDIDATE_FEATURE_MATRIX', 'SEMANTIC_TILE_MATRIX', 'ORDINAL_MAP', 'GRAPH_EDGE_ARRAY']),
  artifactFormat: z.enum(['ARROW_IPC', 'MMAP']),
  artifactUri: z.string().min(1),
  artifactChecksum: z.string().regex(/^sha256:[a-f0-9]{64}$/i),
  candidateSnapshotRevision: z.string().min(1),
  ordinalMapChecksum: z.string().regex(/^[a-f0-9]{64}$/i),
  representationId: z.literal('semantic_768').nullable(),
  representationRevision: z.string().min(1).nullable(),
  featureSchemaRevision: z.string().min(1).nullable(),
  rowCount: z.number().int().nonnegative(),
  columnCount: z.number().int().nonnegative(),
  shape: z.array(z.number().int().nonnegative()).min(1),
  dtype: z.enum(['float32', 'float16', 'int32', 'int16', 'uint64']),
  byteLength: z.number().int().nonnegative(),
  producerId: z.string().min(1),
  producerRevision: z.string().min(1),
  canonicalAuthority: z.literal(false),
}).strict().superRefine((value, ctx) => {
  if (value.shape[0] !== value.rowCount) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['shape'], message: 'ARTIFACT_ROW_SHAPE_MISMATCH' });
  if (value.shape.at(-1) !== value.columnCount) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['shape'], message: 'ARTIFACT_COLUMN_SHAPE_MISMATCH' });
  if (value.artifactKind === 'SEMANTIC_TILE_MATRIX' && (value.representationId !== 'semantic_768' || value.columnCount !== 768)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['representationId'], message: 'SEMANTIC_TILE_MATRIX_REQUIRES_SEMANTIC_768' });
  }
});

export type TensorArtifactManifestV1 = z.infer<typeof TensorArtifactManifestV1Schema>;

export function tensorArtifactManifestChecksumV1(manifest: TensorArtifactManifestV1): string {
  const { artifactChecksum: _artifactChecksum, ...identity } = manifest;
  return `sha256:${createHash('sha256').update(JSON.stringify(identity), 'utf8').digest('hex')}`;
}
