import { sql } from 'drizzle-orm';

export function buildEvidenceBm25QueryV1(input: {
	caseId?: string;
	query: string;
	limit: number;
}) {
	const where = input.caseId
		? sql`WHERE case_id = ${input.caseId} AND search_vector @@ plainto_tsquery('english', ${input.query})`
		: sql`WHERE search_vector @@ plainto_tsquery('english', ${input.query})`;

	return sql`
		SELECT id, title, description, summary, file_name AS "fileName",
			ts_rank_cd(search_vector, plainto_tsquery('english', ${input.query})) AS rank
		FROM evidence
		${where}
		ORDER BY rank DESC
		LIMIT ${input.limit}
	`;
}
