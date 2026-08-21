import { createHash } from 'node:crypto';
import type { ContextManifestV1 } from '../graph/graph-runtime-contracts.js';
import {
  buildGroundedContextManifestV1,
  type GroundedContextManifestV1,
} from './grounded-execution-receipt-v1.js';

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

export function checksumContextManifestV1(manifest: ContextManifestV1): string {
  if (manifest.schema !== 'atlas.context-manifest.v1') throw new Error('CONTEXT_MANIFEST_SCHEMA_MISMATCH');
  return createHash('sha256').update(stable(manifest), 'utf8').digest('hex');
}

export function bindContextManifestToGroundedExecutionV1(input: {
  taskId: string;
  runId: string;
  workerId: string;
  manifest: ContextManifestV1;
  packetKeys?: string[];
  processIds?: string[];
  sourceRefs: string[];
}): GroundedContextManifestV1 {
  const manifest = input.manifest;
  if (manifest.schema !== 'atlas.context-manifest.v1') throw new Error('CONTEXT_MANIFEST_SCHEMA_MISMATCH');
  if (input.sourceRefs.length === 0) throw new Error('GROUNDED_SOURCE_REFS_REQUIRED');
  if (manifest.evidenceRefs.length === 0) throw new Error('CONTEXT_MANIFEST_EVIDENCE_REQUIRED');

  return buildGroundedContextManifestV1({
    taskId: input.taskId,
    runId: input.runId,
    workerId: input.workerId,
    contextManifestSchema: manifest.schema,
    contextManifestChecksum: checksumContextManifestV1(manifest),
    requestId: manifest.requestId,
    snapshotId: manifest.snapshotId,
    graphRevision: manifest.graphRevision,
    producerRevision: manifest.producerRevision,
    grounding: {
      packetKeys: [...new Set(input.packetKeys ?? [])].sort(),
      processIds: [...new Set(input.processIds ?? [])].sort(),
      sourceRefs: [...new Set(input.sourceRefs)].sort(),
      evidenceRefs: [...new Set(manifest.evidenceRefs)].sort(),
    },
  });
}
