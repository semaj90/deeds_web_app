import { createHash } from 'node:crypto';
import { z } from 'zod';

const text = z.string().min(1);
const optionalText = text.nullable();

export const revisionQualifiedSymbolResolutionSchema = z.object({
  schema: z.literal('atlas.revision-qualified-symbol-resolution.v1'),
  featureId: text,
  packetKey: text,
  sourceRef: text,
  sourceRevision: text,
  workspaceRevision: text,
  targetSourceRef: optionalText,
  targetSourceRevision: optionalText,
  targetStableSymbolId: optionalText,
  targetSymbolVersionId: optionalText,
  targetUpstreamNodeId: optionalText,
  graphRevision: optionalText,
  stableSymbolId: optionalText,
  symbolVersionId: optionalText,
  upstreamNodeId: optionalText,
  resolutionClass: z.enum(['EXACT_SYMBOL', 'EXACT_OCCURRENCE', 'UNRESOLVED', 'OUTSIDE_WORKSPACE']),
  evidenceRefs: z.array(text).max(64),
  producerRevision: text,
  resolutionChecksum: z.string().regex(/^[a-f0-9]{64}$/),
  canonicalAuthority: z.literal(false),
}).strict();

export type RevisionQualifiedSymbolResolutionV1 = z.infer<typeof revisionQualifiedSymbolResolutionSchema>;

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`).join(',')}}`;
  return JSON.stringify(value) ?? 'null';
}

function sha256(value: unknown): string {
  return createHash('sha256').update(stable(value), 'utf8').digest('hex');
}

export function buildRevisionQualifiedSymbolResolution(input: Omit<RevisionQualifiedSymbolResolutionV1, 'resolutionChecksum'>): RevisionQualifiedSymbolResolutionV1 {
  const body = revisionQualifiedSymbolResolutionSchema.omit({ resolutionChecksum: true }).parse(input);
  return revisionQualifiedSymbolResolutionSchema.parse({ ...body, resolutionChecksum: sha256(body) });
}

export function buildRevisionQualifiedSymbolCacheKey(input: Pick<RevisionQualifiedSymbolResolutionV1, 'workspaceRevision' | 'sourceRevision' | 'featureId' | 'packetKey'>): string {
  const body = { schema: 'atlas.symbol-resolver-cache-key.v1', ...input };
  return `atlas:symbol-resolver:${sha256(body)}`;
}

export function bindLspResolutionToRevisionQualifiedSymbol(input: {
  featureId: string;
  packetKey: string;
  sourceRef: string;
  sourceRevision: string;
  workspaceRevision: string;
  targetSourceRef: string | null;
  targetSourceRevision: string | null;
  targetStableSymbolId: string | null;
  targetSymbolVersionId: string | null;
  targetUpstreamNodeId: string | null;
  resolutionStatus: 'resolved' | 'ambiguous' | 'unresolved' | 'not_supported';
  evidenceRefs: string[];
  producerRevision: string;
}): RevisionQualifiedSymbolResolutionV1 {
  if (input.resolutionStatus !== 'resolved') throw new Error('LSP_TARGET_NOT_RESOLVED');
  if (!input.targetSourceRef || !input.targetSourceRevision || !input.targetStableSymbolId || !input.targetSymbolVersionId) {
    throw new Error('LSP_TARGET_REVISION_SYMBOL_BINDING_REQUIRED');
  }
  return buildRevisionQualifiedSymbolResolution({
    schema: 'atlas.revision-qualified-symbol-resolution.v1',
    featureId: input.featureId,
    packetKey: input.packetKey,
    sourceRef: input.sourceRef,
    sourceRevision: input.sourceRevision,
    workspaceRevision: input.workspaceRevision,
    targetSourceRef: input.targetSourceRef,
    targetSourceRevision: input.targetSourceRevision,
    targetStableSymbolId: input.targetStableSymbolId,
    targetSymbolVersionId: input.targetSymbolVersionId,
    targetUpstreamNodeId: input.targetUpstreamNodeId,
    graphRevision: null,
    stableSymbolId: null,
    symbolVersionId: null,
    upstreamNodeId: null,
    resolutionClass: 'EXACT_SYMBOL',
    evidenceRefs: input.evidenceRefs,
    producerRevision: input.producerRevision,
    canonicalAuthority: false,
  });
}
