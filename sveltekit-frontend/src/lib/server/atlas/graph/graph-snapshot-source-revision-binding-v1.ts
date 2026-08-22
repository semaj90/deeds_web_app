import { createHash } from 'node:crypto';
import { z } from 'zod';

import {
  workspaceRevisionRecordV1Schema,
  workspaceSourceBindingV1Schema,
  type WorkspaceRevisionRecordV1,
  type WorkspaceSourceBindingV1,
} from '../identity/workspace-source-binding-v1.js';

export const GRAPH_SNAPSHOT_SOURCE_BINDING_SCHEMA = 'atlas.graph-snapshot-source-revision-binding.v1' as const;

const id = z.string().min(1);
const sourceRevision = z.string().regex(/^sha256:[a-f0-9]{64}$/);

export const graphSnapshotSourceBindingReceiptV1Schema = z.object({
  schema: z.literal(GRAPH_SNAPSHOT_SOURCE_BINDING_SCHEMA),
  workspaceRevision: sourceRevision,
  sourceBackedNodeCount: z.number().int().nonnegative(),
  boundNodeCount: z.number().int().nonnegative(),
  unboundNodeCount: z.number().int().nonnegative(),
  uniqueSourceRefCount: z.number().int().nonnegative(),
  missingSourceRefs: z.array(id),
  completeCoverage: z.boolean(),
  applyAllowed: z.boolean(),
  producerRevision: id,
  bindingChecksum: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();
export type GraphSnapshotSourceBindingReceiptV1 = z.infer<typeof graphSnapshotSourceBindingReceiptV1Schema>;
export type GraphSnapshotSourceBindableNodeV1 = { sourceRef?: string | null; sourceRevision?: string | null };

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value as Record<string, unknown>).filter(([,v]) => v !== undefined).sort(([a],[b]) => a.localeCompare(b)).map(([k,v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`;
  return JSON.stringify(value) ?? 'null';
}
function checksum(value: unknown): string { return createHash('sha256').update(canonical(value), 'utf8').digest('hex'); }
function normalize(value: string): string { return value.replaceAll('\\','/').replace(/^\.\//,''); }

export type GraphSnapshotSourceBindableNodeV1 = {
  sourceRef?: string | null;
  sourceRevision?: string | null;
};

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .filter(([, child]) => child !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, child]) => `${JSON.stringify(key)}:${canonical(child)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

function checksum(value: unknown): string {
  return createHash('sha256').update(canonical(value), 'utf8').digest('hex');
}

function normalizeSourceRef(value: string): string {
  return value.replaceAll('\\', '/').replace(/^\.\//, '');
}

export function bindGraphSnapshotNodeSourceRevisionsV1<T extends GraphSnapshotSourceBindableNodeV1>(input: {
  workspaceRecord: WorkspaceRevisionRecordV1;
  bindings: readonly WorkspaceSourceBindingV1[];
  nodes: readonly T[];
  producerRevision: string;
}): { nodes: Array<T & { sourceRevision: string | null }>; receipt: GraphSnapshotSourceBindingReceiptV1 } {
  const record = workspaceRevisionRecordV1Schema.parse(input.workspaceRecord);
  const map = new Map<string, WorkspaceSourceBindingV1>();
  for (const raw of input.bindings) {
    const binding = workspaceSourceBindingV1Schema.parse(raw);
    if (binding.workspaceRevision !== record.workspaceRevision) throw new Error(`GRAPH_SOURCE_BINDING_WORKSPACE_REVISION_MISMATCH:${binding.sourceRef}`);
    const ref = normalize(binding.sourceRef);
    const prior = map.get(ref);
    if (prior && prior.sourceRevision !== binding.sourceRevision) throw new Error(`GRAPH_SOURCE_BINDING_DUPLICATE_REF:${ref}`);
    map.set(ref, binding);
  }

  const missing = new Set<string>();
  const seen = new Set<string>();
  let sourceBackedNodeCount = 0;
  let boundNodeCount = 0;
  const nodes = input.nodes.map((node) => {
    const raw = typeof node.sourceRef === 'string' ? node.sourceRef.trim() : '';
    if (!raw) return { ...node, sourceRevision: null };
    sourceBackedNodeCount += 1;
    const ref = normalize(raw);
    seen.add(ref);
    const binding = map.get(ref);
    if (!binding) { missing.add(ref); return { ...node, sourceRevision: null }; }
  const bindingMap = new Map<string, WorkspaceSourceBindingV1>();

  for (const raw of input.bindings) {
    const binding = workspaceSourceBindingV1Schema.parse(raw);
    if (binding.workspaceRevision !== record.workspaceRevision) {
      throw new Error(`GRAPH_SOURCE_BINDING_WORKSPACE_REVISION_MISMATCH:${binding.sourceRef}`);
    }
    const ref = normalizeSourceRef(binding.sourceRef);
    const prior = bindingMap.get(ref);
    if (prior && prior.sourceRevision !== binding.sourceRevision) {
      throw new Error(`GRAPH_SOURCE_BINDING_DUPLICATE_REF:${ref}`);
    }
    bindingMap.set(ref, binding);
  }

  const missing = new Set<string>();
  let sourceBackedNodeCount = 0;
  let boundNodeCount = 0;
  const seenRefs = new Set<string>();
  const nodes = input.nodes.map((node) => {
    const rawRef = typeof node.sourceRef === 'string' ? node.sourceRef.trim() : '';
    if (!rawRef) return { ...node, sourceRevision: null };

    sourceBackedNodeCount += 1;
    const ref = normalizeSourceRef(rawRef);
    seenRefs.add(ref);
    const binding = bindingMap.get(ref);
    if (!binding) {
      missing.add(ref);
      return { ...node, sourceRevision: null };
    }
    boundNodeCount += 1;
    return { ...node, sourceRevision: binding.sourceRevision };
  });

  const missingSourceRefs = [...missing].sort();
  const unboundNodeCount = sourceBackedNodeCount - boundNodeCount;
  const completeCoverage = unboundNodeCount === 0;
  const payload = {
  const receiptPayload = {
    schema: GRAPH_SNAPSHOT_SOURCE_BINDING_SCHEMA,
    workspaceRevision: record.workspaceRevision,
    sourceBackedNodeCount,
    boundNodeCount,
    unboundNodeCount,
    uniqueSourceRefCount: seen.size,
    uniqueSourceRefCount: seenRefs.size,
    missingSourceRefs,
    completeCoverage,
    applyAllowed: completeCoverage,
    producerRevision: input.producerRevision,
  };
  return { nodes, receipt: graphSnapshotSourceBindingReceiptV1Schema.parse({ ...payload, bindingChecksum: checksum(payload) }) };
  const receipt = graphSnapshotSourceBindingReceiptV1Schema.parse({
    ...receiptPayload,
    bindingChecksum: checksum(receiptPayload),
  });
  return { nodes, receipt };
}
