import { createHash } from 'node:crypto';
import { z } from 'zod';

import {
  workspaceRevisionRecordV1Schema,
  workspaceSourceBindingV1Schema,
  type WorkspaceRevisionRecordV1,
  type WorkspaceSourceBindingV1,
} from '../identity/workspace-source-binding-v1.js';

export const GRAPHIFY_WORKSPACE_MANIFEST_COMPLETENESS_V1_SCHEMA = 'atlas.graphify-workspace-manifest-completeness.v1' as const;
const sha256 = z.string().regex(/^[a-f0-9]{64}$/);
const contentRevision = z.string().regex(/^sha256:[a-f0-9]{64}$/);
const id = z.string().min(1);

export const persistedGraphifyRunManifestV1Schema = z.object({
  runId: z.string().uuid(),
  workspaceRevision: contentRevision,
  sourceManifestDigest: sha256,
  sourceManifestSourceCount: z.number().int().positive(),
}).strict();
export type PersistedGraphifyRunManifestV1 = z.infer<typeof persistedGraphifyRunManifestV1Schema>;

export const persistedGraphifySourceBindingV1Schema = z.object({
  sourceRef: id,
  codeSourceRevision: contentRevision,
  contentHash: sha256,
  byteLength: z.number().int().nonnegative(),
  lastSeenRunId: z.string().uuid(),
}).strict();
export type PersistedGraphifySourceBindingV1 = z.infer<typeof persistedGraphifySourceBindingV1Schema>;

export const graphifyWorkspaceManifestCompletenessV1Schema = z.object({
  schema: z.literal(GRAPHIFY_WORKSPACE_MANIFEST_COMPLETENESS_V1_SCHEMA),
  status: z.enum([
    'COMPLETE',
    'RUN_LINEAGE_MISMATCH',
    'SOURCE_COUNT_MISMATCH',
    'SOURCE_BINDING_DUPLICATE',
    'SOURCE_BINDING_MISSING',
    'SOURCE_BINDING_EXTRA',
    'SOURCE_BINDING_MISMATCH',
  ]),
  complete: z.boolean(),
  graphMayConsumeWorkspaceRevision: z.boolean(),
  workspaceRevision: contentRevision,
  sourceManifestDigest: sha256,
  expectedSourceCount: z.number().int().positive(),
  persistedSourceCount: z.number().int().nonnegative(),
  matchedSourceCount: z.number().int().nonnegative(),
  runId: z.string().uuid(),
  blockers: z.array(id),
  canonicalWritesAttempted: z.literal(false),
  readOnly: z.literal(true),
  producerRevision: id,
  receiptChecksum: sha256,
}).strict();
export type GraphifyWorkspaceManifestCompletenessV1 = z.infer<typeof graphifyWorkspaceManifestCompletenessV1Schema>;

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .filter(([, child]) => child !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, child]) => `${JSON.stringify(key)}:${stable(child)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}
function checksum(value: unknown): string {
  return createHash('sha256').update(stable(value), 'utf8').digest('hex');
}

/**
 * Proves that a persisted Graphify run is a complete physical projection of the
 * exact WorkspaceRevisionRecordV1 source manifest. Git coordinates are not used
 * by this proof. A bounded/single-row canary may prove writer mechanics, but it
 * cannot make graphMayConsumeWorkspaceRevision true unless every manifest source
 * binding is present and exact under the same run.
 */
export function evaluateGraphifyWorkspaceManifestCompletenessV1(input: {
  workspaceRecord: WorkspaceRevisionRecordV1;
  sourceBindings: readonly WorkspaceSourceBindingV1[];
  persistedRun: PersistedGraphifyRunManifestV1;
  persistedSources: readonly PersistedGraphifySourceBindingV1[];
  producerRevision: string;
}): GraphifyWorkspaceManifestCompletenessV1 {
  const record = workspaceRevisionRecordV1Schema.parse(input.workspaceRecord);
  const bindings = input.sourceBindings.map((binding) => workspaceSourceBindingV1Schema.parse(binding));
  const run = persistedGraphifyRunManifestV1Schema.parse(input.persistedRun);
  const persisted = input.persistedSources.map((row) => persistedGraphifySourceBindingV1Schema.parse(row));
  const blockers: string[] = [];

  let status: GraphifyWorkspaceManifestCompletenessV1['status'] = 'COMPLETE';
  if (run.workspaceRevision !== record.workspaceRevision
    || run.sourceManifestDigest !== record.sourceManifestDigest
    || record.workspaceRevision !== `sha256:${record.sourceManifestDigest}`) {
    status = 'RUN_LINEAGE_MISMATCH';
    blockers.push('PERSISTED_RUN_WORKSPACE_MANIFEST_LINEAGE_MISMATCH');
  }

  if (run.sourceManifestSourceCount !== record.sourceCount
    || bindings.length !== record.sourceCount
    || persisted.length !== record.sourceCount) {
    if (status === 'COMPLETE') status = 'SOURCE_COUNT_MISMATCH';
    blockers.push('FULL_WORKSPACE_SOURCE_COUNT_REQUIRED');
  }

  const expectedByRef = new Map<string, WorkspaceSourceBindingV1>();
  for (const binding of bindings) {
    if (expectedByRef.has(binding.sourceRef)) {
      if (status === 'COMPLETE') status = 'SOURCE_BINDING_DUPLICATE';
      blockers.push(`DUPLICATE_EXPECTED_SOURCE_REF:${binding.sourceRef}`);
    }
    expectedByRef.set(binding.sourceRef, binding);
  }

  const persistedByRef = new Map<string, PersistedGraphifySourceBindingV1>();
  for (const row of persisted) {
    if (persistedByRef.has(row.sourceRef)) {
      if (status === 'COMPLETE') status = 'SOURCE_BINDING_DUPLICATE';
      blockers.push(`DUPLICATE_PERSISTED_SOURCE_REF:${row.sourceRef}`);
      continue;
    }
    persistedByRef.set(row.sourceRef, row);
    if (row.lastSeenRunId !== run.runId) {
      if (status === 'COMPLETE') status = 'SOURCE_BINDING_MISMATCH';
      blockers.push(`SOURCE_NOT_BOUND_TO_RUN:${row.sourceRef}`);
    }
  }

  let matchedSourceCount = 0;
  for (const [sourceRef, binding] of expectedByRef) {
    const row = persistedByRef.get(sourceRef);
    if (!row) {
      if (status === 'COMPLETE') status = 'SOURCE_BINDING_MISSING';
      blockers.push(`MISSING_PERSISTED_SOURCE:${sourceRef}`);
      continue;
    }
    if (row.codeSourceRevision !== binding.sourceRevision
      || row.contentHash !== binding.contentDigest
      || row.byteLength !== binding.byteLength
      || binding.workspaceRevision !== record.workspaceRevision) {
      if (status === 'COMPLETE') status = 'SOURCE_BINDING_MISMATCH';
      blockers.push(`PERSISTED_SOURCE_BINDING_MISMATCH:${sourceRef}`);
      continue;
    }
    matchedSourceCount += 1;
  }

  for (const sourceRef of persistedByRef.keys()) {
    if (!expectedByRef.has(sourceRef)) {
      if (status === 'COMPLETE') status = 'SOURCE_BINDING_EXTRA';
      blockers.push(`EXTRA_PERSISTED_SOURCE:${sourceRef}`);
    }
  }

  const complete = status === 'COMPLETE'
    && blockers.length === 0
    && matchedSourceCount === record.sourceCount
    && persisted.length === record.sourceCount;
  const payload = {
    schema: GRAPHIFY_WORKSPACE_MANIFEST_COMPLETENESS_V1_SCHEMA,
    status: complete ? 'COMPLETE' as const : status,
    complete,
    graphMayConsumeWorkspaceRevision: complete,
    workspaceRevision: record.workspaceRevision,
    sourceManifestDigest: record.sourceManifestDigest,
    expectedSourceCount: record.sourceCount,
    persistedSourceCount: persisted.length,
    matchedSourceCount,
    runId: run.runId,
    blockers,
    canonicalWritesAttempted: false as const,
    readOnly: true as const,
    producerRevision: input.producerRevision,
  };
  return graphifyWorkspaceManifestCompletenessV1Schema.parse({ ...payload, receiptChecksum: checksum(payload) });
}
