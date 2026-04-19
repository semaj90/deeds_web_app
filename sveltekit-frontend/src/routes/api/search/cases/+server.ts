/**
 * GET /api/search/cases
 *
 * Search legal cases by query string with optional jurisdiction,
 * crime category, and crime classification filters.
 * Uses Drizzle ILIKE for text search.
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { z } from 'zod';
import { db } from '$lib/server/db/client';
import { cases } from '$lib/server/db/schema-postgres.js';
import { crimes } from '$lib/server/db/schema/legal-cases.js';
import { and, desc, eq, ilike, or, sql } from 'drizzle-orm';
import { cacheControl } from '$lib/server/middleware/cache-headers.js';
import { recordSearchQuery } from '$lib/server/analytics/search-analytics.js';

const querySchema = z.object({
  query: z.string().max(500).default(''),
  limit: z.coerce.number().int().min(1).max(50).default(10),
  jurisdiction: z.string().max(200).optional(),
  crimeCategory: z.string().max(200).optional(),
  crimeClassification: z.string().max(200).optional(),
});

type CaseSearchRow = {
  id: string;
  title: string;
  description: string | null;
  caseNumber: string | null;
  status: string;
  priority: string;
  jurisdiction: string | null;
  court: string | null;
  practiceArea: string | null;
  createdAt: string;
  crimeCategories: string[];
  crimeClassifications: string[];
  score: number;
};

export const GET: RequestHandler = async ({ url, locals }) => {
  if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });
  const startTime = performance.now();

  const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) {
    return json(
      {
        results: [],
        total: 0,
        query: '',
        executionTimeMs: 0,
        error: parsed.error.issues[0]?.message,
      },
      { status: 400 }
    );
  }
  const { query, limit, jurisdiction, crimeCategory, crimeClassification } = parsed.data;

  recordSearchQuery({ query, pipeline: 'rag', cacheHit: false, userId: locals.user.id });

  if (!query.trim() || query.trim().length < 2) {
    return json({ results: [], total: 0, query, executionTimeMs: 0 });
  }

  try {
    const pattern = `%${query}%`;
    const prefixPattern = `${query}%`;
    const crimeCategoriesAgg = sql<string[]>`
			COALESCE(
				array_agg(DISTINCT ${crimes.crimeCategory}) FILTER (WHERE ${crimes.crimeCategory} IS NOT NULL),
				ARRAY[]::text[]
			)
		`;
    const crimeClassificationsAgg = sql<string[]>`
			COALESCE(
				array_agg(DISTINCT ${crimes.crimeClassification}) FILTER (WHERE ${crimes.crimeClassification} IS NOT NULL),
				ARRAY[]::text[]
			)
		`;
    const scoreExpr = sql<number>`
			CASE
				WHEN ${cases.title} ILIKE ${prefixPattern} THEN 1.0
				WHEN ${cases.caseNumber} ILIKE ${prefixPattern} THEN 0.95
				WHEN ${cases.title} ILIKE ${pattern} THEN 0.85
				WHEN ${cases.caseNumber} ILIKE ${pattern} THEN 0.8
				WHEN ${crimes.crimeCode} ILIKE ${pattern} THEN 0.72
				WHEN ${crimes.crimeCategory} ILIKE ${pattern} THEN 0.68
				WHEN ${crimes.crimeClassification} ILIKE ${pattern} THEN 0.64
				WHEN ${cases.description} ILIKE ${pattern} THEN 0.55
				ELSE 0.35
			END
		`;
    const conditions = [
      or(
        ilike(cases.title, pattern),
        ilike(cases.description, pattern),
        ilike(cases.caseNumber, pattern),
        ilike(cases.practiceArea, pattern),
        ilike(cases.jurisdiction, pattern),
        ilike(crimes.crimeCode, pattern),
        ilike(crimes.crimeCategory, pattern),
        ilike(crimes.crimeClassification, pattern)
      ),
    ];

    if (jurisdiction) {
      conditions.push(eq(cases.jurisdiction, jurisdiction));
    }
    if (crimeCategory) {
      conditions.push(
        or(eq(cases.practiceArea, crimeCategory), eq(crimes.crimeCategory, crimeCategory))
      );
    }
    if (crimeClassification) {
      conditions.push(eq(crimes.crimeClassification, crimeClassification));
    }

    const rows = await db
      .select({
        id: cases.id,
        title: cases.title,
        description: cases.description,
        caseNumber: cases.caseNumber,
        status: cases.status,
        priority: cases.priority,
        jurisdiction: cases.jurisdiction,
        court: cases.court,
        practiceArea: cases.practiceArea,
        createdAt: cases.createdAt,
        crimeCategories: crimeCategoriesAgg,
        crimeClassifications: crimeClassificationsAgg,
        score: scoreExpr,
      })
      .from(cases)
      .leftJoin(crimes, eq(crimes.caseId, cases.id))
      .where(and(...conditions))
      .groupBy(
        cases.id,
        cases.title,
        cases.description,
        cases.caseNumber,
        cases.status,
        cases.priority,
        cases.jurisdiction,
        cases.court,
        cases.practiceArea,
        cases.createdAt
      )
      .orderBy(desc(scoreExpr), desc(cases.createdAt))
      .limit(limit);

    const results = (rows as CaseSearchRow[]).map((row) => ({
      id: row.id,
      title: row.title,
      text:
        row.description !== null && row.description !== undefined
          ? row.description
          : [row.caseNumber, row.court, row.jurisdiction].filter(Boolean).join(' · ') ||
            'Case search result',
      score: Number(row.score ?? 0),
      metadata: {
        caseNumber: row.caseNumber,
        status: row.status,
        priority: row.priority,
        jurisdiction: row.jurisdiction,
        court: row.court,
        practiceArea: row.practiceArea,
        crimeCategories: row.crimeCategories,
        crimeClassifications: row.crimeClassifications,
        createdAt: row.createdAt,
      },
    }));

    const executionTimeMs = Math.round(performance.now() - startTime);

    return json(
      {
        results,
        total: results.length,
        query,
        executionTimeMs,
      },
      { headers: cacheControl.short }
    );
  } catch (err) {
    console.error('[search/cases] error:', err);
    const executionTimeMs = Math.round(performance.now() - startTime);
    return json({ results: [], total: 0, query, executionTimeMs }, { headers: cacheControl.short });
  }
};
