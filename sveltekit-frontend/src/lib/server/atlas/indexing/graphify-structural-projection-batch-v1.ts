import { createHash } from 'node:crypto';
import {
  buildGraphifyImportResolutionContextsV1,
  type GraphifyImportContextSourceV1,
  type GraphifyImportResolutionContextsV1,
} from './graphify-symbol-projection-v1.js';
import {
  buildGraphifyStructuralProjectionPipelineV1,
  type GraphifyStructuralProjectionPipelineInputV1,
  type GraphifyStructuralProjectionPipelineV1,
} from './graphify-structural-projection-pipeline-v1.js';

export type GraphifyStructuralProjectionBatchV1 = {
  schema: 'atlas.graphify-structural-projection-batch.v1';
  status: 'MAPPED' | 'BLOCKED_INPUT_PIPELINE' | 'BLOCKED_IMPORT_CONTEXT';
  workspaceRevision: string;
  importContextChecksum: string | null;
  pipelines: GraphifyStructuralProjectionPipelineV1[];
  diagnostics: string[];
  checksum: string;
  canonicalAuthority: false;
  writesPerformed: false;
};

function checksum(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(value), 'utf8').digest('hex');
}

function finish(
  status: GraphifyStructuralProjectionBatchV1['status'],
  workspaceRevision: string,
  importContextChecksum: string | null,
  pipelines: GraphifyStructuralProjectionPipelineV1[],
  diagnostics: string[],
): GraphifyStructuralProjectionBatchV1 {
  const body = {
    schema: 'atlas.graphify-structural-projection-batch.v1' as const,
    status,
    workspaceRevision,
    importContextChecksum,
    pipelines,
    diagnostics: [...new Set(diagnostics)].sort(),
    canonicalAuthority: false as const,
    writesPerformed: false as const,
  };
  return { ...body, checksum: checksum(body) };
}

/**
 * Resolve import/reference candidates across one exact, source-bound file cohort.
 * Pass one compiles native structural fabrics; pass two maps them with the shared
 * revision-qualified import context. The coordinator never persists or promotes.
 */
export function buildGraphifyStructuralProjectionBatchV1(
  inputs: readonly GraphifyStructuralProjectionPipelineInputV1[],
): GraphifyStructuralProjectionBatchV1 {
  if (inputs.length === 0) throw new Error('GRAPHIFY_STRUCTURAL_BATCH_INPUTS_REQUIRED');
  const workspaceRevisions = new Set(inputs.map((input) => input.workspaceRevision));
  if (workspaceRevisions.size !== 1 || !/^sha256:[a-f0-9]{64}$/i.test(inputs[0]!.workspaceRevision)) {
    throw new Error('GRAPHIFY_STRUCTURAL_BATCH_WORKSPACE_REVISION_MISMATCH');
  }
  const orderedInputs = [...inputs].sort((left, right) => left.sourceRef.localeCompare(right.sourceRef));
  const sourceRefs = new Set<string>();
  for (const input of orderedInputs) {
    const sourceRef = input.sourceRef.trim().replaceAll('\\', '/').replace(/^\.\//, '');
    if (sourceRefs.has(sourceRef)) throw new Error(`GRAPHIFY_STRUCTURAL_BATCH_DUPLICATE_SOURCE:${sourceRef}`);
    sourceRefs.add(sourceRef);
  }

  const firstPass = orderedInputs.map((input) => buildGraphifyStructuralProjectionPipelineV1(input));
  const blocked = firstPass.filter((pipeline) => pipeline.status !== 'MAPPED' || !pipeline.compilation?.fabric);
  if (blocked.length > 0) {
    return finish(
      'BLOCKED_INPUT_PIPELINE',
      inputs[0]!.workspaceRevision,
      null,
      firstPass,
      blocked.flatMap((pipeline) => pipeline.diagnostics.map((diagnostic) => `${pipeline.sourceRef}:${diagnostic}`)),
    );
  }

  let importContexts: GraphifyImportResolutionContextsV1;
  try {
    const contextSources: GraphifyImportContextSourceV1[] = firstPass.map((pipeline) => {
      const original = orderedInputs.find((input) => input.sourceRef === pipeline.sourceRef);
      const fabric = pipeline.compilation?.fabric;
      if (!original || !fabric) throw new Error(`GRAPHIFY_STRUCTURAL_BATCH_FABRIC_MISSING:${pipeline.sourceRef}`);
      return {
        sourceRef: original.sourceRef,
        sourceRevision: original.sourceRevision,
        workspaceRevision: original.workspaceRevision,
        fabric,
      };
    });
    importContexts = buildGraphifyImportResolutionContextsV1(contextSources);
  } catch (error) {
    return finish('BLOCKED_IMPORT_CONTEXT', inputs[0]!.workspaceRevision, null, firstPass, [
      error instanceof Error ? error.message : String(error),
    ]);
  }

  const pipelines = orderedInputs.map((input) => buildGraphifyStructuralProjectionPipelineV1({
    ...input,
    importResolutionContextBySourceRef: importContexts.contextsBySourceRef,
  }));
  const failedSecondPass = pipelines.some((pipeline) => pipeline.status !== 'MAPPED');
  return finish(
    failedSecondPass ? 'BLOCKED_INPUT_PIPELINE' : 'MAPPED',
    inputs[0]!.workspaceRevision,
    importContexts.checksum,
    pipelines,
    failedSecondPass ? pipelines.flatMap((pipeline) => pipeline.diagnostics.map((diagnostic) => `${pipeline.sourceRef}:${diagnostic}`)) : [],
  );
}

export function verifyGraphifyStructuralProjectionBatchV1(
  batch: GraphifyStructuralProjectionBatchV1,
): boolean {
  const { checksum: suppliedChecksum, ...body } = batch;
  return batch.schema === 'atlas.graphify-structural-projection-batch.v1'
    && batch.status === 'MAPPED'
    && batch.canonicalAuthority === false
    && batch.writesPerformed === false
    && /^sha256:[a-f0-9]{64}$/i.test(batch.workspaceRevision)
    && /^[a-f0-9]{64}$/.test(batch.importContextChecksum ?? '')
    && /^[a-f0-9]{64}$/.test(suppliedChecksum)
    && batch.pipelines.length > 0
    && batch.pipelines.every((pipeline) => pipeline.status === 'MAPPED' && pipeline.canonicalAuthority === false && pipeline.writesPerformed === false)
    && checksum(body) === suppliedChecksum;
}
