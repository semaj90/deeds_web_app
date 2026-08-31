import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { AtlasOntologyKernelManifestV1 } from './ontology-kernel-manifest-v1.js';
import type { AtlasKernelFunctionCatalogV1 } from './kernel-function-catalog-v1.js';
import { findAtlasKernelFunctionV1 } from './kernel-function-catalog-v1.js';
import type { KernelOperatorLibraryV1 } from './kernel-operator-library-v1.js';
import { planKernelBoundDagV1, type KernelBoundDagPlannerInputV1 } from './kernel-bound-dag-planner-v1.js';
import type { AdaptiveDagPlanV1 } from './adaptive-dag-plan-v1.js';

const sha256Hex = z.string().regex(/^[a-f0-9]{64}$/);

export const oak2026DspyKernelBindingV1Schema = z.object({
  schema: z.literal('atlas.oak2026-dspy-kernel-binding.v1'),
  kernelRevision: z.string().min(1),
  taskClass: z.string().min(1),
  schemaChecksum: sha256Hex,
  functionCatalogChecksum: sha256Hex,
  allowedFunctions: z.array(z.string().min(1)).min(1),
  allowedEvidenceClasses: z.array(z.string().min(1)).min(1),
  bindingChecksum: sha256Hex,
  canonicalAuthority: z.literal(false),
}).strict();

export type Oak2026DspyKernelBindingV1 = z.infer<typeof oak2026DspyKernelBindingV1Schema>;

export const oak2026DspyProposalV1Schema = z.object({
  schema: z.literal('atlas.oak2026-dspy-proposal.v1'),
  kernelRevision: z.string().min(1),
  taskClass: z.string().min(1),
  schemaChecksum: sha256Hex,
  functionCatalogChecksum: sha256Hex,
  bindingChecksum: sha256Hex,
  programRevision: z.string().min(1),
  requiredEvidenceClasses: z.array(z.string().min(1)),
  classificationConfidence: z.number().finite().min(0).max(1),
  functionName: z.string().min(1),
  arguments: z.record(z.string(), z.unknown()),
  evidenceRefs: z.array(z.string().min(1)),
  canonicalAuthority: z.literal(false),
}).strict();

export type Oak2026DspyProposalV1 = z.infer<typeof oak2026DspyProposalV1Schema>;

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

function bindingBody(input: {
  manifest: AtlasOntologyKernelManifestV1;
  catalog: AtlasKernelFunctionCatalogV1;
}) {
  const manifestFunctions = new Set(input.manifest.functionIds);
  const allowedEvidenceClasses = [...new Set(
    input.catalog.functions
      .filter((fn) => manifestFunctions.has(fn.functionId))
      .flatMap((fn) => fn.allowedEvidenceClasses),
  )].sort();
  return {
    kernelRevision: input.manifest.kernelRevision,
    taskClass: input.manifest.taskClass,
    schemaChecksum: input.manifest.schemaChecksum,
    functionCatalogChecksum: input.catalog.catalogChecksum,
    allowedFunctions: [...input.manifest.functionIds].sort(),
    allowedEvidenceClasses,
    canonicalAuthority: false as const,
  };
}

export function computeOak2026BindingChecksumV1(input: {
  manifest: AtlasOntologyKernelManifestV1;
  catalog: AtlasKernelFunctionCatalogV1;
}): string {
  return sha256(bindingBody(input));
}

export function buildOak2026DspyKernelBindingV1(input: {
  manifest: AtlasOntologyKernelManifestV1;
  catalog: AtlasKernelFunctionCatalogV1;
}): Oak2026DspyKernelBindingV1 {
  if (input.manifest.kernelRevision !== input.catalog.catalogRevision) {
    throw new Error('OAK2026_DSPY_BINDING_KERNEL_REVISION_MISMATCH');
  }
  if (input.manifest.taskClass !== input.catalog.taskClass) {
    throw new Error('OAK2026_DSPY_BINDING_TASK_CLASS_MISMATCH');
  }
  const body = bindingBody(input);
  return oak2026DspyKernelBindingV1Schema.parse({
    schema: 'atlas.oak2026-dspy-kernel-binding.v1',
    ...body,
    bindingChecksum: sha256(body),
  });
}

export function admitOak2026DspyProposalV1(input: {
  proposal: Oak2026DspyProposalV1;
  manifest: AtlasOntologyKernelManifestV1;
  catalog: AtlasKernelFunctionCatalogV1;
  operatorLibrary: KernelOperatorLibraryV1;
  planId: string;
  queryId: string;
  plannerRevision: string;
}): AdaptiveDagPlanV1 {
  const proposal = oak2026DspyProposalV1Schema.parse(input.proposal);
  const binding = buildOak2026DspyKernelBindingV1({ manifest: input.manifest, catalog: input.catalog });
  if (proposal.kernelRevision !== binding.kernelRevision) throw new Error('OAK2026_DSPY_KERNEL_REVISION_MISMATCH');
  if (proposal.taskClass !== binding.taskClass) throw new Error('OAK2026_DSPY_TASK_CLASS_MISMATCH');
  if (proposal.schemaChecksum !== binding.schemaChecksum) throw new Error('OAK2026_DSPY_SCHEMA_CHECKSUM_MISMATCH');
  if (proposal.functionCatalogChecksum !== binding.functionCatalogChecksum) throw new Error('OAK2026_DSPY_CATALOG_CHECKSUM_MISMATCH');
  if (proposal.bindingChecksum !== binding.bindingChecksum) throw new Error('OAK2026_DSPY_BINDING_CHECKSUM_MISMATCH');
  if (!binding.allowedFunctions.includes(proposal.functionName)) {
    throw new Error(`OAK2026_DSPY_UNDECLARED_FUNCTION:${proposal.functionName}`);
  }
  const fn = findAtlasKernelFunctionV1(input.catalog, proposal.functionName);
  if (!fn) throw new Error(`OAK2026_DSPY_FUNCTION_NOT_IN_CATALOG:${proposal.functionName}`);
  const allowedEvidence = new Set(fn.allowedEvidenceClasses);
  for (const evidenceClass of proposal.requiredEvidenceClasses) {
    if (!allowedEvidence.has(evidenceClass)) throw new Error(`OAK2026_DSPY_EVIDENCE_CLASS_NOT_ALLOWED:${evidenceClass}`);
  }
  const request: KernelBoundDagPlannerInputV1 = {
    planId: input.planId,
    queryId: input.queryId,
    plannerRevision: input.plannerRevision,
    classificationRevision: proposal.programRevision,
    boundArguments: proposal.arguments,
    evidenceRefs: [...new Set(proposal.evidenceRefs)].sort(),
    inputChecksum: sha256(proposal),
  };
  return planKernelBoundDagV1({
    manifest: input.manifest,
    catalog: input.catalog,
    operatorLibrary: input.operatorLibrary,
    functionId: proposal.functionName,
    request,
  });
}
