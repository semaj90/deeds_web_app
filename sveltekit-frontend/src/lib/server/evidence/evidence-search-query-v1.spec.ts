import { describe, expect, it } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import { buildEvidenceBm25QueryV1 } from './evidence-search-query-v1.js';

const dialect = new PgDialect();

describe('evidence BM25 query builder', () => {
	it('builds a valid WHERE clause for global search', () => {
		const query = dialect.sqlToQuery(buildEvidenceBm25QueryV1({ query: 'lease clause', limit: 10 }));
		expect(query.sql).toContain('FROM evidence');
		expect(query.sql).toContain('file_name AS "fileName"');
		expect(query.sql).toContain('WHERE search_vector @@ plainto_tsquery');
		expect(query.sql).not.toMatch(/FROM evidence\s+AND\b/);
		expect(query.params).toEqual(['lease clause', 'lease clause', 10]);
	});

	it('adds case scope before the lexical predicate', () => {
		const caseId = '11111111-1111-4111-8111-111111111111';
		const query = dialect.sqlToQuery(buildEvidenceBm25QueryV1({ caseId, query: 'motion', limit: 7 }));
		expect(query.sql).toContain('WHERE case_id = $2 AND search_vector @@ plainto_tsquery');
		expect(query.params).toEqual(['motion', caseId, 'motion', 7]);
	});
});
