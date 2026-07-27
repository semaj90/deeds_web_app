/**
 * Tool Authorization Audit Logger
 *
 * Records all tool authorization decisions for security auditing:
 * - Permission grant derivation
 * - Tool access checks (allowed/denied)
 * - Authorization failures with context
 *
 * Stores in Postgres table: authorization_audit_log
 */

import { sql } from 'drizzle-orm';
import type { PermissionGrant } from '$lib/server/ace/atlas-tool-registry';

export interface AuthorizationAuditEvent {
  userId: string;
  toolName: string;
  action: 'GRANT_DERIVED' | 'ACCESS_ALLOWED' | 'ACCESS_DENIED' | 'VALIDATION_FAILED';
  permission?: string;
  userRole?: string;
  ipAddress?: string;
  userAgent?: string;
  error?: string;
  timestamp: Date;
}

/**
 * Log authorization audit event to Postgres
 * Non-blocking: failures don't interrupt request flow
 */
export async function logAuthorizationAudit(event: AuthorizationAuditEvent): Promise<void> {
  try {
    const { db } = await import('$lib/server/db/client.js');

    await db.execute(sql`
      INSERT INTO authorization_audit_log (
        user_id, tool_name, action, permission, user_role,
        ip_address, user_agent, error, created_at
      ) VALUES (
        ${event.userId},
        ${event.toolName},
        ${event.action},
        ${event.permission ?? null},
        ${event.userRole ?? null},
        ${event.ipAddress ?? null},
        ${event.userAgent ?? null},
        ${event.error ?? null},
        ${event.timestamp}
      )
    `).catch((dbError) => {
      // Log to stderr but don't throw — audit should never fail the request
      console.error('[Authorization Audit] Database error:', dbError);
    });
  } catch (err) {
    // Silently fail if DB module isn't available (e.g., in tests)
    console.error('[Authorization Audit] Failed to log:', err);
  }
}

/**
 * Query recent authorization audit logs
 */
export async function queryAuthorizationAudit(filters: {
  userId?: string;
  toolName?: string;
  action?: string;
  limit?: number;
  hoursBack?: number;
}): Promise<AuthorizationAuditEvent[]> {
  try {
    const { db } = await import('$lib/server/db/client.js');

    let query = sql`
      SELECT
        user_id, tool_name, action, permission, user_role,
        ip_address, user_agent, error, created_at
      FROM authorization_audit_log
      WHERE 1=1
    `;

    if (filters.userId) {
      query = sql`${query} AND user_id = ${filters.userId}`;
    }

    if (filters.toolName) {
      query = sql`${query} AND tool_name = ${filters.toolName}`;
    }

    if (filters.action) {
      query = sql`${query} AND action = ${filters.action}`;
    }

    if (filters.hoursBack) {
      query = sql`${query} AND created_at > NOW() - INTERVAL '${filters.hoursBack} hours'`;
    }

    query = sql`${query} ORDER BY created_at DESC LIMIT ${filters.limit ?? 100}`;

    const rows = await db.execute(query);
    return (rows as any)?.rows ?? [];
  } catch (err) {
    console.error('[Authorization Audit] Query failed:', err);
    return [];
  }
}

/**
 * Wrapper for checkToolAccess that logs all decisions
 */
export async function checkToolAccessWithAudit(
  toolName: string,
  grant: PermissionGrant,
  context?: {
    ipAddress?: string;
    userAgent?: string;
  }
): Promise<{ allowed: boolean; error?: string }> {
  const { checkToolAccess } = await import('./tool-authorization.js');
  const safeAuditLog = async (event: AuthorizationAuditEvent): Promise<void> => {
    await logAuthorizationAudit(event).catch((auditError) => {
      console.error('[Authorization Audit] Non-blocking wrapper failure:', auditError);
    });
  };

  try {
    await checkToolAccess(toolName, grant);

    // Log successful access
    await safeAuditLog({
      userId: grant.userId,
      toolName,
      action: 'ACCESS_ALLOWED',
      ipAddress: context?.ipAddress,
      userAgent: context?.userAgent,
      timestamp: new Date(),
    });

    return { allowed: true };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);

    // Log denied access
    await safeAuditLog({
      userId: grant.userId,
      toolName,
      action: 'ACCESS_DENIED',
      error: errorMessage,
      ipAddress: context?.ipAddress,
      userAgent: context?.userAgent,
      timestamp: new Date(),
    });

    return { allowed: false, error: errorMessage };
  }
}

/**
 * Wrapper for derivePermissionGrant that logs grant derivation
 */
export async function derivePermissionGrantWithAudit(
  event: any, // RequestEvent
  context?: {
    ipAddress?: string;
    userAgent?: string;
  }
): Promise<PermissionGrant> {
  const { derivePermissionGrant } = await import('./tool-authorization.js');

  const grant = derivePermissionGrant(event);
  const user = event.locals?.user;

  // Log grant derivation
  await logAuthorizationAudit({
    userId: grant.userId,
    toolName: '*', // Wildcard for grant derivation
    action: 'GRANT_DERIVED',
    userRole: user?.role,
    ipAddress: context?.ipAddress,
    userAgent: context?.userAgent,
    timestamp: new Date(),
  }).catch((auditError) => {
    console.error('[Authorization Audit] Non-blocking derivation failure:', auditError);
  });

  return grant;
}
