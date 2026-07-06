/**
 * Dispatcher Audit Stats API
 * GET /api/dispatcher/audit/stats — Get audit statistics
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { getAuditStats, cleanupOldAuditLogs } from '$lib/server/dispatcher/dispatcher-audit-service.js';

/**
 * GET /api/dispatcher/audit/stats
 * Get audit log statistics
 */
export const GET: RequestHandler = async ({ url }) => {
  try {
    const since_minutes = Math.min(
      Math.max(parseInt(url.searchParams.get('since_minutes') || '1440', 10), 60),
      10080 // 7 days max
    );

    const stats = await getAuditStats(db, since_minutes);

    return json({
      success: true,
      data: stats,
      window_minutes: since_minutes,
    });
  } catch (err) {
    console.error('[audit-stats-api] Query failed:', err);
    return json(
      {
        success: false,
        error: String(err),
      },
      { status: 500 }
    );
  }
};

/**
 * POST /api/dispatcher/audit/stats?cleanup=true
 * Trigger cleanup of old audit logs (admin only)
 */
export const POST: RequestHandler = async ({ url, locals }) => {
  try {
    // Check admin authorization (placeholder)
    if (!locals.user) {
      return json(
        {
          success: false,
          error: 'Unauthorized',
        },
        { status: 401 }
      );
    }

    if (url.searchParams.get('cleanup') === 'true') {
      const retention_days = Math.max(parseInt(url.searchParams.get('retention_days') || '30', 10), 7);
      const deleted = await cleanupOldAuditLogs(db, retention_days);

      return json({
        success: true,
        message: `Cleaned up ${deleted} audit log entries older than ${retention_days} days`,
        deleted,
      });
    }

    return json(
      {
        success: false,
        error: 'Invalid operation',
      },
      { status: 400 }
    );
  } catch (err) {
    console.error('[audit-cleanup-api] Operation failed:', err);
    return json(
      {
        success: false,
        error: String(err),
      },
      { status: 500 }
    );
  }
};
