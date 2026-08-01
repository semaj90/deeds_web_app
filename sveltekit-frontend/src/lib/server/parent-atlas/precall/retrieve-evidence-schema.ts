/**
 * Canonical Zod contract for the first Parent Atlas pre-call operation:
 * atlas.retrieve_evidence.
 *
 * This is the single source of truth this operation's shape should be
 * derived from across every transport (MCP tool schema, tRPC procedure,
 * LangGraph node state, future gRPC/ACP/A2A adapters) — see
 * openspec/changes/parent-atlas-runtime-ownership-precall/design.md,
 * "Shared domain-service shape". Not yet wired to any caller; this is
 * step 8 of that change's ordered task list (schema first, wiring later).
 *
 * centroidRouting defaults to disabled and the schema does not assume a
 * settled centroid key contract exists — see the Phase 11 audit in
 * openspec/changes/session-159-followup-tasks.md. Until a canonical
 * centroid projection is approved, callers should leave centroidRouting
 * unset/disabled; a lane-status result of `not_configured` (see
 * LaneStatusSchema below, and src/lib/server/retrieval/parallel-orchestrator.ts)
 * is the correct signal, never a silent empty success.
 */

import { z } from 'zod';

export const RetrieveEvidenceInputSchema = z.object({
  query: z.string().trim().min(1).max(2_000),
  workspaceRevision: z.string().min(1),
  topK: z.number().int().min(1).max(50).default(20),
  lanes: z
    .array(z.enum(['exact', 'lexical', 'semantic', 'ast', 'schema', 'graph', 'centroid']))
    .default(['exact', 'lexical', 'semantic', 'ast']),
  centroidRouting: z
    .object({
      enabled: z.boolean().default(false),
      representationRevision: z.string().optional(),
    })
    .optional(),
});
export type RetrieveEvidenceInput = z.infer<typeof RetrieveEvidenceInputSchema>;

/**
 * Shared lane-status contract. A degraded/absent lane must report
 * `not_configured` with a `reason`, never a silent empty `results: []`
 * that's indistinguishable from "searched, found nothing" — see the
 * parallel-orchestrator.ts fix this schema was extracted alongside.
 */
export const LaneStatusSchema = z.object({
  lane: z.string(),
  status: z.enum(['success', 'error', 'timeout', 'not_configured']),
  candidateCount: z.number().int().min(0),
  reason: z.string().optional(),
  fallbackUsed: z.boolean().default(false),
});
export type LaneStatus = z.infer<typeof LaneStatusSchema>;

export const RetrieveEvidenceOutputSchema = z.object({
  // Echoed back unchanged from the request so a caller (and this schema's
  // own test/proof harness) can observe workspace-revision was preserved
  // through the whole call, not just trust that internal code didn't
  // mutate it.
  workspaceRevision: z.string(),
  evidence: z.array(
    z.object({
      packetKey: z.string(),
      sourceRef: z.string(),
      score: z.number(),
      summary: z.string().optional(),
    })
  ),
  lanes: z.array(LaneStatusSchema),
});
export type RetrieveEvidenceOutput = z.infer<typeof RetrieveEvidenceOutputSchema>;
