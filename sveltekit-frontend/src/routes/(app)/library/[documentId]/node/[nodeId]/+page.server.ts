import type { PageServerLoad } from './$types';
import { pool } from '$lib/server/db/client';
import { error } from '@sveltejs/kit';

/** Extract citation-like references from text using common legal patterns */
function extractCitationRefs(text: string | null): Array<{ label: string; type: string }> {
	if (!text) return [];
	const refs: Array<{ label: string; type: string }> = [];
	const seen = new Set<string>();

	// § section references
	for (const m of text.matchAll(/§\s*[\d.]+[a-z]?/g)) {
		const label = m[0].trim();
		if (!seen.has(label)) { seen.add(label); refs.push({ label, type: 'section' }); }
	}
	// Article references
	for (const m of text.matchAll(/Article\s+[IVXLCDM]+/gi)) {
		const label = m[0].trim();
		if (!seen.has(label)) { seen.add(label); refs.push({ label, type: 'article' }); }
	}
	// Amendment references
	for (const m of text.matchAll(/Amendment\s+[IVXLCDM\d]+/gi)) {
		const label = m[0].trim();
		if (!seen.has(label)) { seen.add(label); refs.push({ label, type: 'amendment' }); }
	}
	// USC references
	for (const m of text.matchAll(/\d+\s+U\.?S\.?C\.?\s*§?\s*\d+/g)) {
		const label = m[0].trim();
		if (!seen.has(label)) { seen.add(label); refs.push({ label, type: 'statute' }); }
	}
	// Case citations (Name v. Name)
	for (const m of text.matchAll(/[A-Z][a-z]+\s+v\.\s+[A-Z][a-z]+/g)) {
		const label = m[0].trim();
		if (!seen.has(label)) { seen.add(label); refs.push({ label, type: 'case' }); }
	}

	return refs.slice(0, 20);
}

/** Generate contextual implications based on corpus type and node metadata */
function generateImplications(corpusType: string, heading: string, jurisdictionName: string | null) {
	const jur = jurisdictionName ?? 'the applicable jurisdiction';

	const templates: Record<string, Array<{ title: string; description: string; icon: string; status: string }>> = {
		constitution: [
			{ title: 'Constitutional Authority', description: `This provision carries the highest legal authority in ${jur}. All subsequent legislation must conform to this framework.`, icon: 'shield-alert', status: 'high' },
			{ title: 'Amendment Scope', description: `Changes to this section require formal amendment procedures, making it resistant to ordinary legislative modification.`, icon: 'lock', status: 'medium' },
			{ title: 'Judicial Review', description: `Courts may interpret the scope and application of this provision, leading to evolving legal standards.`, icon: 'help-circle', status: 'low' },
		],
		statute: [
			{ title: 'Compliance Risk', description: `Organizations operating in ${jur} must ensure compliance with this statute to avoid civil and criminal liability.`, icon: 'shield-alert', status: 'high' },
			{ title: 'Enforcement', description: `Enforcement agencies may investigate and prosecute violations under this statutory framework.`, icon: 'lock', status: 'medium' },
			{ title: 'Legal Uncertainty', description: `Key terms in this statute may be subject to ongoing judicial interpretation and evolving case law.`, icon: 'help-circle', status: 'low' },
		],
		regulation: [
			{ title: 'Regulatory Compliance', description: `Regulated entities must meet the requirements of this regulation within ${jur}.`, icon: 'shield-alert', status: 'high' },
			{ title: 'Reporting Requirements', description: `This regulation may impose disclosure, reporting, or record-keeping obligations.`, icon: 'lock', status: 'medium' },
			{ title: 'Penalty Risk', description: `Non-compliance may result in administrative penalties, fines, or enforcement actions.`, icon: 'help-circle', status: 'low' },
		],
	};

	return templates[corpusType] ?? templates.statute;
}

export const load: PageServerLoad = async ({ params }) => {
	const { documentId, nodeId } = params;

	try {
		// 1. Fetch the node and its document
		const nodeRes = await pool.query(
			`SELECT ln.*, ld.title as doc_title, ld.corpus_type, ld.effective_date, ld.official_url,
			        ld.page_count, ld.word_count,
			        j.code as jurisdiction_code, j.name as jurisdiction_name
			 FROM legal_nodes ln
			 JOIN library_documents ld ON ld.id = ln.document_id
			 LEFT JOIN jurisdictions j ON j.id = ld.jurisdiction_id
			 WHERE ln.id = $1 AND ln.document_id = $2`,
			[nodeId, documentId]
		);

		if (!nodeRes.rows[0]) {
			throw error(404, 'Legal node not found');
		}

		const node = nodeRes.rows[0];

		// 2-6: Run remaining queries in parallel
		const [childrenRes, definitionsRes, siblingsRes, tocRes, chunksRes] = await Promise.all([
			// 2. Children nodes (Key Provisions)
			pool.query(
				`SELECT id, heading, citation_label, node_type, full_text
				 FROM legal_nodes
				 WHERE parent_node_id = $1
				 ORDER BY ordinal ASC, node_path ASC, char_start ASC NULLS LAST`,
				[nodeId]
			),

			// 3. Definitions linked to this node
			pool.query(
				`SELECT term, definition_text
				 FROM legal_definitions
				 WHERE defined_in_node_id = $1`,
				[nodeId]
			),

			// 4. Siblings for prev/next navigation
			pool.query(
				`SELECT id, heading, citation_label
				 FROM legal_nodes
				 WHERE document_id = $1
				   AND (
				   	($2::uuid IS NULL AND parent_node_id IS NULL)
				   	OR parent_node_id = $2::uuid
				   )
				 ORDER BY ordinal ASC, node_path ASC, char_start ASC NULLS LAST`,
				[documentId, node.parent_node_id ?? null]
			),

			// 5. Full TOC for this document (left sidebar)
			pool.query(
				`SELECT id, parent_node_id as parent_id, node_type, heading, citation_label, node_path, depth
				 FROM legal_nodes
				 WHERE document_id = $1
				 ORDER BY node_path ASC, char_start ASC NULLS LAST
				 LIMIT 500`,
				[documentId]
			),

			// 6. Initial chunks for this node (Official Text tab)
			pool.query(
				`SELECT lc.id, lc.chunk_index, lc.chunk_text, lc.page_start, lc.page_end,
				        lc.token_count, ln.heading as node_heading, ln.citation_label as node_citation
				 FROM legal_chunks lc
				 JOIN legal_nodes ln ON ln.id = lc.legal_node_id
				 WHERE lc.legal_node_id = $1
				 ORDER BY lc.chunk_index ASC
				 LIMIT 30`,
				[nodeId]
			),
		]);

		const siblingIdx = siblingsRes.rows.findIndex((s: any) => s.id === nodeId);
		const prev = siblingIdx > 0 ? siblingsRes.rows[siblingIdx - 1] : null;
		const next = siblingIdx < siblingsRes.rows.length - 1 ? siblingsRes.rows[siblingIdx + 1] : null;

		// Build breadcrumbs by walking parent_node_id chain
		const breadcrumbs: Array<{ id: string; heading: string }> = [];
		let currentParentId = node.parent_node_id;
		const tocMap = new Map(tocRes.rows.map((r: any) => [r.id, r]));
		while (currentParentId && tocMap.has(currentParentId)) {
			const parent = tocMap.get(currentParentId)!;
			breadcrumbs.unshift({ id: parent.id, heading: parent.heading });
			currentParentId = parent.parent_id;
		}

		// Extract citation references from node text
		const citationRefs = extractCitationRefs(node.full_text);

		// Generate implications based on corpus type
		const implications = generateImplications(
			node.corpus_type,
			node.heading,
			node.jurisdiction_name
		);

		// If no children, use sibling nodes as "Key Provisions" (for flat hierarchies)
		const provisions = childrenRes.rows.length > 0
			? childrenRes.rows
			: siblingsRes.rows
				.filter((s: any) => s.id !== nodeId)
				.slice(0, 8)
				.map((s: any) => ({ ...s, full_text: null }));

		return {
			node: {
				id: node.id,
				heading: node.heading,
				citationLabel: node.citation_label,
				fullText: node.full_text,
				textClean: node.text_clean,
				precedentCount: citationRefs.filter(c => c.type === 'case').length,
				type: node.node_type,
				path: node.node_path,
				pageStart: node.page_start,
				pageEnd: node.page_end,
				depth: node.depth,
			},
			document: {
				id: documentId,
				title: node.doc_title,
				corpusType: node.corpus_type,
				effectiveDate: node.effective_date,
				officialUrl: node.official_url,
				pageCount: node.page_count,
				wordCount: node.word_count,
				jurisdiction: node.jurisdiction_code ? {
					code: node.jurisdiction_code,
					name: node.jurisdiction_name
				} : null
			},
			children: provisions,
			definitions: definitionsRes.rows,
			navigation: { prev, next },
			toc: tocRes.rows,
			chunks: chunksRes.rows,
			breadcrumbs,
			citationRefs,
			implications,
		};
	} catch (err) {
		console.error('[node/[nodeId]] load error:', err);
		if (err && typeof err === 'object' && 'status' in err) throw err;
		throw error(500, 'Failed to load legal node dashboard');
	}
};
