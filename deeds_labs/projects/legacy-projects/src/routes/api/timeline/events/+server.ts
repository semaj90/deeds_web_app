import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import { sql } from 'drizzle-orm';

type TimelineRow = {
  id: string;
  case_id: string | null;
  event_type: string | null;
  title: string | null;
  description: string | null;
  event_date: string | null;
  importance: string | null;
  automated: boolean | null;
  event_data: unknown;
  evidence_id: string | null;
  related_entity_id: string | null;
  related_entity_type: string | null;
};

export const GET: RequestHandler = async ({ url }) => {
  const caseId = url.searchParams.get('caseId');
  const limit = Number(url.searchParams.get('limit') ?? '150');

  try {
    const rows = await db.execute(
      sql<TimelineRow>`
        SELECT
          id,
          case_id,
          event_type,
          title,
          description,
          event_date,
          importance,
          automated,
          event_data,
          evidence_id,
          related_entity_id,
          related_entity_type
        FROM case_timeline
        ${caseId ? sql`WHERE case_id = ${caseId}` : sql``}
        ORDER BY event_date ASC
        LIMIT ${Math.min(Math.max(limit, 25), 500)}
      `
    );

    return json({
      success: true,
      events: rows.rows.map((row) => ({
        id: row.id,
        caseId: row.case_id,
        type: row.event_type ?? 'event',
        title: row.title ?? 'Timeline Event',
        description: row.description ?? '',
        timestamp: row.event_date,
        importance: row.importance ?? 'medium',
        automated: row.automated ?? false,
        evidenceId: row.evidence_id,
        relatedEntityId: row.related_entity_id,
        relatedEntityType: row.related_entity_type,
        data: row.event_data ?? {}
      }))
    });
  } catch (error) {
    console.error('Failed to load timeline events:', error);
    return json(
      {
        success: false,
        events: [],
        error: 'Timeline data unavailable'
      },
      { status: 200 }
    );
  }
};
