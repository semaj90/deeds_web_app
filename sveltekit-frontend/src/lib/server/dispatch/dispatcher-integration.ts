/**
 * Dispatcher Integration — Wires dynamic dispatcher into live retrieval path
 *
 * This layer:
 * 1. Builds DispatcherState from retrieval results + Postgres checks
 * 2. Computes dispatch decision using dynamic-dispatcher.ts logic
 * 3. Routes to appropriate handler (v1: synthesis only, future: recovery/validation/sync)
 * 4. Logs telemetry for HMM training (v2)
 *
 * Integration points:
 * - Called from go-retrieval-facade.ts AFTER unified retrieval + identity validation
 * - Operates on list of candidates with identity_lane already classified
 * - Returns dispatch decision + telemetry for logging
 *
 * Dispatch flow:
 * candidates[] → buildDispatcherState() → computeDispatchDecision()
 *   → routeByDispatch() → log telemetry → return decision
 */

import { db } from '$lib/server/db/client.js';
import { eq, sql } from 'drizzle-orm';
import {
  computeDispatchDecision,
  routeByDispatch,
  dispatchToMcpTool,
  logDispatchTelemetry,
  type DispatcherState,
  type DispatchDecision
} from './dynamic-dispatcher.js';
import type { CanonicalEnvelope } from '$lib/server/topology/canonical-id-hierarchy.js';

/**
 * Dispatcher integration result — decision + metadata for handler routing
 */
export interface DispatcherIntegrationResult {
  decision: DispatchDecision;
  nodeId: string;
  mcpTool: string | null;
  shouldProceedToSynthesis: boolean; // v1: always true except quarantine
  telemetry: {
    timestamp: string;
    decision: DispatchDecision;
    identity_lane: string;
    parity_status: string;
    latency_ms: number;
  };
}

/**
 * Build DispatcherState from retrieval candidates + Postgres checks
 *
 * Gathers current system state:
 * - Identity lane from retrieval classification
 * - Zod validation status from envelope checks
 * - Parity status from Postgres/Qdrant/Neo4j sync checks
 * - Retrieval optimization signals (RRF score, candidate count)
 */
async function buildDispatcherState(
  candidates: Array<{ identity_lane?: string; rrf_score?: number; canonical_envelope?: CanonicalEnvelope }>,
  requestMetadata?: { caseId?: string; userId?: string }
): Promise<DispatcherState> {
  const candidate = candidates[0]; // Use top result to classify the retrieval state
  const identityLane = (candidate?.identity_lane ?? 'canonical') as
    | 'canonical'
    | 'recoverable'
    | 'quarantine'
    | 'mirror_orphan';

  // Check parity status: do Postgres and Qdrant counts match?
  const parityStatus = await checkParityStatus();

  // Check if Qdrant payload is synced
  const qdrantSynced = await checkQdrantSync(candidate?.canonical_envelope?.packet_key);

  // Check if Neo4j has the node
  const neo4jSynced = await checkNeo4jSync(candidate?.canonical_envelope?.packet_key);

  // Retrieve optimization signals
  const rrfScore = candidate?.rrf_score ?? 0;
  const candidatesCount = candidates.length;

  return {
    identity_lane: identityLane,
    zod_valid: !!candidate?.canonical_envelope, // Simple check: envelope present = valid
    zod_errors: candidate?.canonical_envelope ? [] : ['missing_envelope'],
    parity_status: parityStatus,
    qdrant_synced: qdrantSynced,
    neo4j_synced: neo4jSynced,
    rrf_score: rrfScore,
    candidates_count: candidatesCount,
    canonical_envelope: candidate?.canonical_envelope
  };
}

/**
 * Check parity: Postgres packets vs Qdrant points
 * Simple proxy: if any packet lacks an embedding, parity is diverged
 */
async function checkParityStatus(): Promise<'matched' | 'diverged' | 'unknown'> {
  try {
    const result = await db.execute(
      sql`
        SELECT
          COUNT(*) as total_packets,
          COUNT(CASE WHEN embedding IS NOT NULL THEN 1 END) as embedded_packets
        FROM atlas_packets
        WHERE packet_key IS NOT NULL
        LIMIT 1
      `
    );

    const row = result.rows[0] as { total_packets?: number; embedded_packets?: number } | undefined;
    if (!row) return 'unknown';

    const total = row.total_packets || 0;
    const embedded = row.embedded_packets || 0;

    // Simple heuristic: if >95% are embedded, parity matched
    if (total > 0 && embedded / total > 0.95) {
      return 'matched';
    }

    return 'diverged';
  } catch (_) {
    return 'unknown';
  }
}

/**
 * Check if Qdrant payload is synced for a packet
 * Simple check: does the Qdrant point have source_ref in payload?
 */
async function checkQdrantSync(packetKey?: string): Promise<boolean> {
  if (!packetKey) return false;

  try {
    // This is a placeholder — real implementation would query Qdrant
    // For now, assume synced (v1 non-blocking; v2 adds real Qdrant checks)
    return true;
  } catch (_) {
    return false;
  }
}

/**
 * Check if Neo4j has synced this packet's node
 * Simple check: does the Neo4j node exist?
 */
async function checkNeo4jSync(packetKey?: string): Promise<boolean> {
  if (!packetKey) return false;

  try {
    // This is a placeholder — real implementation would query Neo4j
    // For now, assume synced (v1 non-blocking; v2 adds real Neo4j checks)
    return true;
  } catch (_) {
    return false;
  }
}

/**
 * Integrate dispatcher into retrieval pipeline
 *
 * Called after unified retrieval + identity validation.
 * Routes to appropriate handler based on dispatch decision.
 *
 * v1: Deterministic rules, log telemetry, always proceed to synthesis
 * v2: Collect telemetry → train HMM on dispatch outcomes
 * v3: Learned dispatcher predicts best next step
 */
export async function integrateDispatcher(
  candidates: Array<{ identity_lane?: string; rrf_score?: number; canonical_envelope?: CanonicalEnvelope }>,
  requestMetadata?: { caseId?: string; userId?: string }
): Promise<DispatcherIntegrationResult> {
  const startTime = Date.now();

  // 1. Build current system state
  const state = await buildDispatcherState(candidates, requestMetadata);

  // 2. Compute dispatch decision
  const decision = computeDispatchDecision(state);

  // 3. Map decision to LangGraph node ID (for future wiring)
  const nodeId = routeByDispatch(state);

  // 4. Map decision to MCP tool (for future wiring)
  const mcpTool = dispatchToMcpTool(decision);

  // 5. Determine if we should proceed to synthesis (v1: yes unless quarantine)
  const shouldProceedToSynthesis =
    decision !== 'quarantine_review' && decision !== 'request_human_review';

  // 6. Collect telemetry
  const latency = Date.now() - startTime;
  const telemetry = {
    timestamp: new Date().toISOString(),
    decision,
    identity_lane: state.identity_lane,
    parity_status: state.parity_status ?? 'unknown',
    latency_ms: latency
  };

  // 7. Log telemetry (non-blocking)
  logDispatchTelemetry({
    timestamp: telemetry.timestamp,
    decision,
    state,
    latency_ms: latency
  });

  return {
    decision,
    nodeId,
    mcpTool,
    shouldProceedToSynthesis,
    telemetry
  };
}

/**
 * Export dispatcher state builder for testing/debugging
 */
export { buildDispatcherState };
