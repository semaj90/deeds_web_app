/**
 * GET /api/search/filters
 *
 * Return available filter facets (jurisdictions, categories, types, metadataLabels)
 * for the search UI. Queries DISTINCT values from cases/statutes tables and JSONB labels.
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { cacheControl, checkETag, notModified } from '$lib/server/middleware/cache-headers.js';
import { z } from 'zod';
import { db } from '$lib/server/db/client';
import { cases, statutes } from '$lib/server/db/schema-postgres.js';
import { crimes } from '$lib/server/db/schema/legal-cases.js';
import { isNotNull, sql } from 'drizzle-orm';
import {
  buildJsonbMetadataLabels,
  casesJsonb as jsonbCases,
  evidenceJsonb,
  legalDocumentsJsonb,
} from '$lib/server/db/jsonb-legal-schema.js';

const querySchema = z.object({
  type: z.enum(['cases', 'laws']).default('laws'),
});

function distinctValues(rows: Array<{ value: string | null | undefined }>): string[] {
  return Array.from(
    new Set(rows.map((row) => row.value?.trim()).filter((value): value is string => Boolean(value)))
  ).sort((left, right) => left.localeCompare(right));
}

async function loadJsonbMetadataLabels(type: 'cases' | 'laws'): Promise<string[]> {
  if (type === 'cases') {
    const [
      documentTypeRows,
      practiceAreaRows,
      caseNumberRows,
      evidenceTypeRows,
      admissibilityRows,
      chainRows,
      aiMetadataRows,
    ] = await Promise.all([
      db
        .selectDistinct({ value: legalDocumentsJsonb.documentType })
        .from(legalDocumentsJsonb)
        .where(isNotNull(legalDocumentsJsonb.documentType)),
      db
        .selectDistinct({ value: legalDocumentsJsonb.practiceArea })
        .from(legalDocumentsJsonb)
        .where(isNotNull(legalDocumentsJsonb.practiceArea)),
      db
        .selectDistinct({ value: jsonbCases.caseNumber })
        .from(jsonbCases)
        .where(isNotNull(jsonbCases.caseNumber)),
      db
        .selectDistinct({ value: evidenceJsonb.evidenceType })
        .from(evidenceJsonb)
        .where(isNotNull(evidenceJsonb.evidenceType)),
      db
        .selectDistinct({ value: sql<string>`'admissibility'` })
        .from(evidenceJsonb)
        .where(sql`${evidenceJsonb.metadata} -> 'admissibility' IS NOT NULL`),
      db
        .selectDistinct({ value: sql<string>`'chainOfCustody'` })
        .from(evidenceJsonb)
        .where(sql`${evidenceJsonb.metadata} -> 'chainOfCustody' IS NOT NULL`),
      db
        .selectDistinct({ value: sql<string>`'aiMetadata'` })
        .from(legalDocumentsJsonb)
        .where(sql`${legalDocumentsJsonb.metadata} -> 'aiMetadata' IS NOT NULL`),
    ]);

    return buildJsonbMetadataLabels({
      documentTypes: distinctValues(documentTypeRows),
      practiceAreas: distinctValues(practiceAreaRows),
      caseNumbers: distinctValues(caseNumberRows),
      evidenceTypes: distinctValues(evidenceTypeRows),
      hasAdmissibility: admissibilityRows.length > 0,
      hasChainOfCustody: chainRows.length > 0,
      hasAiMetadata: aiMetadataRows.length > 0,
    });
  }

  const [documentTypeRows, practiceAreaRows, aiMetadataRows] = await Promise.all([
    db
      .selectDistinct({ value: legalDocumentsJsonb.documentType })
      .from(legalDocumentsJsonb)
      .where(isNotNull(legalDocumentsJsonb.documentType)),
    db
      .selectDistinct({ value: legalDocumentsJsonb.practiceArea })
      .from(legalDocumentsJsonb)
      .where(isNotNull(legalDocumentsJsonb.practiceArea)),
    db
      .selectDistinct({ value: sql<string>`'aiMetadata'` })
      .from(legalDocumentsJsonb)
      .where(sql`${legalDocumentsJsonb.metadata} -> 'aiMetadata' IS NOT NULL`),
  ]);

  return buildJsonbMetadataLabels({
    documentTypes: distinctValues(documentTypeRows),
    practiceAreas: distinctValues(practiceAreaRows),
    hasAiMetadata: aiMetadataRows.length > 0,
  });
}

export const GET: RequestHandler = async ({ url, locals, request }) => {
  if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });
  const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) {
    return json(
      {
        jurisdictions: [],
        categories: [],
        types: [],
        metadataLabels: [],
        error: parsed.error.issues[0]?.message,
      },
      { status: 400 }
    );
  }
  const { type } = parsed.data;

  try {
    if (type === 'cases') {
      const [metadataLabels, [jurisdictionRows, practiceAreaRows, crimeCategoryRows, crimeClassificationRows]] =
        await Promise.all([
          loadJsonbMetadataLabels(type),
          Promise.all([
          db
            .selectDistinct({ value: cases.jurisdiction })
            .from(cases)
            .where(isNotNull(cases.jurisdiction)),
          db
            .selectDistinct({ value: cases.practiceArea })
            .from(cases)
            .where(isNotNull(cases.practiceArea)),
          db
            .selectDistinct({ value: crimes.crimeCategory })
            .from(crimes)
            .where(isNotNull(crimes.crimeCategory)),
          db
            .selectDistinct({ value: crimes.crimeClassification })
            .from(crimes)
            .where(isNotNull(crimes.crimeClassification)),
        ]),
        ]);

      const jurisdictions = distinctValues(jurisdictionRows);
      const categories = distinctValues([...practiceAreaRows, ...crimeCategoryRows]);
      const types = distinctValues(crimeClassificationRows);

      const responseData = { jurisdictions, categories, types, metadataLabels };
      const { etag, isMatch } = checkETag(responseData, request.headers);
      if (isMatch) return notModified(etag);

      return json(responseData, {
        headers: { ...cacheControl.medium, ETag: etag },
      });
    }

    const [metadataLabels, [jurisdictionRows, categoryRows]] = await Promise.all([
      loadJsonbMetadataLabels(type),
      Promise.all([
      db
        .selectDistinct({ value: statutes.jurisdiction })
        .from(statutes)
        .where(isNotNull(statutes.jurisdiction)),
      db
        .selectDistinct({ value: statutes.category })
        .from(statutes)
        .where(isNotNull(statutes.category)),
      ]),
    ]);
    const jurisdictions = distinctValues(jurisdictionRows);
    const categories = distinctValues(categoryRows);
    const types = [...categories];

    const responseData = { jurisdictions, categories, types, metadataLabels };
    const { etag, isMatch } = checkETag(responseData, request.headers);
    if (isMatch) return notModified(etag);

    return json(responseData, {
      headers: { ...cacheControl.medium, ETag: etag },
    });
  } catch (err) {
    console.error('[search/filters] error:', err);
    const fallbackData = { jurisdictions: [], categories: [], types: [], metadataLabels: [] };
    return json(fallbackData, {
      headers: cacheControl.medium,
    });
  }
};
