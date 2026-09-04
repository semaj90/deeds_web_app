import { z } from 'zod';

/**
 * MCP-TOOL-REGISTRY-REVISION-01 — canonical types for a server-qualified, revision-checksummed
 * MCP tool registry.
 *
 * Per the live MCP specification: tool-name uniqueness is server-local, not global. An aggregator
 * combining multiple MCP servers (this repo runs two: stdio `mcp-server` and
 * `trace-mcp-server`) can and does see the same bare tool name on more than one server -- that is
 * not automatically a defect, it is a collision the aggregator must disambiguate. The spec also
 * explicitly does not guarantee `serverInfo.name` is a unique server identifier, so it must never
 * be used alone as the aggregation key.
 *
 * `MCPToolRefV1` (serverAuthorityId + toolName) is therefore the canonical selector coordinate
 * everywhere downstream of this file -- never a bare tool name. `serverAuthorityId` is a stable,
 * Parent-Atlas-controlled local identity (see mcp-registry-checksum-v1.ts::deriveServerAuthorityId),
 * derived from a configured logical server key + transport + endpoint + trust identity, not from
 * anything the remote server reports about itself.
 *
 * Revision split (per this repo's canonicalAuthority/authorityScope house style, e.g.
 * semantic-corpus-bundle-v1.ts, representation-artifact-v1.ts): `MCPToolSurfaceRevisionV1` records
 * WHICH TOOLS EXIST (schema-level facts); `MCPToolPolicyRevisionV1` records HOW THEY MAY BE USED
 * (permission facts). A schema change and a policy change are different events and must move
 * different revisions -- `MCPRegistryAdmissionV1.registryRevision` is the hash of both together,
 * so a Viterbi proposal can tell which one moved.
 *
 * MCP tool `annotations` are explicitly untrusted per spec unless the server is already trusted --
 * this repo does not treat either in-repo server as exempt from that rule, so annotations must
 * never feed `MCPPermissionClassV1` inference anywhere in this module or its consumers. Permission
 * classification comes only from Parent Atlas's own local policy sources
 * (atlas-tool-registry.ts, ACPToolRegistry.ts) via mcp-tool-policy-classifier-v1.ts.
 */

export const MCPServerAuthorityIdV1Schema = z.string().regex(/^parent-atlas:mcp:[a-z0-9-]+$/);
export type MCPServerAuthorityIdV1 = z.infer<typeof MCPServerAuthorityIdV1Schema>;

export const MCPTransportTypeV1Schema = z.enum(['stdio', 'streamable-http']);
export type MCPTransportTypeV1 = z.infer<typeof MCPTransportTypeV1Schema>;

/** UNKNOWN is the fail-closed default -- never inferred from tool annotations. */
export const MCPPermissionClassV1Schema = z.enum(['READ', 'WRITE', 'ADMIN', 'UNKNOWN']);
export type MCPPermissionClassV1 = z.infer<typeof MCPPermissionClassV1Schema>;

/**
 * Classification for a handler/listing discrepancy found by the AST parity audit
 * (scripts/atlas/validate-mcp-tool-registry-parity.mjs), reconciled against live tools/list
 * discovery. UNKNOWN is the fail-closed default -- never silently defaulted to a
 * safe-looking category like INTERNAL_HANDLER.
 */
export const MCPHandlerClassificationV1Schema = z.enum([
  'LISTING_OMISSION',
  'INTERNAL_HANDLER',
  'DEPRECATED_ALIAS',
  'PERMISSION_HIDDEN',
  'DEAD_ORPHAN',
  'UNKNOWN',
]);
export type MCPHandlerClassificationV1 = z.infer<typeof MCPHandlerClassificationV1Schema>;

export const MCPToolRefV1Schema = z.object({
  serverAuthorityId: MCPServerAuthorityIdV1Schema,
  toolName: z.string().min(1),
}).strict();
export type MCPToolRefV1 = z.infer<typeof MCPToolRefV1Schema>;

export function mcpToolRefKey(ref: MCPToolRefV1): string {
  return `${ref.serverAuthorityId}::${ref.toolName}`;
}

export const MCPToolSurfaceEntryV1Schema = z.object({
  ref: MCPToolRefV1Schema,
  title: z.string().nullable(),
  description: z.string().nullable(),
  // sha256 digests of the canonicalized (key-sorted, annotations-excluded) JSON Schema.
  inputSchemaDigest: z.string().regex(/^[a-f0-9]{64}$/),
  outputSchemaDigest: z.string().regex(/^[a-f0-9]{64}$/).nullable(),
  executionMetadataDigest: z.string().regex(/^[a-f0-9]{64}$/).nullable(),
}).strict();
export type MCPToolSurfaceEntryV1 = z.infer<typeof MCPToolSurfaceEntryV1Schema>;

export const MCPToolSurfaceRevisionV1Schema = z.object({
  schemaVersion: z.literal('mcp-tool-surface-revision.v1'),
  serverAuthorityId: MCPServerAuthorityIdV1Schema,
  // sha256 fingerprint of the deriveServerAuthorityId() hash inputs -- distinct from the
  // human-readable serverAuthorityId alias, used for collision detection between two configured
  // servers that might otherwise resolve to the same alias.
  serverAuthorityFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  transportType: MCPTransportTypeV1Schema,
  tools: z.array(MCPToolSurfaceEntryV1Schema),
  toolCount: z.number().int().nonnegative(),
  // Reserved for the follow-up gate (MCP-VITERBI-LIVE-OBSERVATION-ADMISSION-01): whether this
  // server advertised `capabilities.tools.listChanged === true` at discovery time. Neither
  // in-repo server does today. Not yet consumed by any invalidation logic in this gate.
  listChangedSupported: z.boolean(),
  // Content-derived, NOT a timestamp: sha256(serverAuthorityId + sorted tool-ref-key list).
  // Two discoveries of an unchanged tool set must produce the same discoveredAtRevision.
  discoveredAtRevision: z.string().regex(/^[a-f0-9]{64}$/),
  // Informational only -- explicitly excluded from every checksum in this schema.
  discoveredAt: z.string().datetime(),
  // Bundle-level checksum over every field above except itself (computed last).
  toolSurfaceRevision: z.string().regex(/^[a-f0-9]{64}$/),
  canonicalAuthority: z.literal(false),
  authorityScope: z.literal('MCP_TOOL_SURFACE_DISCOVERY'),
}).strict().superRefine((surface, ctx) => {
  if (surface.toolCount !== surface.tools.length) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['toolCount'],
      message: 'MCP_TOOL_SURFACE_TOOL_COUNT_MISMATCH',
    });
  }
  const seen = new Set<string>();
  for (const [index, entry] of surface.tools.entries()) {
    if (entry.ref.serverAuthorityId !== surface.serverAuthorityId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['tools', index, 'ref', 'serverAuthorityId'],
        message: 'MCP_TOOL_SURFACE_ENTRY_SERVER_AUTHORITY_MISMATCH',
      });
    }
    const key = mcpToolRefKey(entry.ref);
    if (seen.has(key)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['tools', index, 'ref', 'toolName'],
        message: `MCP_TOOL_SURFACE_DUPLICATE_TOOL_REF:${key}`,
      });
    }
    seen.add(key);
  }
});
export type MCPToolSurfaceRevisionV1 = z.infer<typeof MCPToolSurfaceRevisionV1Schema>;

export const MCPToolPolicyEntryV1Schema = z.object({
  ref: MCPToolRefV1Schema,
  permissionClass: MCPPermissionClassV1Schema,
  approvalRequired: z.boolean(),
  allowedOperations: z.array(z.string()),
  tenantRestrictions: z.array(z.string()).nullable(),
  // Where this classification came from -- never 'mcp_tool_annotation'. Fail-closed default is
  // 'unclassified' (no matching local policy source found).
  policySource: z.enum(['atlas_tool_registry', 'acp_tool_registry', 'unclassified']),
}).strict().superRefine((entry, ctx) => {
  if (entry.policySource === 'unclassified' && entry.permissionClass !== 'UNKNOWN') {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['permissionClass'],
      message: 'MCP_TOOL_POLICY_UNCLASSIFIED_MUST_BE_UNKNOWN_PERMISSION_CLASS',
    });
  }
  if (entry.permissionClass === 'UNKNOWN' && !entry.approvalRequired) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['approvalRequired'],
      message: 'MCP_TOOL_POLICY_UNKNOWN_PERMISSION_CLASS_REQUIRES_APPROVAL',
    });
  }
  if ((entry.permissionClass === 'WRITE' || entry.permissionClass === 'ADMIN') && !entry.approvalRequired) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['approvalRequired'],
      message: 'MCP_TOOL_POLICY_WRITE_OR_ADMIN_REQUIRES_APPROVAL',
    });
  }
});
export type MCPToolPolicyEntryV1 = z.infer<typeof MCPToolPolicyEntryV1Schema>;

export const MCPToolPolicyRevisionV1Schema = z.object({
  schemaVersion: z.literal('mcp-tool-policy-revision.v1'),
  serverAuthorityId: MCPServerAuthorityIdV1Schema,
  entries: z.array(MCPToolPolicyEntryV1Schema),
  // PROVEN only when every entry has a real policySource (never annotation-derived); PARTIAL when
  // some entries are 'unclassified'/UNKNOWN; UNPROVEN when no entry has a real policySource.
  policySourceStatus: z.enum(['PROVEN', 'PARTIAL', 'UNPROVEN']),
  toolPolicyRevision: z.string().regex(/^[a-f0-9]{64}$/),
  canonicalAuthority: z.literal(false),
  authorityScope: z.literal('MCP_TOOL_POLICY_CLASSIFICATION'),
}).strict().superRefine((policy, ctx) => {
  const classifiedCount = policy.entries.filter((entry) => entry.policySource !== 'unclassified').length;
  if (policy.policySourceStatus === 'PROVEN' && classifiedCount !== policy.entries.length) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['policySourceStatus'],
      message: 'MCP_TOOL_POLICY_PROVEN_REQUIRES_EVERY_ENTRY_CLASSIFIED',
    });
  }
  if (policy.policySourceStatus === 'UNPROVEN' && classifiedCount > 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['policySourceStatus'],
      message: 'MCP_TOOL_POLICY_UNPROVEN_MUST_HAVE_NO_CLASSIFIED_ENTRIES',
    });
  }
  const seen = new Set<string>();
  for (const [index, entry] of policy.entries.entries()) {
    const key = mcpToolRefKey(entry.ref);
    if (seen.has(key)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['entries', index, 'ref', 'toolName'],
        message: `MCP_TOOL_POLICY_DUPLICATE_TOOL_REF:${key}`,
      });
    }
    seen.add(key);
  }
});
export type MCPToolPolicyRevisionV1 = z.infer<typeof MCPToolPolicyRevisionV1Schema>;

export const MCPRegistryAdmissionV1Schema = z.object({
  schemaVersion: z.literal('mcp-registry-admission.v1'),
  serverAuthorityId: MCPServerAuthorityIdV1Schema,
  toolSurfaceRevision: z.string().regex(/^[a-f0-9]{64}$/),
  toolPolicyRevision: z.string().regex(/^[a-f0-9]{64}$/),
  // hash(toolSurfaceRevision + toolPolicyRevision), computed last.
  registryRevision: z.string().regex(/^[a-f0-9]{64}$/),
  // Informational only, never part of any checksum input.
  admittedAt: z.string().datetime(),
  canonicalAuthority: z.literal(false),
}).strict();
export type MCPRegistryAdmissionV1 = z.infer<typeof MCPRegistryAdmissionV1Schema>;

/**
 * Extends the existing (proven, unchanged) McpToolSelectionProposalV1 shape from
 * mcp-tool-viterbi-bridge-v1.ts with server-qualified identity and split revisions. Selection
 * remains proposal-only: executionAuthorized is always false here. Promotion to an actual
 * tools/call is a separate, later, out-of-scope-for-this-gate admission step.
 */
export const ToolProposalV1Schema = z.object({
  status: z.literal('PROPOSED'),
  ref: MCPToolRefV1Schema,
  toolSchemaDigest: z.string().regex(/^[a-f0-9]{64}$/),
  registryRevision: z.string().regex(/^[a-f0-9]{64}$/),
  policyRevision: z.string().regex(/^[a-f0-9]{64}$/),
  // 1-based position of this proposal within the k-best Viterbi path list.
  rank: z.number().int().min(1),
  pathScore: z.number(),
  observationsDigest: z.string().regex(/^[a-f0-9]{64}$/),
  executionAuthorized: z.literal(false),
  executionPerformed: z.literal(false),
  writesPerformed: z.literal(false),
  canonicalAuthority: z.literal(false),
}).strict();
export type ToolProposalV1 = z.infer<typeof ToolProposalV1Schema>;
