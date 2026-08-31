import { createHash } from 'node:crypto';
import { z } from 'zod';
import { type AtlasOntologyKernelSchemaV1 } from './ontology-kernel-schema-v1.js';
import { type KernelOperatorLibraryV1 } from './kernel-operator-library-v1.js';
import { type AtlasKernelFunctionV1 } from './kernel-function-v1.js';

const id = z.string().min(1);
const revision = z.string().min(1);

/**
 * AtlasOntologyKernelManifestV1 (OAK-10) — the freeze. Binds one schema
 * revision to one function set revision under one checksum. This is the
 * artifact `KernelBoundDagPlannerV1` (OAK-07, not yet built) would read to
 * know the exact `F` surface a task class is allowed to use.
 *
 * `state` starts at `DRAFT` here. This module cannot produce `FROZEN` or
 * `PROMOTED` — those require OAK-03 (OWL/HermiT verification) and OAK-08/09
 * (judge + repair loop) to have actually run, neither of which exists yet.
 * Setting `state` by hand to anything past `VERIFIED` is refused by the
 * schema below, the same way `ontology-kernel-schema-v1.ts` refuses a
 * hand-set `VERIFIED` verificationStatus.
 */
export const kernelManifestStateSchema = z.enum(['DRAFT', 'VERIFIED', 'EVALUATING', 'REPAIR_REQUIRED', 'FROZEN', 'PROMOTED']);

export const atlasOntologyKernelManifestV1Schema = z.object({
  schema: z.literal('atlas.ontology-kernel-manifest.v1').default('atlas.ontology-kernel-manifest.v1'),
  kernelId: id,
  kernelRevision: revision,
  taskClass: z.string().min(1),
  schemaId: id,
  schemaChecksum: z.string().regex(/^[a-f0-9]{64}$/),
  functionSetChecksum: z.string().regex(/^[a-f0-9]{64}$/),
  functionIds: z.array(id),
  operatorLibraryRevision: revision,
  state: kernelManifestStateSchema,
  kernelChecksum: z.string().regex(/^[a-f0-9]{64}$/),
  producerRevision: revision,
  canonicalAuthority: z.literal(false).default(false),
}).strict().superRefine((value, ctx) => {
  const allowedUnattended = new Set(['DRAFT']);
  if (!allowedUnattended.has(value.state)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['state'],
      message: `state ${value.state} requires OAK-03/OAK-08/OAK-09 (not yet implemented) — buildAtlasOntologyKernelManifestV1 only produces DRAFT`,
    });
  }
});

export type AtlasOntologyKernelManifestV1 = z.infer<typeof atlasOntologyKernelManifestV1Schema>;

function stableJson(value: unknown): string {
  return JSON.stringify(value, (_key, item) => {
    if (item && typeof item === 'object' && !Array.isArray(item)) {
      return Object.keys(item as Record<string, unknown>).sort().reduce<Record<string, unknown>>((out, key) => {
        out[key] = (item as Record<string, unknown>)[key];
        return out;
      }, {});
    }
    return item;
  });
}

function sha256(value: unknown): string {
  return createHash('sha256').update(stableJson(value), 'utf8').digest('hex');
}

export function buildAtlasOntologyKernelManifestV1(input: {
  kernelId: string;
  kernelRevision: string;
  schema: AtlasOntologyKernelSchemaV1;
  operatorLibrary: KernelOperatorLibraryV1;
  functions: AtlasKernelFunctionV1[];
  producerRevision: string;
}): AtlasOntologyKernelManifestV1 {
  for (const fn of input.functions) {
    if (fn.kernelRevision !== input.kernelRevision) {
      throw new Error(`KERNEL_MANIFEST_REVISION_MISMATCH:${fn.functionId}`);
    }
  }
  const functionSetChecksum = sha256(input.functions.map((f) => f.implementationChecksum).sort());
  const body = {
    schema: 'atlas.ontology-kernel-manifest.v1' as const,
    kernelId: input.kernelId,
    kernelRevision: input.kernelRevision,
    taskClass: input.schema.taskClass,
    schemaId: input.schema.schemaId,
    schemaChecksum: input.schema.schemaChecksum,
    functionSetChecksum,
    functionIds: input.functions.map((f) => f.functionId).sort(),
    operatorLibraryRevision: input.operatorLibrary.libraryRevision,
    state: 'DRAFT' as const,
    producerRevision: input.producerRevision,
    canonicalAuthority: false as const,
  };
  return atlasOntologyKernelManifestV1Schema.parse({ ...body, kernelChecksum: sha256(body) });
}
