import { createHash } from 'node:crypto';
import { z } from 'zod';
import {
  atlasKernelFunctionV1Schema,
  buildAtlasKernelFunctionV1,
  type AtlasKernelFunctionV1,
  type BuildAtlasKernelFunctionV1Input,
} from './kernel-function-v1.js';
import { type KernelOperatorLibraryV1 } from './kernel-operator-library-v1.js';

const id = z.string().min(1);

/** A checksum-sealed registry of task-specific functions, not an executor. */
export const atlasKernelFunctionCatalogV1Schema = z.object({
  schema: z.literal('atlas.kernel-function-catalog.v1').default('atlas.kernel-function-catalog.v1'),
  catalogId: id,
  catalogRevision: id,
  taskClass: id,
  operatorLibraryRevision: id,
  // Reuses the real AtlasKernelFunctionV1 schema rather than re-declaring
  // a parallel copy — a second inline copy silently drifted out of sync
  // with kernel-function-v1.ts's own schema once that file gained
  // operatorCatalogRevision/requiredRelationTypes/requiredFeatureIds/
  // allowedEvidenceClasses/graphRevisionPolicy (2026-08-31); fixed here by
  // pointing at the source of truth instead of re-patching the copy again
  // next time it changes.
  functions: z.array(atlasKernelFunctionV1Schema),
  catalogChecksum: z.string().regex(/^[a-f0-9]{64}$/),
  producerRevision: id,
  canonicalAuthority: z.literal(false).default(false),
}).strict().superRefine((value, ctx) => {
  const seen = new Set<string>();
  for (const fn of value.functions) {
    if (seen.has(fn.functionId)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['functions'], message: `Duplicate functionId ${fn.functionId}` });
    seen.add(fn.functionId);
    if (fn.kernelRevision !== value.catalogRevision) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['functions'], message: `Function ${fn.functionId} has a mismatched kernelRevision` });
  }
});

export type AtlasKernelFunctionCatalogV1 = z.infer<typeof atlasKernelFunctionCatalogV1Schema>;

function stableJson(value: unknown): string {
  return JSON.stringify(value, (_key, item) => item && typeof item === 'object' && !Array.isArray(item)
    ? Object.keys(item as Record<string, unknown>).sort().reduce<Record<string, unknown>>((out, key) => { out[key] = (item as Record<string, unknown>)[key]; return out; }, {})
    : item);
}

function sha256(value: unknown): string {
  return createHash('sha256').update(stableJson(value), 'utf8').digest('hex');
}

export type KernelFunctionCatalogEntryInput = Omit<BuildAtlasKernelFunctionV1Input, 'operatorLibrary' | 'kernelRevision'> & { kernelRevision?: string };

export function buildAtlasKernelFunctionCatalogV1(input: {
  catalogId: string;
  catalogRevision: string;
  taskClass: string;
  operatorLibrary: KernelOperatorLibraryV1;
  functions: KernelFunctionCatalogEntryInput[];
  producerRevision: string;
}): AtlasKernelFunctionCatalogV1 {
  const functions = input.functions.map((entry) => buildAtlasKernelFunctionV1({
    ...entry,
    kernelRevision: entry.kernelRevision ?? input.catalogRevision,
    operatorLibrary: input.operatorLibrary,
  })).sort((a, b) => a.functionId.localeCompare(b.functionId));
  const body = {
    schema: 'atlas.kernel-function-catalog.v1' as const,
    catalogId: input.catalogId,
    catalogRevision: input.catalogRevision,
    taskClass: input.taskClass,
    operatorLibraryRevision: input.operatorLibrary.libraryRevision,
    functions,
    producerRevision: input.producerRevision,
    canonicalAuthority: false as const,
  };
  return atlasKernelFunctionCatalogV1Schema.parse({ ...body, catalogChecksum: sha256(body) });
}

export function findAtlasKernelFunctionV1(catalog: AtlasKernelFunctionCatalogV1, functionId: string): AtlasKernelFunctionV1 | undefined {
  return catalog.functions.find((fn) => fn.functionId === functionId);
}
