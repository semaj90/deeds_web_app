import { createHash } from 'node:crypto';
import { z } from 'zod';

import {
  OperationKindV1Schema,
  OperationTargetScopeV1Schema,
  type OperationKindV1,
  type OperationTargetScopeV1,
} from './prefill-execution-plan-v1.js';

export const ToolDispatchSurfaceV1Schema = z.enum([
  'TRACE_MCP',
  'LEGACY_MCP',
  'TRPC',
  'LOCAL_FUNCTION',
  'NAPI',
  'OPENCODE_NATIVE',
  'EXTERNAL_SERVICE',
]);

export const ToolLaneV1Schema = z.enum([
  'identity',
  'memory',
  'cache',
  'lexical',
  'dense',
  'graph',
  'rerank',
  'synthesis',
  'ops',
  'read',
  'workflow',
  'validation',
  'unknown',
]);

export const ToolProofStatusV1Schema = z.enum([
  'PROVEN',
  'IMPLEMENTED_UNPROVEN',
  'PARTIAL',
  'STUB',
  'QUARANTINED',
  'LEGACY_UNLISTED',
  'DUPLICATE_UNRESOLVED',
]);

export const ToolPermissionV1Schema = z.enum([
  'code:read',
  'code:write',
  'workspace:write',
  'db:read',
  'db:write',
  'graph:read',
  'graph:write',
  'cache:read',
  'cache:write',
  'external:read',
  'external:write',
  'workflow:control',
]);

export const ToolCachePolicyV1Schema = z.object({
  mode: z.enum(['NONE', 'SERVER_TTL', 'PROCESS_LEGACY']),
  scope: z.enum(['public', 'private']).nullable(),
}).strict();

export const ActiveToolRegistryEntryV1Schema = z.object({
  schema: z.literal('atlas.active-tool-registry-entry.v1'),
  entryId: z.string().min(1),
  toolId: z.string().min(1),
  owner: z.string().min(1),
  handlerId: z.string().min(1),
  dispatchSurface: ToolDispatchSurfaceV1Schema,
  lane: ToolLaneV1Schema,
  operationKind: OperationKindV1Schema,
  targetScopes: z.array(OperationTargetScopeV1Schema).min(1),
  permissions: z.array(ToolPermissionV1Schema),
  proofStatus: ToolProofStatusV1Schema,
  schemaListed: z.boolean(),
  canonicalOwner: z.boolean(),
  routingEligible: z.boolean(),
  duplicateGroup: z.string().min(1).nullable(),
  cachePolicy: ToolCachePolicyV1Schema,
  producerRevision: z.string().min(1),
}).strict().superRefine((entry, ctx) => {
  const hardBlocked = entry.lane === 'unknown'
    || entry.proofStatus === 'STUB'
    || entry.proofStatus === 'QUARANTINED'
    || entry.proofStatus === 'LEGACY_UNLISTED'
    || entry.proofStatus === 'DUPLICATE_UNRESOLVED'
    || !entry.schemaListed
    || !entry.canonicalOwner;
  if (entry.routingEligible && hardBlocked) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['routingEligible'],
      message: 'unknown, unlisted, duplicate-unresolved, stub, quarantined, or non-owner tools cannot be routed',
    });
  }
  if (entry.operationKind === 'READ' && entry.targetScopes.some((scope) => scope !== 'NONE')) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['targetScopes'], message: 'READ tools must use target scope NONE' });
  }
  if (entry.operationKind === 'APPLY' && entry.targetScopes.every((scope) => scope === 'NONE')) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['targetScopes'], message: 'APPLY tools require a mutation target scope' });
  }
  if (entry.targetScopes.includes('EPHEMERAL_WORKSPACE') && !entry.permissions.includes('workspace:write')) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['permissions'], message: 'EPHEMERAL_WORKSPACE requires workspace:write permission' });
  }
  if (entry.targetScopes.includes('WORKTREE_SOURCE') && !entry.permissions.includes('code:write')) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['permissions'], message: 'WORKTREE_SOURCE requires code:write permission' });
  }
  if (entry.targetScopes.includes('CANONICAL_STORE')
      && !entry.permissions.some((permission) => ['db:write', 'graph:write', 'cache:write'].includes(permission))) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['permissions'], message: 'CANONICAL_STORE requires an explicit store write permission' });
  }
  if (entry.targetScopes.includes('EXTERNAL_SIDE_EFFECT')
      && !entry.permissions.some((permission) => permission === 'external:write' || permission === 'workflow:control')) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['permissions'], message: 'EXTERNAL_SIDE_EFFECT requires external:write or workflow:control permission' });
  }
  if (entry.cachePolicy.mode !== 'NONE' && !['READ', 'AUDIT'].includes(entry.operationKind)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['cachePolicy'], message: 'only READ/AUDIT tools may advertise reusable result caching' });
  }
});
export type ActiveToolRegistryEntryV1 = z.infer<typeof ActiveToolRegistryEntryV1Schema>;

const ActiveToolRegistryManifestBaseV1Schema = z.object({
  schema: z.literal('atlas.active-tool-registry-manifest.v1'),
  registryRevision: z.string().min(1),
  generatedAt: z.string().datetime(),
  entries: z.array(ActiveToolRegistryEntryV1Schema),
  checksum: z.string().length(64),
}).strict();

export const ActiveToolRegistryManifestV1Schema = ActiveToolRegistryManifestBaseV1Schema.superRefine((manifest, ctx) => {
  const entryIds = new Set<string>();
  const byToolId = new Map<string, ActiveToolRegistryEntryV1[]>();
  for (const entry of manifest.entries) {
    if (entryIds.has(entry.entryId)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['entries'], message: `duplicate registry entryId: ${entry.entryId}` });
    }
    entryIds.add(entry.entryId);
    const group = byToolId.get(entry.toolId) ?? [];
    group.push(entry);
    byToolId.set(entry.toolId, group);
  }

  for (const [toolId, entries] of byToolId) {
    const owners = entries.filter((entry) => entry.canonicalOwner);
    if (owners.length !== 1) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['entries'], message: `${toolId} must have exactly one canonical owner; found ${owners.length}` });
    }
    if (entries.length > 1 && entries.some((entry) => entry.routingEligible && entry !== owners[0])) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['entries'], message: `${toolId} has a routable non-owner duplicate` });
    }
  }
});
export type ActiveToolRegistryManifestV1 = z.infer<typeof ActiveToolRegistryManifestV1Schema>;

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, child]) => [key, canonicalize(child)]),
    );
  }
  return value;
}

function checksum(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(canonicalize(value))).digest('hex');
}

export function materializeActiveToolRegistryManifestV1(input: {
  registryRevision: string;
  generatedAt: string;
  entries: ActiveToolRegistryEntryV1[];
}): ActiveToolRegistryManifestV1 {
  const entries = input.entries
    .map((entry) => ActiveToolRegistryEntryV1Schema.parse(entry))
    .sort((a, b) => a.toolId.localeCompare(b.toolId) || a.entryId.localeCompare(b.entryId));
  const withoutChecksum = {
    schema: 'atlas.active-tool-registry-manifest.v1' as const,
    registryRevision: input.registryRevision,
    generatedAt: input.generatedAt,
    entries,
  };
  return ActiveToolRegistryManifestV1Schema.parse({
    ...withoutChecksum,
    checksum: checksum(withoutChecksum),
  });
}

export function selectRoutableToolIdsForPrefill(input: {
  manifest: ActiveToolRegistryManifestV1;
  allowedOperationKinds: readonly OperationKindV1[];
  allowedTargetScopes: readonly OperationTargetScopeV1[];
}): string[] {
  const manifest = ActiveToolRegistryManifestV1Schema.parse(input.manifest);
  const operations = new Set(input.allowedOperationKinds);
  const scopes = new Set(input.allowedTargetScopes);
  return manifest.entries
    .filter((entry) => entry.routingEligible)
    .filter((entry) => operations.has(entry.operationKind))
    .filter((entry) => entry.targetScopes.every((scope) => scopes.has(scope)))
    .map((entry) => entry.toolId)
    .sort();
}
