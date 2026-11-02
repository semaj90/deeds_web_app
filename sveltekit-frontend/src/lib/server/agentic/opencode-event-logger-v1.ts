import { db, pool } from '$lib/server/db/client.js';
import { agentOsEvents } from '$lib/server/db/schema/agent-os-registry.js';
import { randomUUID, createHash } from 'node:crypto';

export interface OpenCodeSkillContractPayloadV1 {
  likely_cause: string;
  evidence: string[] | string;
  patch_targets: string[];
  safe_next_command: string;
  smoke_command: string;
  report_path?: string;
  trace_id?: string;
  workflow_id?: string;
  feature_id?: string;
  severity?: 'info' | 'low' | 'medium' | 'high' | 'critical';
}

export interface OpenCodeEventReceiptV1 {
  agentOsEventId: number;
  ledgerEventId: string;
  checksum: string;
  persistedAt: string;
}

/**
 * Persists an OpenCode Skill Contract execution into both PostgreSQL 18:
 * 1. `agent_os_events` (operational stream)
 * 2. `atlas_agent_action_events` (immutable audit ledger)
 */
export async function recordOpenCodeAgenticEventV1(
  payload: OpenCodeSkillContractPayloadV1
): Promise<OpenCodeEventReceiptV1> {
  const traceId = payload.trace_id ?? randomUUID();
  const workflowId = payload.workflow_id ?? `wf:opencode:${Date.now()}`;
  const now = new Date();
  const eventId = `evt:${randomUUID()}`;
  const actionId = `act:${randomUUID()}`;
  const executionKey = createHash('sha256').update(payload.likely_cause).digest('hex');

  const canonicalTargets = Array.isArray(payload.patch_targets) ? payload.patch_targets : [];
  const canonicalEvidence = Array.isArray(payload.evidence) ? payload.evidence : [String(payload.evidence)];

  const eventJson = {
    likely_cause: payload.likely_cause,
    evidence: canonicalEvidence,
    patch_targets: canonicalTargets,
    safe_next_command: payload.safe_next_command,
    smoke_command: payload.smoke_command,
    report_path: payload.report_path ?? null,
  };

  const checksum = createHash('sha256').update(JSON.stringify(eventJson)).digest('hex');

  // 1. Insert into agent_os_events using Drizzle ORM
  const [osEvent] = await db
    .insert(agentOsEvents)
    .values({
      traceId,
      eventType: 'opencode_skill_execution',
      source: 'atlas.opencode.agent',
      title: payload.likely_cause.slice(0, 255),
      body: `Targets: ${canonicalTargets.join(', ')} | Smoke: ${payload.smoke_command}`,
      severity: payload.severity ?? 'info',
      featureId: payload.feature_id ?? 'agentic_error_fixing',
      packetId: null,
      metadata: eventJson,
      createdAt: now.toISOString(),
    })
    .returning({ id: agentOsEvents.id });

  // 2. Append to immutable atlas_agent_action_events using pool query
  const ledgerSequence = Date.now() * 1000 + Math.floor(Math.random() * 1000);
  const ledgerSql = `
    INSERT INTO atlas_agent_action_events (
      event_id,
      ledger_sequence,
      workflow_id,
      workflow_revision,
      action_id,
      execution_key,
      opcode,
      target_canonical_id,
      state,
      outcome,
      error_code,
      workspace_revision,
      source_revision,
      graph_revision,
      observed_at,
      event_checksum,
      event_json,
      producer_revision,
      persisted_at
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19
    )
    RETURNING event_id;
  `;

  await pool.query(ledgerSql, [
    eventId,
    ledgerSequence,
    workflowId,
    1,
    actionId,
    executionKey,
    'OPENCODE_SKILL_EXECUTION',
    canonicalTargets[0] ?? null,
    'FINALIZED',
    'SUCCESS',
    null,
    null,
    null,
    null,
    now,
    checksum,
    JSON.stringify(eventJson),
    'atlas.opencode-logger.v1',
    now,
  ]);

  return {
    agentOsEventId: osEvent.id,
    ledgerEventId: eventId,
    checksum,
    persistedAt: now.toISOString(),
  };
}
