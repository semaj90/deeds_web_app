import { db } from '$lib/server/db/client';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { cacheControl, checkETag, notModified } from '$lib/server/middleware/cache-headers.js';
import { sql, count } from 'drizzle-orm';
import { legalGlossary, statutes, legalPrecedents } from '$lib/server/db/schema-postgres.js';
import { savedCitations } from '$lib/server/db/client';

/**
 * GET /api/dashboard/stats
 * Aggregate counts for the dashboard overview + knowledge base
 */
export const GET: RequestHandler = async ({ locals, request }) => {
  if (!locals.user?.id) {
    return json(
      {
        activeCases: 0,
        totalEvidence: 0,
        personsOfInterest: 0,
        totalCitations: 0,
        savedCitations: 0,
        recentActivity: 0,
        knowledgeBase: {
          glossary: 0,
          statutes: 0,
          precedents: 0,
          total: 0,
        },
        error: 'Unauthorized',
      },
      { status: 401 }
    );
  }
  let dbErrors = 0;
  const exec = async (query: ReturnType<typeof sql>): Promise<Record<string, unknown>> => {
    try {
      const result = await db.execute(query);
      // node-postgres driver: result has .rows array
      const res = result as unknown as { rows?: Record<string, unknown>[] };
      const rows = res.rows ?? [];
      return rows[0] ?? {};
    } catch (err) {
      dbErrors++;
      console.warn('[dashboard/stats] DB query failed:', (err as Error).message);
      return {};
    }
  };

  const [
    cases,
    evidence,
    persons,
    citations,
    glossaryCount,
    statuteCount,
    precedentCount,
    savedCitationsCount,
  ] = await Promise.all([
    exec(sql`SELECT
			COUNT(*) FILTER (WHERE status IN ('open', 'active', 'investigating')) as active,
			COUNT(*) as total
			FROM cases`),
    exec(sql`SELECT COUNT(*) as total FROM evidence`),
    exec(sql`SELECT COUNT(*) as total FROM persons_of_interest`),
    exec(sql`SELECT COUNT(*) as total FROM citations`),
    db
      .select({ value: count() })
      .from(legalGlossary)
      .$withCache({ config: { ex: 3600 } })
      .then((r) => r[0]?.value ?? 0)
      .catch(() => 0),
    db
      .select({ value: count() })
      .from(statutes)
      .$withCache({ config: { ex: 3600 } })
      .then((r) => r[0]?.value ?? 0)
      .catch(() => 0),
    db
      .select({ value: count() })
      .from(legalPrecedents)
      .$withCache({ config: { ex: 3600 } })
      .then((r) => r[0]?.value ?? 0)
      .catch(() => 0),
    db
      .select({ value: count() })
      .from(savedCitations)
      .$withCache({ config: { ex: 3600 } })
      .then((r) => r[0]?.value ?? 0)
      .catch(() => 0),
  ]);

  const responseData = {
    activeCases: Number(cases.active ?? 0),
    totalEvidence: Number(evidence.total ?? 0),
    personsOfInterest: Number(persons.total ?? 0),
    totalCitations: Number(citations.total ?? 0),
    savedCitations: Number(savedCitationsCount),
    recentActivity: Number(cases.total ?? 0),
    knowledgeBase: {
      glossary: Number(glossaryCount),
      statutes: Number(statuteCount),
      precedents: Number(precedentCount),
      total: Number(glossaryCount) + Number(statuteCount) + Number(precedentCount),
    },
    ...(dbErrors > 0 && { _dbDegraded: true, _dbErrors: dbErrors }),
  };
  const { etag, isMatch } = checkETag(responseData, request.headers);
  if (isMatch) return notModified(etag);
  return json(responseData, { headers: { ...cacheControl.short, ETag: etag } });
};
