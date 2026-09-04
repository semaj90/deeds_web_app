import { pool } from '$lib/server/db/client';
import type { PageServerLoad } from './$types';

function externalSourceUrl(value: string): string | null {
	try {
		const url = new URL(value);
		return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null;
	} catch {
		return null;
	}
}

export const load: PageServerLoad = async () => {
	const safeRows = async <TRow>(
		query: Promise<{ rows: TRow[] }>
	): Promise<TRow[]> => query.then((result) => result.rows).catch(() => []);

	const [termsRes, categoriesRes, definitionsRes] = await Promise.all([
		safeRows(
			pool.query<{
				id: string;
				term: string;
				definition: string;
				category: string | null;
				jurisdiction: string | null;
				related_terms: unknown;
				sources: unknown;
			}>(
				`SELECT id, term, definition, category, jurisdiction, related_terms, sources
				 FROM legal_glossary
				 ORDER BY category NULLS LAST, term`
			)
		),
		safeRows(
			pool.query<{ category: string; count: string }>(
				`SELECT COALESCE(category, 'uncategorized') AS category, COUNT(*) AS count
				 FROM legal_glossary
				 GROUP BY category
				 ORDER BY count DESC`
			)
		),
		// Definitions extracted from indexed documents (via legal-chunker)
		safeRows(
			pool.query<{
				id: string;
				term: string;
				definition_text: string;
				node_heading: string | null;
					doc_title: string | null;
					doc_id: string | null;
					official_url: string | null;
			}>(
				`SELECT ld.id, ld.term, ld.definition_text,
				        ln.heading AS node_heading,
				        libdoc.title AS doc_title,
				        libdoc.id AS doc_id,
				        libdoc.official_url
				 FROM legal_definitions ld
				 JOIN legal_nodes ln ON ln.id = ld.defined_in_node_id
				 JOIN library_documents libdoc ON libdoc.id = ln.document_id
				 ORDER BY ld.normalized_term
				 LIMIT 500`
			)
		),
	]);

	const terms = termsRes.map((r) => ({
		id: r.id,
		term: r.term,
		definition: r.definition,
		category: r.category ?? 'general',
		jurisdiction: r.jurisdiction ?? 'Federal/State',
		relatedTerms: Array.isArray(r.related_terms) ? (r.related_terms as string[]) : [],
		sources: Array.isArray(r.sources) ? (r.sources as string[]) : [],
		sourceLinks: (Array.isArray(r.sources) ? (r.sources as string[]) : [])
			.map(externalSourceUrl)
			.filter((source): source is string => source !== null),
	}));

	const categories = categoriesRes.map((r) => ({
		name: r.category,
		count: Number(r.count),
	}));

	const corpusDefinitions = definitionsRes.map((r) => ({
		id: r.id,
		term: r.term,
		definitionText: r.definition_text,
		nodeHeading: r.node_heading,
		docTitle: r.doc_title,
		docId: r.doc_id,
		sourceUrl: r.official_url ? externalSourceUrl(r.official_url) : null,
	}));

	return { terms, categories, corpusDefinitions };
};
