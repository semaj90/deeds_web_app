/**
 * GET /api/search/filters
 *
 * Return available filter facets (jurisdictions, categories, types)
 * for the search UI. Queries DISTINCT values from cases/statutes tables.
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { cases, statutes } from '$lib/server/db/schema-postgres.js';
import { crimes } from '$lib/server/db/schema/legal-cases.js';
import { isNotNull } from 'drizzle-orm';

function distinctValues(rows: Array<{ value: string | null | undefined }>): string[] {
	return Array.from(
		new Set(rows.map((row) => row.value?.trim()).filter((value): value is string => Boolean(value)))
	).sort((left, right) => left.localeCompare(right));
}

export const GET: RequestHandler = async ({ url }) => {
	const type = url.searchParams.get('type') ?? 'laws';

	try {
		if (type === 'cases') {
			const [jurisdictionRows, practiceAreaRows, crimeCategoryRows, crimeClassificationRows] = await Promise.all([
				db.selectDistinct({ value: cases.jurisdiction }).from(cases).where(isNotNull(cases.jurisdiction)),
				db.selectDistinct({ value: cases.practiceArea }).from(cases).where(isNotNull(cases.practiceArea)),
				db.selectDistinct({ value: crimes.crimeCategory }).from(crimes).where(isNotNull(crimes.crimeCategory)),
				db.selectDistinct({ value: crimes.crimeClassification }).from(crimes).where(isNotNull(crimes.crimeClassification)),
			]);

			const jurisdictions = distinctValues(jurisdictionRows);
			const categories = distinctValues([...practiceAreaRows, ...crimeCategoryRows]);
			const types = distinctValues(crimeClassificationRows);

			return json({ jurisdictions, categories, types });
		}

		const [jurisdictionRows, categoryRows] = await Promise.all([
			db.selectDistinct({ value: statutes.jurisdiction }).from(statutes).where(isNotNull(statutes.jurisdiction)),
			db.selectDistinct({ value: statutes.category }).from(statutes).where(isNotNull(statutes.category)),
		]);
		const jurisdictions = distinctValues(jurisdictionRows);
		const categories = distinctValues(categoryRows);
		const types = [...categories];

		return json({ jurisdictions, categories, types });
	} catch (err) {
		console.error('[search/filters] error:', err);
		return json({ jurisdictions: [], categories: [], types: [] });
	}
};