/**
 * Phase 109A MCP Tool Definitions
 * Exposes semantic signal lifecycle management functions via MCP interface
 *
 * Tools: archive_signal, supersede_signal, promote_recommendation, query_signal_history, validate_state_transition
 * All tools use role-based access control (atlas_application or atlas_maintenance)
 * All operations create immutable audit events in semantic_lifecycle_events table
 */

import { z } from 'zod';
import { db } from '$lib/server/db/client';
import { semanticSignals, semanticLifecycleEvents, recommendationLog } from '$lib/server/db/schema-postgres';
import { eq, and } from 'drizzle-orm';
import { sql } from 'drizzle-orm';

// ===== SCHEMAS (Input/Output) =====

const archiveSignalInputSchema = z.object({
  signal_id: z.string().uuid('Valid UUID required'),
  actor_id: z.string().min(1, 'Actor ID required'),
  reason: z.string().min(1, 'Reason required'),
});

const supersedeSignalInputSchema = z.object({
  signal_id: z.string().uuid('Valid UUID required'),
  replacement_signal_id: z.string().uuid('Replacement must be valid UUID'),
  actor_id: z.string().min(1, 'Actor ID required'),
  reason: z.string().min(1, 'Reason required'),
});

const promoteRecommendationInputSchema = z.object({
  recommendation_id: z.string().uuid('Valid UUID required'),
  approver_id: z.string().min(1, 'Approver ID required'),
  proof_manifest_id: z.string().uuid('Valid UUID required').optional(),
  actor_id: z.string().min(1, 'Actor ID required'),
  dry_run: z.boolean().default(false),
});

const querySignalHistoryInputSchema = z.object({
  signal_id: z.string().uuid('Valid UUID required'),
  limit: z.number().int().min(1).max(100).default(20),
});

const validateStateTransitionInputSchema = z.object({
  signal_id: z.string().uuid('Valid UUID required'),
  current_state: z.enum(['ACTIVE', 'SUPERSEDED', 'RETRACTED', 'ARCHIVED', 'PURGE_PENDING', 'PURGED']),
  target_state: z.enum(['ACTIVE', 'SUPERSEDED', 'RETRACTED', 'ARCHIVED', 'PURGE_PENDING', 'PURGED']),
});

// Output schemas
const stateChangeOutputSchema = z.object({
  signal_id: z.string().uuid(),
  previous_state: z.string(),
  new_state: z.string(),
  event_id: z.string().uuid(),
  timestamp: z.string().datetime(),
});

const signalHistoryOutputSchema = z.object({
  events: z.array(z.object({
    event_id: z.string().uuid(),
    previous_state: z.string(),
    new_state: z.string(),
    reason: z.string().nullable(),
    actor_id: z.string(),
    created_at: z.string().datetime(),
  })),
  total_count: z.number().int(),
});

const stateTransitionValidationOutputSchema = z.object({
  is_valid: z.boolean(),
  current_state: z.string(),
  target_state: z.string(),
  reason: z.string().optional(),
});

// ===== TOOL IMPLEMENTATIONS =====

/**
 * Archive a semantic signal: transitions ACTIVE/SUPERSEDED → ARCHIVED
 * Creates immutable audit event
 */
export async function archiveSignal(input: z.infer<typeof archiveSignalInputSchema>) {
  const validated = archiveSignalInputSchema.parse(input);

  try {
    // Call the PL/pgSQL function via raw SQL
    const result = await db.execute(
      sql`SELECT * FROM archive_semantic_signal(
        ${validated.signal_id}::uuid,
        ${validated.actor_id}::varchar,
        ${validated.reason}::text
      )`
    );

    if (result.rows.length === 0) {
      throw new Error('Archive operation returned no results');
    }

    const row = result.rows[0] as any;
    return {
      signal_id: row.signal_id,
      previous_state: row.previous_state,
      new_state: row.new_state,
      event_id: row.event_id,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    throw new Error(`Failed to archive signal: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Supersede a semantic signal with a replacement: transitions ACTIVE → SUPERSEDED
 * Sets superseded_by link, creates immutable audit event
 */
export async function supersedeSignal(input: z.infer<typeof supersedeSignalInputSchema>) {
  const validated = supersedeSignalInputSchema.parse(input);

  try {
    const result = await db.execute(
      sql`SELECT * FROM supersede_semantic_signal(
        ${validated.signal_id}::uuid,
        ${validated.replacement_signal_id}::uuid,
        ${validated.actor_id}::varchar,
        ${validated.reason}::text
      )`
    );

    if (result.rows.length === 0) {
      throw new Error('Supersede operation returned no results');
    }

    const row = result.rows[0] as any;
    return {
      signal_id: row.signal_id,
      previous_state: row.previous_state,
      new_state: row.new_state,
      event_id: row.event_id,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    throw new Error(`Failed to supersede signal: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Promote a recommendation: enforce mutual approval
 * Approver must be different from creator (mutual approval safeguard)
 * Supports dry-run mode (returns validation without state commit)
 */
export async function promoteRecommendation(input: z.infer<typeof promoteRecommendationInputSchema>) {
  const validated = promoteRecommendationInputSchema.parse(input);

  try {
    const result = await db.execute(
      sql`SELECT * FROM promote_recommendation(
        ${validated.recommendation_id}::uuid,
        ${validated.approver_id}::varchar,
        ${validated.proof_manifest_id || null}::uuid,
        ${validated.actor_id}::varchar,
        ${validated.dry_run}::boolean
      )`
    );

    if (result.rows.length === 0) {
      throw new Error('Promote operation returned no results');
    }

    const row = result.rows[0] as any;
    return {
      recommendation_id: row.recommendation_id,
      new_status: row.new_status,
      event_id: row.event_id,
      validation_passed: row.validation_passed,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    if (error instanceof Error && error.message.includes('Approver must be different')) {
      throw new Error('MUTUAL_APPROVAL_VIOLATION: Approver cannot be the same as creator');
    }
    throw new Error(`Failed to promote recommendation: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Query signal state history: fetch all audit events for a signal
 * Returns events in reverse chronological order (newest first)
 */
export async function querySignalHistory(input: z.infer<typeof querySignalHistoryInputSchema>) {
  const validated = querySignalHistoryInputSchema.parse(input);

  try {
    const events = await db
      .select()
      .from(semanticLifecycleEvents)
      .where(
        and(
          eq(semanticLifecycleEvents.entityId, validated.signal_id as any),
          sql`entity_type = 'semantic_signal'`
        )
      )
      .orderBy(sql`created_at DESC`)
      .limit(validated.limit);

    // Get total count (without limit)
    const countResult = await db.execute(
      sql`SELECT COUNT(*) as count FROM semantic_lifecycle_events
          WHERE entity_id = ${validated.signal_id}::uuid AND entity_type = 'semantic_signal'`
    );
    const totalCount = (countResult.rows[0] as any)?.count || 0;

    return {
      events: events.map((e) => ({
        event_id: e.id,
        previous_state: e.previousState,
        new_state: e.newState,
        reason: e.reason,
        actor_id: e.actorId,
        created_at: e.createdAt?.toISOString() || new Date().toISOString(),
      })),
      total_count: totalCount,
    };
  } catch (error) {
    throw new Error(`Failed to query signal history: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Validate a state transition: check if the transition is allowed
 * Returns validation result without making changes
 * Useful for dry-run validation before committing operations
 */
export async function validateStateTransition(input: z.infer<typeof validateStateTransitionInputSchema>) {
  const validated = validateStateTransitionInputSchema.parse(input);

  // Define valid state transitions
  const validTransitions: Record<string, string[]> = {
    ACTIVE: ['SUPERSEDED', 'ARCHIVED', 'RETRACTED'],
    SUPERSEDED: ['ARCHIVED', 'RETRACTED'],
    RETRACTED: ['ARCHIVED'],
    ARCHIVED: ['PURGE_PENDING'],
    PURGE_PENDING: ['PURGED'],
    PURGED: [], // Terminal state
  };

  const isValid = (validTransitions[validated.current_state] || []).includes(validated.target_state);

  return {
    is_valid: isValid,
    current_state: validated.current_state,
    target_state: validated.target_state,
    reason: isValid ? undefined : `Cannot transition from ${validated.current_state} to ${validated.target_state}`,
  };
}

// ===== MCP TOOL REGISTRATION =====

export const phase109aTools = [
  {
    name: 'phase109a_archive_signal',
    description:
      'Archive a semantic signal: transitions ACTIVE or SUPERSEDED to ARCHIVED state. Creates immutable audit event in semantic_lifecycle_events table.',
    inputSchema: archiveSignalInputSchema,
    outputSchema: stateChangeOutputSchema,
    handler: archiveSignal,
  },
  {
    name: 'phase109a_supersede_signal',
    description:
      'Supersede a semantic signal with a replacement: transitions ACTIVE to SUPERSEDED. Sets superseded_by link and creates audit event.',
    inputSchema: supersedeSignalInputSchema,
    outputSchema: stateChangeOutputSchema,
    handler: supersedeSignal,
  },
  {
    name: 'phase109a_promote_recommendation',
    description:
      'Promote a recommendation to APPROVED status. Enforces mutual approval safeguard (approver ≠ creator). Supports dry-run mode.',
    inputSchema: promoteRecommendationInputSchema,
    outputSchema: z.object({
      recommendation_id: z.string().uuid(),
      new_status: z.string(),
      event_id: z.string().uuid(),
      validation_passed: z.boolean(),
      timestamp: z.string().datetime(),
    }),
    handler: promoteRecommendation,
  },
  {
    name: 'phase109a_query_signal_history',
    description:
      'Query the state transition history for a semantic signal. Returns all audit events in reverse chronological order.',
    inputSchema: querySignalHistoryInputSchema,
    outputSchema: signalHistoryOutputSchema,
    handler: querySignalHistory,
  },
  {
    name: 'phase109a_validate_state_transition',
    description:
      'Validate whether a state transition is allowed without making changes. Useful for dry-run validation.',
    inputSchema: validateStateTransitionInputSchema,
    outputSchema: stateTransitionValidationOutputSchema,
    handler: validateStateTransition,
  },
];

/**
 * Export tool definitions for MCP server registration
 */
export function getPhase109aToolDefinitions() {
  return phase109aTools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema.describe() as any,
  }));
}
