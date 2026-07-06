/**
 * Dispatcher Audit API
 * GET /api/dispatcher/audit — Query audit logs
 * GET /api/dispatcher/audit/stats — Get statistics
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { getRecentDecisions, getAuditStats } from '$lib/server/dispatcher/dispatcher-audit-service.js';

/**
 * GET /api/dispatcher/audit
 * Query audit log entries
 */
export const GET: RequestHandler = async ({ url }) => {
  try {
    // Parse query parameters
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '100', 10), 1000);
    const offset = Math.max(parseInt(url.searchParams.get('offset') || '0', 10), 0);
    const packet_key = url.searchParams.get('packet_key') || undefined;
    const decision = url.searchParams.get('decision') || undefined;
    const status = url.searchParams.get('status') || undefined;
    const since_minutes = Math.min(
      Math.max(parseInt(url.searchParams.get('since_minutes') || '60', 10), 1),
      10080 // 7 days max
    );

    // Get audit logs
    const entries = await getRecentDecisions(db, {
      limit,
      offset,
      packet_key,
      decision,
      status,
      since_minutes,
    });

    return json({
      success: true,
      data: entries,
      pagination: {
        limit,
        offset,
        total: entries.length,
      },
    });
  } catch (err) {
    console.error('[audit-api] Query failed:', err);
    return json(
      {
        success: false,
        error: String(err),
        data: [],
      },
      { status: 500 }
    );
  }
};
