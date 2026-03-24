/**
 * ACE Context Assembler — Central Orchestration Module
 *
 * Assembles a complete ACEContext from all data sources in parallel:
 *   1. User profile (analytics + DB)
 *   2. Case context (PostgreSQL)
 *   3. RAG chunks (Qdrant vector search)
 *   4. KAG graph neighbors (Neo4j → PostgreSQL fallback)
 *   5. Chat history (PostgreSQL/Redis)
 *   6. Entity extraction (regex + optional LLM)
 *   7. Practice area template selection
 *
 * Token budget allocation per source is defined in types.ts.
 */
import { sql } from 'drizzle-orm';
import { ENV } from '$lib/server/env.server.js';
import type { ACEContext, ACEPrompt, ACEUserProfile } from './types.js';
import { TOKEN_BUDGET } from './types.js';
import { selectPracticeTemplate } from './practice-templates.js';
import { extractLegalTags } from '$lib/server/rag/tag-extractor.js';
import { getTopQueryPatterns, getWeeklySummary } from '$lib/server/analytics/event-logger.js';
import { applyStyle, type LegalPersona } from './style-adapter.js';
import { webSearch, formatWebResultsAsContext } from '$lib/server/retrieval/web-search.js';
import { searchWikipedia, formatWikipediaAsContext } from '$lib/server/retrieval/wikipedia-search.js';

/**
 * Assemble a complete ACE context from all data sources.
 * All fetches run in parallel with graceful fallbacks.
 */
export async function assembleACEContext(opts: {
  query: string;
  userId?: string;
  caseId?: string;
  conversationId?: string;
  maxTokens?: number;
  persona?: LegalPersona;
  enableWebSearch?: boolean;
  enableWikipedia?: boolean;
  sectionTypes?: string[];
}): Promise<ACEContext> {
  const { query, userId, caseId, conversationId } = opts;

  // Extract entities immediately (regex, no async)
  const legalTags = extractLegalTags(query);
  const entities = {
    statutes: legalTags.statutes,
    cases: legalTags.cases,
    persons: [] as string[],
    organizations: [] as string[],
    dates: [] as string[],
  };

  // Run all data fetches in parallel (includes optional web search)
  const [
    userProfile,
    caseContext,
    glossaryMatches,
    ragChunks,
    kagNeighbors,
    chatHistory,
    webResults,
    wikiResults,
  ] = await Promise.all([
    userId ? fetchUserProfile(userId) : Promise.resolve(null),
    caseId ? fetchCaseContext(caseId) : Promise.resolve(null),
    fetchGlossaryMatches(query),
    fetchRAGChunks(query, opts.sectionTypes),
    caseId ? fetchKAGNeighbors(caseId) : Promise.resolve([]),
    conversationId ? fetchChatHistory(conversationId) : Promise.resolve([]),
    opts.enableWebSearch ? webSearch(query, 3).catch(() => null) : Promise.resolve(null),
    (opts.enableWikipedia ?? true)
      ? searchWikipedia(query, 3).catch(() => null)
      : Promise.resolve(null),
  ]);

  // Fetch evidence metadata and connections separately (avoids hoisting issues)
  const [evidenceMetadata, evidenceConnections] = await Promise.all([
    caseId ? fetchEvidenceMetadataForCase(caseId) : Promise.resolve(null),
    caseId ? fetchEvidenceConnections(caseId) : Promise.resolve(null),
  ]);

  // Determine practice area from case or user profile
  const practiceArea = extractPracticeArea(caseContext, userProfile);
  const practiceTemplate = selectPracticeTemplate(practiceArea);

  // Generate query tags from entities + practice area
  const queryTags: string[] = [
    ...legalTags.statutes.slice(0, 3),
    ...legalTags.cases.slice(0, 3),
    ...(practiceArea ? [practiceArea] : []),
  ];

  return {
    userProfile,
    caseContext,
    glossaryMatches,
    ragChunks,
    kagNeighbors,
    chatHistory,
    entities,
    practiceTemplate,
    queryTags,
    webSearchContext:
      [
        webResults ? formatWebResultsAsContext(webResults) : '',
        wikiResults ? formatWikipediaAsContext(wikiResults) : '',
      ]
        .filter(Boolean)
        .join('\n') || null,
    persona: opts.persona ?? 'neutral',
    evidenceMetadata,
    evidenceConnections,
  };
}

/**
 * Build the final ACE prompt from assembled context.
 */
export function buildACEPrompt(context: ACEContext, query: string): ACEPrompt {
  const lines: string[] = [];
  const confidenceFactors: Record<string, number> = {};

  // 1. System instructions
  lines.push('You are YorHA, a legal AI assistant. Provide accurate, well-cited legal analysis.');

  // 2. Practice template
  if (context.practiceTemplate) {
    lines.push(`\n## Practice Area Guidelines\n${context.practiceTemplate}`);
    confidenceFactors.practiceTemplate = 0.9;
  }

  // 3. User profile personalization
  if (context.userProfile) {
    const p = context.userProfile;
    const profileLines: string[] = [];
    if (p.jurisdiction) profileLines.push(`Jurisdiction: ${p.jurisdiction}`);
    if (p.practiceAreas.length) profileLines.push(`Practice areas: ${p.practiceAreas.join(', ')}`);
    if (p.preferredTone !== 'formal') profileLines.push(`Tone: ${p.preferredTone}`);
    if (p.experienceLevel) profileLines.push(`Experience: ${p.experienceLevel}`);
    if (profileLines.length) {
      lines.push(`\n## User Profile\n${profileLines.join('. ')}.`);
      confidenceFactors.userProfile = 0.7;
    }
  }

  // 4. Case context
  if (context.caseContext) {
    lines.push(
      `\n## Active Case Context\n${truncate(context.caseContext, TOKEN_BUDGET.caseContext * 4)}`
    );
    confidenceFactors.caseContext = 0.95;
  }

  // 5. Glossary definitions relevant to the current query
  if (context.glossaryMatches && context.glossaryMatches.length > 0) {
    const glossaryText = context.glossaryMatches
      .slice(0, 4)
      .map((entry) => {
        const meta = [entry.category, entry.jurisdiction, entry.citation]
          .filter(Boolean)
          .join(' | ');
        const suffix = meta ? ` (${meta})` : '';
        return `- ${entry.term}: ${truncate(entry.definition, 220)}${suffix}`;
      })
      .join('\n');
    lines.push(`\n## Legal Definitions\n${glossaryText}`);
    confidenceFactors.glossary = 0.8;
  }

  // 6. RAG chunks (highest priority retrieval)
  if (context.ragChunks.length > 0) {
    const chunksText = context.ragChunks
      .slice(0, 5)
      .map((c, i) => `[Source ${i + 1} (score: ${c.score.toFixed(2)})] ${truncate(c.content, 300)}`)
      .join('\n');
    lines.push(`\n## Retrieved Context\n${chunksText}`);
    confidenceFactors.ragChunks = Math.max(...context.ragChunks.map((c) => c.score));
  }

  // 7. KAG graph neighbors
  if (context.kagNeighbors.length > 0) {
    const neighborsText = context.kagNeighbors
      .slice(0, 5)
      .map((n) => `- ${n.title} (${n.relationship})`)
      .join('\n');
    lines.push(`\n## Related Entities\n${neighborsText}`);
    confidenceFactors.kagNeighbors = 0.8;
  }

  // 8. Chat history (last N turns)
  if (context.chatHistory.length > 0) {
    const historyText = context.chatHistory
      .slice(-6) // last 3 exchanges
      .map((m) => `${m.role}: ${truncate(m.content, 200)}`)
      .join('\n');
    lines.push(`\n## Conversation History\n${historyText}`);
    confidenceFactors.chatHistory = 0.6;
  }

  // 9. Entity context
  const allEntities = [
    ...context.entities.statutes.map((s) => `Statute: ${s}`),
    ...context.entities.cases.map((c) => `Case: ${c}`),
    ...context.entities.persons.map((p) => `Person: ${p}`),
  ];
  if (allEntities.length > 0) {
    lines.push(`\n## Detected Entities\n${allEntities.slice(0, 10).join(', ')}`);
    confidenceFactors.entities = 0.85;
  }

  // 10. Evidence metadata (types, forensics, entities)
  if (context.evidenceMetadata && context.evidenceMetadata.length > 0) {
    const evidenceLines = context.evidenceMetadata
      .slice(0, 10)
      .map((e) => {
        const type = e.evidenceType?.toUpperCase() || 'UNKNOWN';
        const flags = e.forensicFlags?.length
          ? e.forensicFlags.some((f) => f.severity === 'high')
            ? 'Forensic: HIGH'
            : `Forensic: ${e.forensicFlags.length} flags`
          : 'No forensic flags';
        const entityCount = e.entities?.length || 0;
        const summary = e.summary ? truncate(e.summary, 80) : '';
        return `- [${type}] "${truncate(e.title, 50)}" (${e.fileType || 'unknown'}) | Entities: ${entityCount} | ${flags}${summary ? '\n  ' + summary : ''}`;
      })
      .join('\n');
    lines.push(
      `\n## Evidence on File (${context.evidenceMetadata.length} items)\n${evidenceLines}`
    );
    confidenceFactors.evidenceMetadata = 0.9;
  }

  // 11. Evidence connections/relationships
  if (context.evidenceConnections && context.evidenceConnections.length > 0) {
    const connLines = context.evidenceConnections
      .slice(0, 15)
      .map((c) => {
        const strengthLabel =
          c.strength >= 0.8 ? 'STRONG' : c.strength >= 0.5 ? 'MODERATE' : 'WEAK';
        const desc = c.label || c.connectionType;
        const notes = c.notes ? ` — ${truncate(c.notes, 80)}` : '';
        return `- "${truncate(c.fromTitle, 40)}" → "${truncate(c.toTitle, 40)}" [${desc.toUpperCase()}] (${strengthLabel})${notes}`;
      })
      .join('\n');
    lines.push(
      `\n## Evidence Relationships (${context.evidenceConnections.length} connections)\n${connLines}`
    );
    confidenceFactors.evidenceConnections = 0.85;
  }

  // 12. Web search results (if available)
  if (context.webSearchContext) {
    lines.push(`\n${context.webSearchContext}`);
    confidenceFactors.webSearch = 0.6;
  }

  // 10. Self-prompting instructions
  const selfPrompt =
    'After answering, briefly assess: Did you cite specific statutes/precedents? ' +
    'Is the answer jurisdiction-appropriate? Flag any uncertainty.';

  // Apply persona style to the assembled prompt
  const persona = (context as ACEContext & { persona?: LegalPersona }).persona ?? 'neutral';
  const rawPrompt = lines.join('\n');
  const styledPrompt = persona !== 'neutral' ? applyStyle(rawPrompt, persona) : rawPrompt;

  return {
    systemPrompt: styledPrompt,
    contextWindow: lines.slice(1).join('\n'), // everything after system instruction
    maxTokenBudget: TOKEN_BUDGET.total,
    confidenceFactors,
    selfPromptInstructions: selfPrompt,
    preferredBackend: 'auto',
  };
}

// ── Data Fetchers (all graceful) ────────────────────────────────────────

async function fetchUserProfile(userId: string): Promise<ACEUserProfile | null> {
  try {
    const [patterns, summary] = await Promise.all([
      getTopQueryPatterns(userId, 5),
      getWeeklySummary(userId),
    ]);

    return {
      userId,
      topIntents: summary.topIntents,
      preferredTone: 'formal',
      avgLatencyMs: summary.avgLatencyMs,
      cacheHitRate: summary.cacheHitRate,
      recentQueries: patterns.map((p) => ({
        hash: p.query_hash,
        preview: '', // privacy: hash only
      })),
      practiceAreas: [],
      jurisdiction: null,
      experienceLevel: null,
    };
  } catch {
    return null;
  }
}

async function fetchCaseContext(caseId: string): Promise<string | null> {
  try {
    const db = (await import('$lib/server/db')).default;
    const rows = await db.execute(
      sql`SELECT title, description, jurisdiction, court, status, practice_area
				FROM cases WHERE id = ${caseId} LIMIT 1`
    );
    const c = [...rows][0] as Record<string, unknown> | undefined;
    if (!c) return null;

    const parts: string[] = [];
    if (c.title) parts.push(`Title: ${c.title}`);
    if (c.jurisdiction) parts.push(`Jurisdiction: ${c.jurisdiction}`);
    if (c.court) parts.push(`Court: ${c.court}`);
    if (c.status) parts.push(`Status: ${c.status}`);
    if (c.description) parts.push(`Description: ${String(c.description).slice(0, 500)}`);

    const glossaryRows = await db.execute(
      sql`SELECT citation_text, notes
				FROM case_library_links
				WHERE case_id = ${caseId} AND category = 'glossary_concept'
				ORDER BY created_at DESC
				LIMIT 5`
    );
    const glossaryLines = [...glossaryRows]
      .map((row: any) => {
        const term = String(row.citation_text ?? '').trim();
        const definition = String(row.notes ?? '').trim();
        if (!term) return null;
        return definition ? `- ${term}: ${definition.slice(0, 160)}` : `- ${term}`;
      })
      .filter((line): line is string => Boolean(line));
    if (glossaryLines.length > 0) {
      parts.push(`Saved concepts:\n${glossaryLines.join('\n')}`);
    }
    return parts.join('\n');
  } catch {
    return null;
  }
}

export async function fetchGlossaryMatches(query: string): Promise<ACEContext['glossaryMatches']> {
  const normalizedQuery = query.trim();
  if (normalizedQuery.length < 2) return null;

  const candidateTerms = extractGlossaryCandidateTerms(normalizedQuery);

  try {
    const { pool } = await import('$lib/server/db/client');
    const seen = new Set<string>();
    const matches: NonNullable<ACEContext['glossaryMatches']> = [];

    try {
      const glossaryRes = await pool.query(
        `SELECT
					lg.id,
					lg.term,
					lg.definition,
					lg.category,
					lg.jurisdiction,
					NULL::text AS citation,
					CASE
						WHEN lower(lg.term) = ANY($2::text[]) THEN 1.0
						ELSE ts_rank(
							to_tsvector('english', coalesce(lg.term, '') || ' ' || coalesce(lg.definition, '')),
							websearch_to_tsquery('english', $1)
						)
					END AS confidence
				 FROM legal_glossary lg
				 WHERE (
					to_tsvector('english', coalesce(lg.term, '') || ' ' || coalesce(lg.definition, '')) @@ websearch_to_tsquery('english', $1)
					OR lower(lg.term) = ANY($2::text[])
					OR lg.term ILIKE ANY($3::text[])
				 )
				 ORDER BY confidence DESC, lg.term ASC
				 LIMIT 4`,
        [normalizedQuery, candidateTerms.exact, candidateTerms.prefix]
      );

      for (const row of glossaryRes.rows as Record<string, unknown>[]) {
        const dedupeKey = `glossary:${String(row.term ?? '').toLowerCase()}`;
        if (seen.has(dedupeKey)) continue;
        seen.add(dedupeKey);
        matches.push({
          id: row.id ? String(row.id) : null,
          term: String(row.term ?? ''),
          definition: String(row.definition ?? ''),
          source: 'legal_glossary',
          category: row.category ? String(row.category) : null,
          jurisdiction: row.jurisdiction ? String(row.jurisdiction) : null,
          citation: null,
          confidence: row.confidence == null ? null : Number(row.confidence),
          sourceNodeId: null,
        });
      }
    } catch {
      // legal_glossary not available or query failed — continue to definitions fallback
    }

    if (matches.length < 4) {
      try {
        const definitionRes = await pool.query(
          `SELECT
						ld.id,
						ld.term,
						ld.defined_in_node_id,
						ld.definition_text AS definition,
						NULL::text AS category,
						NULL::text AS jurisdiction,
						ln.citation_label AS citation,
						CASE
							WHEN lower(ld.term) = ANY($2::text[]) THEN 1.0
							ELSE ts_rank(
								to_tsvector('english', coalesce(ld.term, '') || ' ' || coalesce(ld.definition_text, '')),
								websearch_to_tsquery('english', $1)
							)
						END AS confidence
					 FROM legal_definitions ld
					 LEFT JOIN legal_nodes ln ON ln.id = ld.defined_in_node_id
					 WHERE (
						to_tsvector('english', coalesce(ld.term, '') || ' ' || coalesce(ld.definition_text, '')) @@ websearch_to_tsquery('english', $1)
						OR lower(ld.term) = ANY($2::text[])
						OR ld.term ILIKE ANY($3::text[])
					 )
					 ORDER BY confidence DESC, ld.term ASC
					 LIMIT 4`,
          [normalizedQuery, candidateTerms.exact, candidateTerms.prefix]
        );

        for (const row of definitionRes.rows as Record<string, unknown>[]) {
          const dedupeKey = `definition:${String(row.term ?? '').toLowerCase()}`;
          if (seen.has(dedupeKey)) continue;
          seen.add(dedupeKey);
          matches.push({
            id: row.id ? String(row.id) : null,
            term: String(row.term ?? ''),
            definition: String(row.definition ?? ''),
            source: 'legal_definitions',
            category: null,
            jurisdiction: null,
            citation: row.citation ? String(row.citation) : null,
            confidence: row.confidence == null ? null : Number(row.confidence),
            sourceNodeId: row.defined_in_node_id ? String(row.defined_in_node_id) : null,
          });
          if (matches.length >= 4) break;
        }
      } catch {
        // legal_definitions unavailable or query failed
      }
    }

    return matches.length > 0 ? matches.slice(0, 4) : null;
  } catch {
    return null;
  }
}

async function fetchRAGChunks(
  query: string,
  sectionTypes?: string[]
): Promise<Array<{ content: string; score: number; source: string }>> {
  try {
    const ollamaUrl = ENV.OLLAMA_BASE_URL;
    // Generate embedding for the query
    const embedRes = await fetch(`${ollamaUrl}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'embeddinggemma:latest', prompt: query }),
      signal: AbortSignal.timeout(5000),
    });
    if (!embedRes.ok) return [];

    const embedData = await embedRes.json();
    const embedding = embedData.embedding as number[];
    if (!embedding?.length) return [];

    // Use qdrant singleton (reuses connection + gets payload indexes)
    const { qdrant: qdrantMgr } = await import('$lib/server/vector/qdrant-manager.js');

    // When sectionTypes provided, use section-filtered evidence search
    const evidenceSearch = sectionTypes?.length
      ? qdrantMgr
          .sectionFilteredSearch({
            query,
            queryEmbedding: embedding,
            sectionTypes,
            limit: 5,
            scoreThreshold: 0.5,
          })
          .then((r) => r.results)
          .catch(() => [])
      : qdrantMgr.client
          .search('evidence_items', {
            vector: { name: 'content', vector: embedding },
            limit: 5,
            score_threshold: 0.5,
            with_payload: true,
          })
          .catch(() => []);

    const [evidenceResults, docResults] = await Promise.all([
      evidenceSearch,
      qdrantMgr.client
        .search('legal_documents', {
          vector: { name: 'content', vector: embedding },
          limit: 3,
          score_threshold: 0.5,
          with_payload: true,
        })
        .catch(() => []),
    ]);

    const mapped = [
      ...evidenceResults.map((r: any) => ({
        content: String(r.payload?.content ?? r.payload?.content_preview ?? ''),
        score: r.score,
        source: String(r.payload?.source ?? 'evidence'),
      })),
      ...docResults.map((r: any) => ({
        content: String(r.payload?.content_preview ?? r.payload?.full_text ?? ''),
        score: r.score,
        source: String(r.payload?.source_url ?? r.payload?.document_type ?? 'document'),
      })),
    ];

    // Sort by score descending, keep top 5
    return mapped.sort((a, b) => b.score - a.score).slice(0, 5);
  } catch {
    return [];
  }
}

async function fetchKAGNeighbors(
  caseId: string
): Promise<Array<{ nodeId: string; title: string; relationship: string; score?: number }>> {
  // Try Neo4j first, fallback to PostgreSQL
  try {
    const { getNeo4jDriver } = await import('$lib/server/neo4j-driver.js');
    const driver = getNeo4jDriver();
    const session = driver.session({ database: 'neo4j' });
    try {
      const result = await session.run(
        `MATCH (c:Case {id: $caseId})-[r]-(n)
				 RETURN n.id AS nodeId, n.title AS title, type(r) AS relationship
				 LIMIT 10`,
        { caseId }
      );
      return result.records.map((rec) => ({
        nodeId: String(rec.get('nodeId') ?? ''),
        title: String(rec.get('title') ?? ''),
        relationship: String(rec.get('relationship') ?? ''),
      }));
    } finally {
      await session.close();
    }
  } catch (neo4jErr: any) {
    // Neo4j unavailable (connection refused or bolt error) — falling back to PostgreSQL graph tables.
    // To enable graph traversal, ensure NEO4J_URI / NEO4J_USER / NEO4J_PASSWORD are set and Neo4j is running.
    if (neo4jErr?.code !== 'ServiceUnavailable' || process.env.NODE_ENV !== 'production') {
      console.warn('[KAG] Neo4j unavailable, using PostgreSQL fallback:', neo4jErr?.message ?? neo4jErr);
    }
    try {
      const db = (await import('$lib/server/db')).default;
      const rows = await db.execute(
        sql`SELECT target_id AS node_id, label AS title, relationship_type AS relationship
					FROM yorha_evidence_connections
					WHERE source_id = ${caseId}
					LIMIT 10`
      );
      return [...rows].map((r: any) => ({
        nodeId: String(r.node_id ?? ''),
        title: String(r.title ?? ''),
        relationship: String(r.relationship ?? ''),
      }));
    } catch {
      return [];
    }
  }
}

async function fetchChatHistory(
  conversationId: string
): Promise<Array<{ role: 'user' | 'assistant' | 'system'; content: string }>> {
  try {
    const db = (await import('$lib/server/db')).default;
    const rows = await db.execute(
      sql`SELECT role, content FROM chat_messages
				WHERE chat_id = ${conversationId}
				ORDER BY created_at DESC
				LIMIT 10`
    );
    return [...rows].reverse().map((r: any) => ({
      role: r.role as 'user' | 'assistant' | 'system',
      content: String(r.content ?? ''),
    }));
  } catch {
    return [];
  }
}

async function fetchEvidenceMetadataForCase(
  caseId: string
): Promise<ACEContext['evidenceMetadata']> {
  try {
    const db = (await import('$lib/server/db')).default;
    const rows = await db.execute(
      sql`SELECT id, title, evidence_type, file_type, metadata
				FROM evidence WHERE case_id = ${caseId}
				ORDER BY created_at DESC LIMIT 10`
    );
    return [...rows].map((r: any) => {
      const meta = (typeof r.metadata === 'string' ? JSON.parse(r.metadata) : r.metadata) || {};
      return {
        id: String(r.id ?? ''),
        title: String(r.title ?? ''),
        evidenceType: String(r.evidence_type ?? 'document'),
        fileType: String(r.file_type ?? ''),
        forensicFlags: Array.isArray(meta.forensicFlags) ? meta.forensicFlags : [],
        entities: Array.isArray(meta.entities) ? meta.entities.slice(0, 20) : [],
        summary: meta.summary ? String(meta.summary).slice(0, 200) : undefined,
      };
    });
  } catch {
    return null;
  }
}

async function fetchEvidenceConnections(
  caseId: string
): Promise<ACEContext['evidenceConnections']> {
  try {
    const db = (await import('$lib/server/db')).default;
    const rows = await db.execute(
      sql`SELECT
				ebc.connection_type, ebc.label, ebc.notes, ebc.strength,
				ef.title AS from_title, et.title AS to_title
			FROM evidence_board_connections ebc
			JOIN evidence ef ON ef.id = ebc.from_evidence_id
			JOIN evidence et ON et.id = ebc.to_evidence_id
			WHERE ebc.case_id = ${caseId} AND ebc.is_visible = true
			ORDER BY ebc.strength DESC
			LIMIT 20`
    );
    return [...rows].map((r: any) => ({
      fromTitle: String(r.from_title ?? 'Unknown'),
      toTitle: String(r.to_title ?? 'Unknown'),
      connectionType: String(r.connection_type ?? 'related'),
      label: r.label ? String(r.label) : null,
      notes: r.notes ? String(r.notes) : null,
      strength: Number(r.strength ?? 1.0),
    }));
  } catch {
    return null;
  }
}

// ── Helpers ─────────────────────────────────────────────────────────────

function truncate(text: string, maxChars: number): string {
  return text.length > maxChars ? text.slice(0, maxChars) + '...' : text;
}

function extractGlossaryCandidateTerms(query: string): { exact: string[]; prefix: string[] } {
  const stopWords = new Set([
    'the',
    'this',
    'that',
    'with',
    'from',
    'into',
    'while',
    'about',
    'would',
    'could',
    'should',
    'where',
    'which',
    'what',
    'when',
    'your',
    'have',
    'has',
    'been',
    'were',
    'they',
    'them',
    'their',
    'there',
    'here',
    'than',
    'then',
    'also',
    'just',
    'need',
    'want',
    'case',
    'cases',
    'user',
    'report',
    'reports',
    'attached',
    'saved',
    'citation',
    'citations',
    'legal',
  ]);

  const quotedTerms = Array.from(query.matchAll(/"([^"]{3,60})"/g)).map((match) => match[1]);
  const wordTerms = query
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length >= 4 && !stopWords.has(word));

  const exact = Array.from(
    new Set([...quotedTerms.map((term) => term.toLowerCase()), ...wordTerms])
  ).slice(0, 8);
  const prefix = exact.map((term) => `${term}%`);

  return { exact, prefix };
}

function extractPracticeArea(
	caseContext: string | null,
	userProfile: ACEUserProfile | null
): string | null {
	// Try case context first (look for practice_area field)
	if (caseContext) {
		const match = caseContext.match(/practice_area[:\s]+(\w[\w-]*)/i);
		if (match) return match[1].toLowerCase();
	}
	// Fall back to user profile
	if (userProfile?.practiceAreas.length) {
		return userProfile.practiceAreas[0];
	}
	return null;
}
