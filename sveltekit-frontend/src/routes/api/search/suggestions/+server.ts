/**
 * GET /api/search/suggestions
 *
 * Return autocomplete suggestions for a partial search query.
 * Aggregates from: cases, statutes, Go legal service, evidence, reports.
 *
 * Query params:
 *   query  — search prefix (min 2 chars)
 *   type   — 'all' | 'cases' | 'laws' (default 'all')
 *   limit  — max per source (1-20, default 10)
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { z } from 'zod';
import { db } from '$lib/server/db/client';
import { cases, statutes, evidence, reports } from '$lib/server/db/schema-postgres.js';
import { desc, ilike, or, sql } from 'drizzle-orm';
import { ENV } from '$lib/server/env.server.js';
import type { PlatformSuggestion } from '$lib/types/search.js';
import { cacheControl } from '$lib/server/middleware/cache-headers.js';

const querySchema = z.object({
  query: z.string().max(500).default(''),
  type: z.enum(['all', 'cases', 'laws']).default('all'),
  limit: z.coerce.number().int().min(1).max(20).default(10),
});

function uniqueByText(items: PlatformSuggestion[], max: number): PlatformSuggestion[] {
  const seen = new Set<string>();
  const result: PlatformSuggestion[] = [];
  for (const item of items) {
    const key = item.text.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(item);
    if (result.length >= max) break;
  }
  return result;
}

/** Case suggestions (case number + title) */
async function getCaseSuggestions(query: string, limit: number): Promise<PlatformSuggestion[]> {
  const pattern = `${query}%`;
  const caseSuggestionScore = sql<number>`
		CASE
			WHEN ${cases.title} ILIKE ${pattern} THEN 1
			WHEN ${cases.caseNumber} ILIKE ${pattern} THEN 0.95
			ELSE 0.5
		END
	`;
  const rows = await db
    .select({
      value: sql<string>`
				CASE
					WHEN ${cases.caseNumber} IS NOT NULL AND ${cases.caseNumber} <> '' THEN ${cases.caseNumber} || ' - ' || ${cases.title}
					ELSE ${cases.title}
				END
			`,
      score: caseSuggestionScore,
      createdAt: cases.createdAt,
    })
    .from(cases)
    .where(or(ilike(cases.title, pattern), ilike(cases.caseNumber, pattern)))
    .orderBy(desc(caseSuggestionScore), desc(cases.createdAt))
    .limit(limit);

  return rows.filter((r) => r.value).map((r) => ({ text: r.value!, source: 'case' as const }));
}

/** Law/statute suggestions (section + title) */
async function getLawSuggestions(query: string, limit: number): Promise<PlatformSuggestion[]> {
  const pattern = `${query}%`;
  const lawSuggestionScore = sql<number>`
		CASE
			WHEN ${statutes.title} ILIKE ${pattern} THEN 1
			WHEN ${statutes.section} ILIKE ${pattern} THEN 0.95
			ELSE 0.5
		END
	`;
  const rows = await db
    .select({
      value: sql<string>`
				CASE
					WHEN ${statutes.section} IS NOT NULL AND ${statutes.section} <> '' THEN ${statutes.section} || ' - ' || ${statutes.title}
					ELSE ${statutes.title}
				END
			`,
      createdAt: statutes.createdAt,
    })
    .from(statutes)
    .where(or(ilike(statutes.title, pattern), ilike(statutes.section, pattern)))
    .orderBy(desc(lawSuggestionScore), desc(statutes.createdAt))
    .limit(limit);

  return rows.filter((r) => r.value).map((r) => ({ text: r.value!, source: 'document' as const }));
}

/** Go legal service suggestions (headings, citations, document titles) */
async function getGoSuggestions(query: string, limit: number): Promise<PlatformSuggestion[]> {
  const goUrl = ENV.GO_SEARCH_URL;
  if (!goUrl) return [];
  try {
    const res = await fetch(`${goUrl}/suggest?q=${encodeURIComponent(query)}&limit=${limit}`, {
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.suggestions ?? []).map((s: { text: string; source: string }) => ({
      text: s.text,
      source: (s.source === 'heading'
        ? 'heading'
        : s.source === 'citation'
          ? 'citation'
          : 'document') as PlatformSuggestion['source'],
    }));
  } catch {
    return [];
  }
}

/** Evidence title suggestions */
async function getEvidenceSuggestions(query: string, limit: number): Promise<PlatformSuggestion[]> {
  const pattern = `${query}%`;
  const rows = await db
    .select({ value: evidence.title })
    .from(evidence)
    .where(ilike(evidence.title, pattern))
    .orderBy(desc(evidence.createdAt))
    .limit(limit);

  return rows.filter((r) => r.value).map((r) => ({ text: r.value!, source: 'evidence' as const }));
}

/** Report title suggestions */
async function getReportSuggestions(query: string, limit: number): Promise<PlatformSuggestion[]> {
  const pattern = `${query}%`;
  const rows = await db
    .select({ value: reports.title })
    .from(reports)
    .where(ilike(reports.title, pattern))
    .orderBy(desc(reports.createdAt))
    .limit(limit);

  return rows.filter((r) => r.value).map((r) => ({ text: r.value!, source: 'report' as const }));
}

export const GET: RequestHandler = async ({ url, locals }) => {
  if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });
  const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) {
    return json(
      { suggestions: [], enrichedSuggestions: [], error: parsed.error.issues[0]?.message },
      { status: 400 }
    );
  }
  const { query, type, limit } = parsed.data;

  if (!query.trim() || query.trim().length < 2) {
    return json({ suggestions: [], enrichedSuggestions: [] });
  }

  try {
    let allSuggestions: PlatformSuggestion[] = [];

    if (type === 'cases') {
      allSuggestions = await getCaseSuggestions(query, limit);
    } else if (type === 'laws') {
      allSuggestions = await getLawSuggestions(query, limit);
    } else {
      // type === 'all' — fan out to all sources
      const perSource = Math.max(3, Math.ceil(limit / 3));
      const settled = await Promise.allSettled([
        getGoSuggestions(query, perSource),
        getCaseSuggestions(query, perSource),
        getLawSuggestions(query, perSource),
        getEvidenceSuggestions(query, perSource),
        getReportSuggestions(query, perSource),
      ]);

      for (const result of settled) {
        if (result.status === 'fulfilled') {
          allSuggestions.push(...result.value);
        }
      }
    }

    const deduped = uniqueByText(allSuggestions, limit);

    return json(
      {
        suggestions: deduped.map((s) => s.text),
        enrichedSuggestions: deduped,
      },
      { headers: cacheControl.short }
    );
  } catch (err) {
    console.error('[search/suggestions] error:', err);
    return json({ suggestions: [], enrichedSuggestions: [] }, { headers: cacheControl.short });
  }
};
