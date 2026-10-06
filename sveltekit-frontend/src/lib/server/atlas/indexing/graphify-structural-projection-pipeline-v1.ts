import { createHash } from 'node:crypto';

import {
  compileGraphifyStructuralIntelligence,
  type GraphifyStructuralIntelligenceResult,
} from './graphify-structural-intelligence-adapter.js';
import {
  graphifySymbolProjectionSourceBindingV1Schema,
  type GraphifySymbolProjectionSourceBindingV1,
} from './graphify-symbol-projection-preflight-v1.js';
import {
  mapStructuralFabricToGraphifyProjectionV1,
  type GraphifyImportResolutionContextV1,
  type GraphifySymbolProjectionBatchV1,
} from './graphify-symbol-projection-v1.js';
import type { StructuralMaterializationResult } from './graphify-structural-materializer.js';

export type GraphifyStructuralProjectionPipelineInputV1 = {
  source: string;
  sourceRef: string;
  sourceRevision: string;
  workspaceRevision: string;
  sourceBinding: GraphifySymbolProjectionSourceBindingV1;
  materialization: StructuralMaterializationResult;
  revisions: {
    chunker: string;
    astGrep: string;
    langExtract: string;
    adapter: string;
    fabric: string;
  };
  importResolutionContextBySourceRef?: ReadonlyMap<string, GraphifyImportResolutionContextV1>;
};

export type GraphifyStructuralProjectionPipelineV1 = {
  schema: 'atlas.graphify-structural-projection-pipeline.v1';
  status: 'MAPPED' | 'BLOCKED_SOURCE_BINDING' | 'BLOCKED_PROVENANCE' | 'BLOCKED_COMPILATION' | 'BLOCKED_PROJECTION';
  sourceRef: string;
  sourceRevision: string;
  workspaceRevision: string;
  compilation: GraphifyStructuralIntelligenceResult | null;
  batch: GraphifySymbolProjectionBatchV1 | null;
  diagnostics: string[];
  canonicalAuthority: false;
  writesPerformed: false;
  checksum: string;
};

function normalizeSourceRef(value: string): string {
  return value.trim().replaceAll('\\', '/').replace(/^\.\//, '');
}

function sha256(value: string | Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}

function finish(
  input: GraphifyStructuralProjectionPipelineInputV1,
  status: GraphifyStructuralProjectionPipelineV1['status'],
  compilation: GraphifyStructuralIntelligenceResult | null,
  batch: GraphifySymbolProjectionBatchV1 | null,
  diagnostics: string[],
): GraphifyStructuralProjectionPipelineV1 {
  const content = {
    schema: 'atlas.graphify-structural-projection-pipeline.v1' as const,
    status,
    sourceRef: input.sourceRef,
    sourceRevision: input.sourceRevision,
    workspaceRevision: input.workspaceRevision,
    compilation,
    batch,
    diagnostics: [...new Set(diagnostics)],
    canonicalAuthority: false as const,
    writesPerformed: false as const,
  };
  return { ...content, checksum: sha256(JSON.stringify(content)) };
}

export function buildGraphifyStructuralProjectionPipelineV1(
  input: GraphifyStructuralProjectionPipelineInputV1,
): GraphifyStructuralProjectionPipelineV1 {
  const binding = graphifySymbolProjectionSourceBindingV1Schema.safeParse(input.sourceBinding);
  if (!binding.success) {
    return finish(input, 'BLOCKED_SOURCE_BINDING', null, null, ['SOURCE_BINDING_INVALID']);
  }

  const exactSourceRef = normalizeSourceRef(input.sourceRef);
  const byteLength = Buffer.byteLength(input.source, 'utf8');
  const contentDigest = sha256(Buffer.from(input.source, 'utf8'));
  if (
    !binding.data.readbackVerified
    || normalizeSourceRef(binding.data.sourceRef) !== exactSourceRef
    || binding.data.sourceRevision !== input.sourceRevision
    || binding.data.workspaceRevision !== input.workspaceRevision
    || binding.data.byteLength !== byteLength
    || binding.data.contentDigest !== contentDigest
  ) {
    return finish(input, 'BLOCKED_SOURCE_BINDING', null, null, ['SOURCE_BINDING_MISMATCH']);
  }

  const materialization = input.materialization;
  if (
    materialization.sourceRevisionAuthority !== 'PROVEN'
    || materialization.provenanceReadiness.status !== 'NATIVE_READY'
    || materialization.status !== 'PROVEN'
  ) {
    return finish(input, 'BLOCKED_PROVENANCE', null, null, ['NATIVE_SOURCE_REVISION_PROVENANCE_REQUIRED']);
  }
  if (
    normalizeSourceRef(materialization.sourceRef) !== exactSourceRef
    || materialization.sourceRevision !== input.sourceRevision
    || !materialization.evidence
    || normalizeSourceRef(materialization.evidence.file_path) !== exactSourceRef
    || materialization.evidence.source_revision !== input.sourceRevision
  ) {
    return finish(input, 'BLOCKED_PROVENANCE', null, null, ['MATERIALIZATION_SOURCE_BINDING_MISMATCH']);
  }

  let compilation: GraphifyStructuralIntelligenceResult;
  try {
    compilation = compileGraphifyStructuralIntelligence({
      source: input.source,
      parserBuffer: Buffer.from(input.source, 'utf8'),
      workspaceRevision: input.workspaceRevision,
      materialization,
      revisions: input.revisions,
    });
  } catch (error) {
    return finish(input, 'BLOCKED_COMPILATION', null, null, [
      `STRUCTURAL_COMPILATION_FAILED:${error instanceof Error ? error.message : String(error)}`,
    ]);
  }

  if (!compilation.fabric || !compilation.projectionEvidence) {
    return finish(input, 'BLOCKED_COMPILATION', compilation, null, ['STRUCTURAL_PROJECTION_EVIDENCE_MISSING']);
  }

  try {
    const batch = mapStructuralFabricToGraphifyProjectionV1({
      workspaceId: binding.data.workspaceId,
      fileId: binding.data.fileId,
      workspaceRevision: binding.data.workspaceRevision,
      sourceRef: binding.data.sourceRef,
      sourceRevision: binding.data.sourceRevision,
      fabric: compilation.fabric,
      nativeCoordinatesByUpstreamNodeId: compilation.projectionEvidence.nativeCoordinatesByUpstreamNodeId,
      referenceEvidenceByReferenceId: compilation.projectionEvidence.referenceEvidenceByReferenceId,
      importResolutionContextBySourceRef: input.importResolutionContextBySourceRef,
    });
    return finish(input, 'MAPPED', compilation, batch, []);
  } catch (error) {
    return finish(input, 'BLOCKED_PROJECTION', compilation, null, [
      `STRUCTURAL_PROJECTION_FAILED:${error instanceof Error ? error.message : String(error)}`,
    ]);
  }
}
