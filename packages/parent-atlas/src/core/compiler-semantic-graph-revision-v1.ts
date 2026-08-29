import { createHash } from 'node:crypto';
import { z } from 'zod';

const checksum = z.string().regex(/^sha256:[0-9a-f]{64}$/);
const position = z.object({ line: z.number().int().nonnegative(), character: z.number().int().nonnegative() }).strict();
const targetRange = z.object({ start: position, end: position }).strict();

export const compilerSemanticGraphRevisionInputSchema = z.object({
  workspaceRevision: z.string().min(1),
  sourceInventoryDigest: checksum,
  projectConfiguration: z.object({
    tsconfigChecksum: checksum,
    svelteConfigChecksum: checksum.nullable(),
    packageJsonChecksum: checksum,
    lockfileChecksum: checksum,
    projectReferenceDigest: checksum,
  }).strict(),
  runtime: z.object({
    typescriptVersion: z.string().min(1),
    typescriptLanguageServerVersion: z.string().min(1),
    svelteLanguageServerVersion: z.string().min(1),
    resolverRevision: z.string().min(1),
  }).strict(),
  resolutions: z.array(z.object({
    sourceRef: z.string().min(1),
    sourceRevision: z.string().min(1),
    occurrencePosition: position,
    targetSourceRef: z.string().nullable(),
    targetSourceRevision: z.string().nullable(),
    targetRange: targetRange.nullable(),
    resolutionClass: z.enum(['RESOLVED_INTERNAL', 'RESOLVED_WORKSPACE_MODULE', 'EXTERNAL_PACKAGE', 'NODE_BUILTIN', 'EXTERNAL_RESOURCE', 'UNSUPPORTED_LANGUAGE', 'SOURCE_MISSING', 'AMBIGUOUS', 'UNRESOLVED_ERROR']),
  }).strict()),
}).strict();

export const compilerSemanticGraphRevisionSchema = z.object({
  schema: z.literal('atlas.compiler-semantic-graph-revision.v1'),
  workspaceRevision: z.string().min(1),
  sourceInventoryDigest: checksum,
  projectConfiguration: compilerSemanticGraphRevisionInputSchema.shape.projectConfiguration,
  runtime: compilerSemanticGraphRevisionInputSchema.shape.runtime,
  resolutionCount: z.number().int().nonnegative(),
  resolutionsChecksum: checksum,
  compilerSemanticGraphRevision: checksum,
  canonicalAuthority: z.literal(false),
}).strict();

export type CompilerSemanticGraphRevisionInputV1 = z.infer<typeof compilerSemanticGraphRevisionInputSchema>;
export type CompilerSemanticGraphRevisionV1 = z.infer<typeof compilerSemanticGraphRevisionSchema>;

function digest(value: unknown): string {
  return `sha256:${createHash('sha256').update(JSON.stringify(value), 'utf8').digest('hex')}`;
}

function compareResolution(a: CompilerSemanticGraphRevisionInputV1['resolutions'][number], b: CompilerSemanticGraphRevisionInputV1['resolutions'][number]): number {
  const left = [a.sourceRef, a.sourceRevision, a.occurrencePosition.line, a.occurrencePosition.character, a.targetSourceRef ?? '', a.targetSourceRevision ?? '', a.resolutionClass];
  const right = [b.sourceRef, b.sourceRevision, b.occurrencePosition.line, b.occurrencePosition.character, b.targetSourceRef ?? '', b.targetSourceRevision ?? '', b.resolutionClass];
  return JSON.stringify(left).localeCompare(JSON.stringify(right));
}

/** Derives a compiler-semantic revision without reading or writing any external store. */
export function deriveCompilerSemanticGraphRevisionV1(raw: CompilerSemanticGraphRevisionInputV1): CompilerSemanticGraphRevisionV1 {
  const input = compilerSemanticGraphRevisionInputSchema.parse(raw);
  const resolutions = [...input.resolutions].sort(compareResolution);
  const resolutionRows = resolutions.map((row) => ({ ...row }));
  const resolutionsChecksum = digest(resolutionRows);
  const revision = digest({
    workspaceRevision: input.workspaceRevision,
    sourceInventoryDigest: input.sourceInventoryDigest,
    projectConfiguration: input.projectConfiguration,
    runtime: input.runtime,
    resolutions: resolutionRows,
  });
  return compilerSemanticGraphRevisionSchema.parse({
    schema: 'atlas.compiler-semantic-graph-revision.v1',
    workspaceRevision: input.workspaceRevision,
    sourceInventoryDigest: input.sourceInventoryDigest,
    projectConfiguration: input.projectConfiguration,
    runtime: input.runtime,
    resolutionCount: resolutionRows.length,
    resolutionsChecksum,
    compilerSemanticGraphRevision: revision,
    canonicalAuthority: false,
  });
}
