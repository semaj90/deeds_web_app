/**
 * GET/POST/DELETE /api/cases/[id]/authorities
 * Manage linked legal authorities (corpus documents/nodes) for a case.
 * Uses the case_library_links junction table.
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { pool } from '$lib/server/db/client';
import { syncCaseToGraph } from '$lib/server/graph/pg-neo4j-sync.js';
import { z } from 'zod';

const authorityPostSchema = z.object({
  documentId: z.string().uuid().optional(),
  nodeId: z.string().uuid().optional(),
  category: z.string().max(100).optional(),
  citationText: z.string().max(2000).optional(),
  notes: z.string().max(5000).optional(),
  relevanceScore: z.number().min(0).max(1).optional(),
  term: z.string().max(500).optional(),
  definition: z.string().max(5000).optional(),
  jurisdiction: z.string().max(500).optional(),
  source: z.string().max(500).optional(),
  confidence: z.number().min(0).max(1).optional(),
});

const authorityDeleteSchema = z.object({
  linkId: z.string().uuid(),
});

/** GET — list all linked legal authorities for a case */
export const GET: RequestHandler = async ({ params, locals }) => {
	if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });

	const id = params.id;
  const caseCheck = await pool.query(
    'SELECT id FROM cases WHERE id = $1 AND user_id = $2 LIMIT 1',
    [id, locals.user.id]
  );

  if (caseCheck.rowCount === 0) return json({ error: 'Case not found' }, { status: 404 });

	const res = await pool.query(`
		SELECT cll.id AS link_id, cll.category, cll.relevance_score,
		       cll.citation_text, cll.notes, cll.created_at,
		       cll.document_id, ld.title AS document_title, ld.corpus_type,
		       cll.node_id, ln.heading AS node_heading, ln.citation_label AS node_citation
		FROM case_library_links cll
		LEFT JOIN library_documents ld ON ld.id = cll.document_id
		LEFT JOIN legal_nodes ln ON ln.id = cll.node_id
		WHERE cll.case_id = $1
		ORDER BY cll.created_at DESC
	`, [id]);

	const authorities = res.rows.map((r: Record<string, unknown>) => ({
    linkId: r.link_id,
    category: r.category,
    relevanceScore: r.relevance_score,
    citationText: r.citation_text,
    notes: r.notes,
    glossaryTerm: r.category === 'glossary_concept' ? r.citation_text : null,
    glossaryDefinition: r.category === 'glossary_concept' ? r.notes : null,
    documentId: r.document_id,
    documentTitle: r.document_title,
    corpusType: r.corpus_type,
    nodeId: r.node_id,
    nodeHeading: r.node_heading,
    nodeCitation: r.node_citation,
    createdAt: r.created_at,
  }));

	return json({ authorities, total: res.rowCount });
};

/** POST — link a legal authority to a case */
export const POST: RequestHandler = async ({ params, request, locals }) => {
	if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });

	const id = params.id;
  const caseCheck = await pool.query(
    'SELECT id FROM cases WHERE id = $1 AND user_id = $2 LIMIT 1',
    [id, locals.user.id]
  );

  if (caseCheck.rowCount === 0) return json({ error: 'Case not found' }, { status: 404 });

	const raw = await request.json().catch(() => ({}));
  const parsed = authorityPostSchema.safeParse(raw);
  if (!parsed.success)
    return json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 });

	const {
    documentId,
    nodeId,
    category,
    citationText,
    notes,
    relevanceScore,
    term,
    definition,
    jurisdiction,
    source,
    confidence,
  } = parsed.data;

	const resolvedCategory = category || 'cited_authority';
  const isGlossaryConcept = resolvedCategory === 'glossary_concept';

  if (!documentId && !nodeId && !isGlossaryConcept) {
    return json(
      { error: 'documentId or nodeId required unless category is glossary_concept' },
      { status: 400 }
    );
  }

  if (isGlossaryConcept && !term && !citationText) {
    return json({ error: 'term required for glossary_concept' }, { status: 400 });
  }

  const resolvedCitationText = isGlossaryConcept
    ? term || citationText || null
    : citationText || null;
  const resolvedNotes = isGlossaryConcept
    ? [
        definition,
        jurisdiction ? `Jurisdiction: ${jurisdiction}` : null,
        source ? `Source: ${source}` : null,
        typeof confidence === 'number' ? `Confidence: ${confidence.toFixed(2)}` : null,
      ]
        .filter(Boolean)
        .join('\n') || null
    : notes || null;
  const resolvedRelevanceScore =
    typeof relevanceScore === 'number'
      ? relevanceScore
      : typeof confidence === 'number'
        ? confidence
        : null;

  const res = await pool.query(
    `
		INSERT INTO case_library_links (case_id, document_id, node_id, category, citation_text, notes, relevance_score, added_by)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
		RETURNING id
	`,
    [
      id,
      documentId || null,
      nodeId || null,
      resolvedCategory,
      resolvedCitationText,
      resolvedNotes,
      resolvedRelevanceScore,
      locals.user.id,
    ]
  );

  if (resolvedCategory === 'glossary_concept') {
    syncCaseToGraph(id).catch((err) => {
      console.warn(
        '[cases/authorities] Case graph sync after glossary save failed:',
        err instanceof Error ? err.message : err
      );
    });
  }

	return json({ id: res.rows[0].id, success: true }, { status: 201 });
};

/** DELETE — remove a case-authority link */
export const DELETE: RequestHandler = async ({ params, request, locals }) => {
	if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });

	const id = params.id;
  const caseCheck = await pool.query(
    'SELECT id FROM cases WHERE id = $1 AND user_id = $2 LIMIT 1',
    [id, locals.user.id]
  );

  if (caseCheck.rowCount === 0) return json({ error: 'Case not found' }, { status: 404 });

	const raw = await request.json().catch(() => ({}));
  const parsed = authorityDeleteSchema.safeParse(raw);
  if (!parsed.success)
    return json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 });
  const { linkId } = parsed.data;

	await pool.query(
		'DELETE FROM case_library_links WHERE id = $1 AND case_id = $2',
		[linkId, id]
	);

	return json({ success: true });
};