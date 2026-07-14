// @ts-nocheck
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { ENV } from '$lib/server/env.server.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Prosecutor-workflow MCP tools — 15 skills across 5 families.
 *
 * Family: Transcript / Audio
 *   legal.get_transcript      — fetch existing Whisper transcript for an evidence item
 *   legal.search_recordings   — timestamp-aware audio segment search
 *
 * Family: Case Research
 *   legal.find_precedents     — semantic + FTS search across legal precedents
 *   legal.find_similar_opinions — Qdrant ANN search on legal opinions/judgments
 *   legal.similar_cases       — FTS similarity across case titles+descriptions
 *   legal.issue_spotter       — Gemma4 legal issue identification for a case
 *
 * Family: Evidence
 *   legal.batch_ingest        — publish document URLs to document.embed queue
 *   legal.cross_reference_evidence — Qdrant ANN cross-reference across cases
 *   legal.build_timeline      — Gemma4 NER timeline extraction from evidence
 *
 * Family: Interrogation & Simulation
 *   legal.cross_examine       — generate cross-examination questions via Gemma4
 *   legal.mock_trial          — multi-role Gemma4 mock trial simulation
 *   legal.score_case          — evidence-weighted case strength score
 *
 * Family: Output / Persistence
 *   legal.transcribe_video    — queue video URL for yt-dlp + Whisper via RabbitMQ
 *   legal.write_obsidian_note — write/append a markdown note to the Obsidian vault
 *
 * Family: Operations
 *   legal.check_services      — probe all 9 backing services and report health
 */
export function registerLegalSkillsTools(server: McpServer) {

  // ── legal.get_transcript ──────────────────────────────────────────────────
  server.registerTool(
    'legal.get_transcript',
    {
      description:
        'Retrieve the Whisper transcript for an audio/video evidence item that has already been processed. Returns the full text plus any extracted speaker segments. Use legal.search_recordings for timestamped search.',
      inputSchema: {
        evidenceId: z.string().uuid().describe('UUID of the evidence item'),
        includeSegments: z.boolean().default(false).optional().describe('Include per-segment timestamps'),
      },
    },
    async ({ evidenceId, includeSegments }) => {
      const { Pool } = await import('pg');
      const pool = new Pool({ connectionString: ENV.DATABASE_URL, max: 2 });
      try {
        const transcriptRow = await pool.query(
          `SELECT id, evidence_id, full_text, language, duration_seconds, speaker_count,
                  status, created_at
           FROM audio_transcripts WHERE evidence_id = $1 LIMIT 1`,
          [evidenceId],
        );
        if (!transcriptRow.rows.length) {
          return { content: [{ type: 'text', text: JSON.stringify({ found: false, evidenceId }) }] };
        }
        const transcript = transcriptRow.rows[0];
        const result: Record<string, unknown> = {
          found: true,
          evidenceId,
          transcriptId: transcript.id,
          language: transcript.language,
          durationSeconds: transcript.duration_seconds,
          speakerCount: transcript.speaker_count,
          status: transcript.status,
          fullText: transcript.full_text,
          createdAt: transcript.created_at,
        };
        if (includeSegments) {
          const segRows = await pool.query(
            `SELECT start_time, end_time, text, speaker_label, confidence
             FROM whisper_segments WHERE transcript_id = $1 ORDER BY start_time`,
            [transcript.id],
          );
          result.segments = segRows.rows;
        }
        return { content: [{ type: 'text', text: JSON.stringify(result) }] };
      } finally {
        await pool.end();
      }
    },
  );

  // ── legal.find_precedents ─────────────────────────────────────────────────
  server.registerTool(
    'legal.find_precedents',
    {
      description:
        'Semantic + full-text search across legal precedents, case opinions, and rulings. Returns ranked results with citation, court, and summary. Use for "find cases about X" or "what precedents apply to Y".',
      inputSchema: {
        query: z.string().min(1).max(500).describe('Legal search query'),
        court: z.string().max(200).optional().describe('Filter by court name'),
        caseId: z.string().uuid().optional().describe('Limit to precedents related to this case'),
        limit: z.number().int().min(1).max(50).default(10).optional(),
      },
    },
    async ({ query, court, caseId, limit = 10 }) => {
      const { Pool } = await import('pg');
      const pool = new Pool({ connectionString: ENV.DATABASE_URL, max: 2 });
      try {
        const params: unknown[] = [`%${query.replace(/[%_]/g, '\\$&')}%`, limit];
        const courtClause = court ? `AND LOWER(court) LIKE LOWER($${params.push(`%${court}%`)})` : '';
        const caseClause = caseId ? `AND case_id = $${params.push(caseId)}` : '';

        const rows = await pool.query(
          `SELECT id, title, summary, citation, court, case_id, decision_date,
                  ts_rank(to_tsvector('english', COALESCE(title,'') || ' ' || COALESCE(summary,'')),
                          plainto_tsquery('english', $1)) AS rank
           FROM legal_precedents
           WHERE (
             to_tsvector('english', COALESCE(title,'') || ' ' || COALESCE(summary,'')) @@ plainto_tsquery('english', $1)
             OR LOWER(title) LIKE $1 OR LOWER(summary) LIKE $1
           ) ${courtClause} ${caseClause}
           ORDER BY rank DESC NULLS LAST
           LIMIT $2`,
          params,
        );
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({ query, results: rows.rows, count: rows.rowCount }),
          }],
        };
      } finally {
        await pool.end();
      }
    },
  );

  // ── legal.search_recordings ───────────────────────────────────────────────
  server.registerTool(
    'legal.search_recordings',
    {
      description:
        'Timestamp-aware semantic search across Whisper audio segments. Returns matching segments with start/end times so prosecutors can jump to the exact moment in a recording. Great for "find when the witness said X".',
      inputSchema: {
        query: z.string().min(1).max(500).describe('What to search for in audio recordings'),
        caseId: z.string().uuid().optional().describe('Limit to a specific case'),
        evidenceId: z.string().uuid().optional().describe('Limit to a specific evidence item'),
        limit: z.number().int().min(1).max(50).default(10).optional(),
      },
    },
    async ({ query, caseId, evidenceId, limit = 10 }) => {
      const { Pool } = await import('pg');
      const pool = new Pool({ connectionString: ENV.DATABASE_URL, max: 2 });
      try {
        const params: unknown[] = [`%${query.replace(/[%_]/g, '\\$&')}%`, limit];
        const caseClause = caseId ? `AND e.case_id = $${params.push(caseId)}` : '';
        const evidClause = evidenceId ? `AND ws.evidence_id = $${params.push(evidenceId)}` : '';

        const rows = await pool.query(
          `SELECT ws.id, ws.evidence_id, ws.start_time, ws.end_time, ws.text,
                  ws.speaker_label, ws.confidence, e.title AS evidence_title, e.case_id
           FROM whisper_segments ws
           JOIN evidence e ON e.id = ws.evidence_id
           WHERE LOWER(ws.text) LIKE LOWER($1) ${caseClause} ${evidClause}
           ORDER BY ws.confidence DESC NULLS LAST, ws.start_time
           LIMIT $2`,
          params,
        );
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({ query, segments: rows.rows, count: rows.rowCount }),
          }],
        };
      } finally {
        await pool.end();
      }
    },
  );

  // ── legal.cross_examine ───────────────────────────────────────────────────
  server.registerTool(
    'legal.cross_examine',
    {
      description:
        'Generate strategic cross-examination questions for a witness using Gemma4. Analyzes the witness statement and case context to surface inconsistencies and credibility challenges. Returns 5-10 questions with purpose and expected answers.',
      inputSchema: {
        witnessName: z.string().max(200).default('Unknown Witness').optional(),
        witnessStatement: z.string().max(20000).default('').optional().describe('Prior witness testimony or statement'),
        caseContext: z.string().max(10000).default('').optional().describe('Brief summary of the case facts'),
      },
    },
    async ({ witnessName = 'Unknown Witness', witnessStatement = '', caseContext = '' }) => {
      const ollamaUrl = ENV.OLLAMA_BASE_URL ?? 'http://localhost:11434';
      const prompt = `You are an experienced trial attorney preparing cross-examination questions.
Witness: ${witnessName}
Statement: ${witnessStatement.slice(0, 8000)}
Case context: ${caseContext.slice(0, 4000)}

Generate 5-8 strategic cross-examination questions. For each question include:
- The question text
- Why this question matters (purpose)
- Expected or desired answer
- A follow-up if the witness is evasive

Respond as JSON: { "witness": "${witnessName}", "questions": [...], "strategy": "..." }`;

      const res = await fetch(`${ollamaUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'gemma4-rotorquant:latest', prompt, stream: false, format: 'json' }),
        signal: AbortSignal.timeout(18_000),
      });
      if (!res.ok) return { content: [{ type: 'text', text: JSON.stringify({ error: `Ollama ${res.status}` }) }] };
      const data = await res.json() as { response?: string };
      try {
        const parsed = JSON.parse(data.response ?? '{}');
        return { content: [{ type: 'text', text: JSON.stringify(parsed) }] };
      } catch {
        return { content: [{ type: 'text', text: data.response ?? '{}' }] };
      }
    },
  );

  // ── legal.score_case ──────────────────────────────────────────────────────
  server.registerTool(
    'legal.score_case',
    {
      description:
        'Compute an evidence-weighted case strength score (0-100) for a given case. Factors: evidence count (×10, max 40), witness count (×8, max 24), documentation quality (15), and active-status bonus (10). Use to prioritize which cases need more evidence.',
      inputSchema: {
        caseId: z.string().uuid().describe('UUID of the case to score'),
      },
    },
    async ({ caseId }) => {
      const { Pool } = await import('pg');
      const pool = new Pool({ connectionString: ENV.DATABASE_URL, max: 2 });
      try {
        const [caseRow, evRow, poiRow] = await Promise.all([
          pool.query('SELECT id, title, description, status FROM cases WHERE id = $1 LIMIT 1', [caseId]),
          pool.query('SELECT COUNT(*) AS cnt FROM evidence WHERE case_id = $1', [caseId]),
          pool.query("SELECT COUNT(*) AS cnt FROM persons_of_interest WHERE $1 = ANY(case_ids)", [caseId]),
        ]);
        if (!caseRow.rows.length) {
          return { content: [{ type: 'text', text: JSON.stringify({ error: 'Case not found', caseId }) }] };
        }
        const c = caseRow.rows[0];
        const evCount = Number(evRow.rows[0]?.cnt ?? 0);
        const persons = Number(poiRow.rows[0]?.cnt ?? 0);
        const evidenceScore = Math.min(evCount * 10, 40);
        const witnessScore = Math.min(persons * 8, 24);
        const docScore = c.description ? 15 : 5;
        const statusBonus = ['open', 'in_progress'].includes(c.status) ? 10 : 0;
        const total = Math.min(evidenceScore + witnessScore + docScore + statusBonus, 100);
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              caseId, caseTitle: c.title, score: total,
              breakdown: { evidence: evidenceScore, witnesses: witnessScore, documentation: docScore, statusBonus },
              evidenceCount: evCount, witnessCount: persons,
            }),
          }],
        };
      } finally {
        await pool.end();
      }
    },
  );

  // ── legal.similar_cases ───────────────────────────────────────────────────
  server.registerTool(
    'legal.similar_cases',
    {
      description:
        'Find cases similar to a given case using PostgreSQL full-text similarity on case title and description. Returns up to 20 similar cases with a similarity score. Use to cross-reference prior cases and find related judgements.',
      inputSchema: {
        caseId: z.string().uuid().describe('UUID of the reference case'),
        limit: z.number().int().min(1).max(20).default(5).optional(),
      },
    },
    async ({ caseId, limit = 5 }) => {
      const { Pool } = await import('pg');
      const pool = new Pool({ connectionString: ENV.DATABASE_URL, max: 2 });
      try {
        const refRow = await pool.query(
          'SELECT title, description FROM cases WHERE id = $1 LIMIT 1',
          [caseId],
        );
        if (!refRow.rows.length) {
          return { content: [{ type: 'text', text: JSON.stringify({ error: 'Case not found', caseId }) }] };
        }
        const { title, description } = refRow.rows[0];
        const queryText = `${title ?? ''} ${description ?? ''}`.trim();
        if (!queryText) {
          return { content: [{ type: 'text', text: JSON.stringify({ results: [], reason: 'no text to match' }) }] };
        }
        const rows = await pool.query(
          `SELECT id, title, description, status, created_at,
                  ts_rank(to_tsvector('english', COALESCE(title,'') || ' ' || COALESCE(description,'')),
                          plainto_tsquery('english', $1)) AS similarity
           FROM cases
           WHERE id <> $2
             AND to_tsvector('english', COALESCE(title,'') || ' ' || COALESCE(description,'')) @@ plainto_tsquery('english', $1)
           ORDER BY similarity DESC NULLS LAST
           LIMIT $3`,
          [queryText.slice(0, 500), caseId, limit],
        );
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({ referenceCaseId: caseId, results: rows.rows, count: rows.rowCount }),
          }],
        };
      } finally {
        await pool.end();
      }
    },
  );

  // ── legal.batch_ingest ────────────────────────────────────────────────────
  server.registerTool(
    'legal.batch_ingest',
    {
      description:
        'Publish one or more document URLs to the document.embed RabbitMQ queue for background embedding and indexing. Use to bulk-ingest case documents, transcripts, or external evidence without blocking the agent loop.',
      inputSchema: {
        documentUrls: z.array(z.string().url()).min(1).max(50).describe('List of document URLs to ingest'),
        caseId: z.string().uuid().optional().describe('Associate all documents with this case'),
        priority: z.enum(['low', 'normal', 'high']).default('normal').optional(),
      },
    },
    async ({ documentUrls, caseId, priority = 'normal' }) => {
      try {
        const amqpUrl = ENV.RABBITMQ_URL ?? 'amqp://guest:guest@localhost:5672';
        const amqplib = await import('amqplib');
        const conn = await (amqplib as any).connect(amqpUrl);
        const ch = await conn.createChannel();
        await ch.assertQueue('document.embed', { durable: true });

        const published: string[] = [];
        const failed: string[] = [];
        for (const url of documentUrls) {
          try {
            const msg = JSON.stringify({
              url,
              caseId: caseId ?? null,
              priority,
              enqueuedAt: new Date().toISOString(),
              source: 'mcp_legal_batch_ingest',
            });
            ch.sendToQueue('document.embed', Buffer.from(msg), {
              persistent: true,
              headers: { priority, source: 'mcp' },
            });
            published.push(url);
          } catch {
            failed.push(url);
          }
        }
        await ch.close();
        await conn.close();
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({ published: published.length, failed: failed.length, failedUrls: failed }),
          }],
        };
      } catch (err) {
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({ error: err instanceof Error ? err.message : String(err), published: 0 }),
          }],
        };
      }
    },
  );

  // ── legal.build_timeline ──────────────────────────────────────────────────
  server.registerTool(
    'legal.build_timeline',
    {
      description:
        'Extract a chronological timeline of events from all evidence associated with a case using Gemma4 NER. Returns TimelineEvent[] with time, who[], what, location, evidenceId, and confidence. Essential for prosecution theory of case and demonstrative exhibits.',
      inputSchema: {
        caseId: z.string().uuid().describe('UUID of the case'),
        maxEvents: z.number().int().min(1).max(50).default(20).optional(),
      },
    },
    async ({ caseId, maxEvents = 20 }) => {
      const { Pool } = await import('pg');
      const pool = new Pool({ connectionString: ENV.DATABASE_URL, max: 2 });
      try {
        const evRows = await pool.query(
          `SELECT id, title, description, extracted_text
           FROM evidence WHERE case_id = $1 ORDER BY created_at LIMIT 20`,
          [caseId],
        );
        if (!evRows.rows.length) {
          return { content: [{ type: 'text', text: JSON.stringify({ events: [], reason: 'no evidence found for case' }) }] };
        }

        const chunks = evRows.rows.map((r) =>
          `[${r.id}] ${r.title ?? ''}: ${((r.extracted_text ?? r.description) ?? '').slice(0, 1200)}`
        ).join('\n\n');

        const ollamaUrl = ENV.OLLAMA_BASE_URL ?? 'http://localhost:11434';
        const prompt = `You are a legal analyst extracting a timeline from case evidence.

Evidence:
${chunks.slice(0, 14000)}

Extract up to ${maxEvents} chronological events. For each event return:
- time: ISO date/time string or natural description (e.g. "2026-03-14T14:30" or "evening of March 14, 2026")
- who: array of person names involved
- what: one-sentence action description
- location: place name or null
- evidenceId: the [id] from the evidence prefix above
- confidence: "high" | "medium" | "low"

Return ONLY valid JSON: { "events": [...] }`;

        const res = await fetch(`${ollamaUrl}/api/generate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: 'gemma4-rotorquant:latest', prompt, stream: false, format: 'json' }),
          signal: AbortSignal.timeout(90_000),
        });
        if (!res.ok) return { content: [{ type: 'text', text: JSON.stringify({ error: `Ollama ${res.status}` }) }] };
        const data = await res.json() as { response?: string };
        try {
          const parsed = JSON.parse(data.response ?? '{}') as { events?: unknown[] };
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({ caseId, evidenceCount: evRows.rowCount, ...parsed }),
            }],
          };
        } catch {
          return { content: [{ type: 'text', text: data.response ?? '{}' }] };
        }
      } finally {
        await pool.end();
      }
    },
  );

  // ── legal.cross_reference_evidence ───────────────────────────────────────
  server.registerTool(
    'legal.cross_reference_evidence',
    {
      description:
        'Semantic cross-reference: find evidence chunks similar to a reference evidence item across one or more cases using Qdrant ANN. Use for "has this fingerprint/phrase/pattern appeared in another case?" Returns top-K matches with case_id and similarity score.',
      inputSchema: {
        evidenceId: z.string().uuid().describe('Reference evidence item UUID'),
        caseIds: z.array(z.string().uuid()).max(10).optional().describe('Limit to these case IDs (omit = all cases)'),
        topK: z.number().int().min(1).max(20).default(5).optional(),
      },
    },
    async ({ evidenceId, caseIds, topK = 5 }) => {
      try {
        const qdrantUrl = ENV.QDRANT_URL ?? 'http://localhost:6333';

        const pointRes = await fetch(
          `${qdrantUrl}/collections/evidence_items/points/${encodeURIComponent(evidenceId)}`,
          { signal: AbortSignal.timeout(8_000) },
        );
        if (!pointRes.ok) {
          return { content: [{ type: 'text', text: JSON.stringify({ error: `Qdrant point lookup ${pointRes.status}`, evidenceId }) }] };
        }
        const pointData = await pointRes.json() as { result?: { vector?: number[] | Record<string, number[]> } };
        const rawVec = pointData.result?.vector;
        const vector: number[] | null = Array.isArray(rawVec) ? rawVec
          : (rawVec && typeof rawVec === 'object' ? (Object.values(rawVec as Record<string, number[]>)[0] ?? null) : null);
        if (!vector) {
          return { content: [{ type: 'text', text: JSON.stringify({ error: 'No embedding found', evidenceId }) }] };
        }

        const filter = caseIds?.length
          ? { must: [{ key: 'case_id', match: { any: caseIds } }] }
          : undefined;

        const searchRes = await fetch(`${qdrantUrl}/collections/evidence_items/points/search`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ vector, limit: topK + 1, filter, with_payload: true, score_threshold: 0.5 }),
          signal: AbortSignal.timeout(10_000),
        });
        if (!searchRes.ok) {
          return { content: [{ type: 'text', text: JSON.stringify({ error: `Qdrant search ${searchRes.status}` }) }] };
        }

        const hits = ((await searchRes.json() as { result?: Array<{ id: string; score: number; payload?: Record<string, unknown> }> }).result ?? [])
          .filter((h) => String(h.id) !== String(evidenceId))
          .slice(0, topK)
          .map((h) => ({
            id: h.id,
            score: h.score,
            caseId: h.payload?.case_id,
            title: h.payload?.title ?? String(h.payload?.chunk_text ?? '').slice(0, 80),
            evidenceType: h.payload?.evidence_type,
          }));

        return { content: [{ type: 'text', text: JSON.stringify({ referenceId: evidenceId, hits, count: hits.length }) }] };
      } catch (err) {
        return { content: [{ type: 'text', text: JSON.stringify({ error: err instanceof Error ? err.message : String(err) }) }] };
      }
    },
  );

  // ── legal.issue_spotter ───────────────────────────────────────────────────
  server.registerTool(
    'legal.issue_spotter',
    {
      description:
        'Gemma4 legal issue analysis: identifies legal issues, applicable statutes, strengths, weaknesses, missing evidence, and recommended next steps for a case. Use at case intake or before trial prep.',
      inputSchema: {
        caseId: z.string().uuid().describe('UUID of the case to analyze'),
        additionalContext: z.string().max(5000).optional().describe('Additional facts not yet in evidence records'),
      },
    },
    async ({ caseId, additionalContext }) => {
      const { Pool } = await import('pg');
      const pool = new Pool({ connectionString: ENV.DATABASE_URL, max: 2 });
      try {
        const [caseRow, evRow] = await Promise.all([
          pool.query(`SELECT title, description, status FROM cases WHERE id = $1 LIMIT 1`, [caseId]),
          pool.query(`SELECT COUNT(*) as cnt, array_agg(title) as titles FROM evidence WHERE case_id = $1`, [caseId]),
        ]);

        if (!caseRow.rows.length) {
          return { content: [{ type: 'text', text: JSON.stringify({ error: 'Case not found', caseId }) }] };
        }

        const c = caseRow.rows[0];
        const ev = evRow.rows[0];

        const ollamaUrl = ENV.OLLAMA_BASE_URL ?? 'http://localhost:11434';
        const prompt = `You are a senior prosecutor analyzing a case for legal issues.

Case: ${c.title}
Description: ${(c.description ?? '').slice(0, 3000)}
Evidence items (${ev.cnt}): ${((ev.titles as string[] | null) ?? []).slice(0, 10).join(', ')}
${additionalContext ? `Additional context: ${additionalContext.slice(0, 3000)}` : ''}

Return JSON with exactly these fields:
{
  "legalIssues": [{ "issue": string, "applicableStatutes": string[], "severity": "critical"|"major"|"minor" }],
  "strengths": string[],
  "weaknesses": string[],
  "missingEvidence": string[],
  "recommendedNextSteps": string[],
  "overallAssessment": "strong" | "moderate" | "weak",
  "confidence": number
}`;

        const res = await fetch(`${ollamaUrl}/api/generate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: 'gemma4-rotorquant:latest', prompt, stream: false, format: 'json' }),
          signal: AbortSignal.timeout(90_000),
        });
        if (!res.ok) return { content: [{ type: 'text', text: JSON.stringify({ error: `Ollama ${res.status}` }) }] };
        const data = await res.json() as { response?: string };
        try {
          const parsed = JSON.parse(data.response ?? '{}');
          return { content: [{ type: 'text', text: JSON.stringify({ caseId, caseTitle: c.title, ...parsed }) }] };
        } catch {
          return { content: [{ type: 'text', text: data.response ?? '{}' }] };
        }
      } finally {
        await pool.end();
      }
    },
  );

  // ── legal.find_similar_opinions ───────────────────────────────────────────
  server.registerTool(
    'legal.find_similar_opinions',
    {
      description:
        'Find similar case opinions, judgments, and rulings via Qdrant semantic search on the legal_documents collection filtered to doc_type opinion/judgment/ruling. Embeds the facts summary via /api/embed then runs ANN. Falls back to Postgres FTS on Qdrant error.',
      inputSchema: {
        factsSummary: z.string().min(10).max(2000).describe('Summary of the relevant facts or legal question'),
        chargeCode: z.string().max(200).optional().describe('Statute or charge code to filter by'),
        limit: z.number().int().min(1).max(20).default(5).optional(),
      },
    },
    async ({ factsSummary, chargeCode, limit = 5 }) => {
      try {
        const serverBase = process.env.ORIGIN ?? 'http://localhost:5173';
        const embedRes = await fetch(`${serverBase}/api/embed`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: factsSummary }),
          signal: AbortSignal.timeout(15_000),
        });

        if (embedRes.ok) {
          const { embedding } = await embedRes.json() as { embedding?: number[] };
          if (embedding?.length) {
            const qdrantUrl = ENV.QDRANT_URL ?? 'http://localhost:6333';
            const filter = chargeCode
              ? { must: [{ key: 'charge_code', match: { value: chargeCode } }] }
              : { must: [{ key: 'doc_type', match: { any: ['opinion', 'judgment', 'ruling', 'statute_interpretation'] } }] };

            const searchRes = await fetch(`${qdrantUrl}/collections/legal_documents/points/search`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ vector: embedding, limit, filter, with_payload: true, score_threshold: 0.45 }),
              signal: AbortSignal.timeout(10_000),
            });

            if (searchRes.ok) {
              const hits = ((await searchRes.json() as { result?: Array<{ score: number; payload?: Record<string, unknown> }> }).result ?? [])
                .map((h) => ({
                  citation:   h.payload?.citation ?? h.payload?.title,
                  outcome:    String(h.payload?.outcome ?? h.payload?.summary ?? '').slice(0, 200),
                  court:      h.payload?.court,
                  chargeCode: h.payload?.charge_code,
                  similarity: h.score,
                }));
              return { content: [{ type: 'text', text: JSON.stringify({ source: 'qdrant', opinions: hits, count: hits.length }) }] };
            }
          }
        }

        // Fallback: Postgres FTS on legal_precedents
        const { Pool } = await import('pg');
        const pool = new Pool({ connectionString: ENV.DATABASE_URL, max: 2 });
        try {
          const rows = await pool.query(
            `SELECT id, title, summary, citation, court, decision_date,
                    ts_rank(to_tsvector('english', COALESCE(title,'') || ' ' || COALESCE(summary,'')),
                            plainto_tsquery('english', $1)) AS rank
             FROM legal_precedents
             WHERE to_tsvector('english', COALESCE(title,'') || ' ' || COALESCE(summary,''))
               @@ plainto_tsquery('english', $1)
             ORDER BY rank DESC NULLS LAST LIMIT $2`,
            [factsSummary.slice(0, 400), limit],
          );
          const opinions = rows.rows.map((r) => ({
            citation: r.citation ?? r.title,
            outcome:  String(r.summary ?? '').slice(0, 200),
            court:    r.court,
            similarity: r.rank,
          }));
          return { content: [{ type: 'text', text: JSON.stringify({ source: 'postgres_fts', opinions, count: opinions.length }) }] };
        } finally {
          await pool.end();
        }
      } catch (err) {
        return { content: [{ type: 'text', text: JSON.stringify({ error: err instanceof Error ? err.message : String(err) }) }] };
      }
    },
  );

  // ── legal.transcribe_video ────────────────────────────────────────────────
  server.registerTool(
    'legal.transcribe_video',
    {
      description:
        'Queue a video URL for non-blocking background processing via RabbitMQ: yt-dlp download → FFmpeg audio extraction → Whisper large-v3 transcription → timestamp-chunked embedding into Qdrant evidence_items. Returns a job_id. Poll Redis key hermes:job:{jobId} for progress. Supports YouTube, direct MP4, Vimeo.',
      inputSchema: {
        url: z.string().url().describe('Video URL (YouTube, MP4, Vimeo, etc.)'),
        caseId: z.string().uuid().optional().describe('Associate transcript with this case'),
        priority: z.enum(['low', 'normal', 'high']).default('normal').optional(),
        timestampChunking: z.boolean().default(true).optional().describe('Chunk transcript by timestamps for fine-grained search'),
      },
    },
    async ({ url, caseId, priority = 'normal', timestampChunking = true }) => {
      const jobId = crypto.randomUUID();
      try {
        const amqpUrl = ENV.RABBITMQ_URL ?? 'amqp://guest:guest@localhost:5672';
        const amqplib = await import('amqplib');
        const conn = await (amqplib as any).connect(amqpUrl);
        const ch = await conn.createChannel();
        await ch.assertQueue('media.download', { durable: true });

        ch.sendToQueue('media.download', Buffer.from(JSON.stringify({
          jobId,
          url,
          caseId: caseId ?? null,
          priority,
          timestampChunking,
          enqueuedAt: new Date().toISOString(),
          source: 'mcp_legal_transcribe_video',
          pipeline: ['yt-dlp', 'ffmpeg', 'whisper', 'embed', 'qdrant'],
        })), { persistent: true, headers: { priority, jobId, source: 'mcp' } });

        await ch.close();
        await conn.close();

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              ok: true, jobId, status: 'queued', url, caseId,
              message: `Video queued for yt-dlp + Whisper transcription. Poll Redis key hermes:job:${jobId} for progress.`,
            }),
          }],
        };
      } catch (err) {
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              error: err instanceof Error ? err.message : String(err),
              jobId, status: 'failed',
              hint: 'Ensure RabbitMQ is running (amqp://localhost:5672)',
            }),
          }],
        };
      }
    },
  );

  // ── legal.write_obsidian_note ─────────────────────────────────────────────
  server.registerTool(
    'legal.write_obsidian_note',
    {
      description:
        'Write or append a markdown note to the Obsidian vault via the Local REST API plugin (requires Obsidian running at ENV.OBSIDIAN_URL with OBSIDIAN_API_KEY set). Creates parent folders automatically. Use to persist case summaries, timelines, mock trial reports, and cross-examination prep.',
      inputSchema: {
        path: z.string().min(1).max(500).describe('Vault-relative path, e.g. "Cases/Smith v Jones/Timeline.md"'),
        content: z.string().max(100_000).describe('Markdown content to write'),
        tags: z.array(z.string().max(50)).max(20).optional().describe('YAML frontmatter tags'),
        append: z.boolean().default(false).optional().describe('Append to existing note instead of replacing'),
      },
    },
    async ({ path, content, tags, append = false }) => {
      try {
        const frontmatter = tags?.length
          ? `---\ntags: [${tags.map((t) => `"${t}"`).join(', ')}]\nupdated: ${new Date().toISOString()}\n---\n\n`
          : '';

        if (append) {
          const { appendToNote } = await import('$lib/server/integrations/obsidian-client.js');
          const ok = await appendToNote(path, '\n\n' + content);
          return { content: [{ type: 'text', text: JSON.stringify({ ok, path, mode: 'append' }) }] };
        }

        const { writeNote } = await import('$lib/server/integrations/obsidian-client.js');
        const body = frontmatter + content;
        const ok = await writeNote(path, body);
        return { content: [{ type: 'text', text: JSON.stringify({ ok, path, mode: 'write', byteCount: body.length }) }] };
      } catch (err) {
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              error: err instanceof Error ? err.message : String(err),
              path,
              hint: 'Ensure Obsidian is running with Local REST API plugin enabled at ENV.OBSIDIAN_URL',
            }),
          }],
        };
      }
    },
  );

  // ── legal.mock_trial ──────────────────────────────────────────────────────
  server.registerTool(
    'legal.mock_trial',
    {
      description:
        'Multi-role mock trial simulation using Gemma4. Prosecution makes an opening statement, defense counters, then a judge delivers a ruling with evidence admissibility analysis and verdict probability. Returns all statements plus prosecution/defense scores and key weaknesses. For pre-trial preparation only — not for evidentiary conclusions.',
      inputSchema: {
        caseId: z.string().uuid().describe('UUID of the case to simulate'),
        chargeDescription: z.string().min(10).max(2000).describe('The charge(s) being simulated'),
        defenseTheory: z.string().max(1000).optional().describe('Known defense theory to test against'),
      },
    },
    async ({ caseId, chargeDescription, defenseTheory }) => {
      const { Pool } = await import('pg');
      const pool = new Pool({ connectionString: ENV.DATABASE_URL, max: 2 });
      const ollamaUrl = ENV.OLLAMA_BASE_URL ?? 'http://localhost:11434';

      async function callGemma(role: string, ctx: string, userPrompt: string): Promise<string> {
        const res = await fetch(`${ollamaUrl}/api/generate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'gemma4-rotorquant:latest',
            prompt: `${ctx}\n\n${userPrompt}`,
            stream: false,
            format: 'json',
          }),
          signal: AbortSignal.timeout(60_000),
        });
        if (!res.ok) throw new Error(`Ollama ${res.status} for role=${role}`);
        return ((await res.json() as { response?: string }).response) ?? '{}';
      }

      try {
        const [caseRow, evRow] = await Promise.all([
          pool.query(`SELECT title, description FROM cases WHERE id = $1 LIMIT 1`, [caseId]),
          pool.query(
            `SELECT title, description, extracted_text FROM evidence WHERE case_id = $1 LIMIT 10`,
            [caseId],
          ),
        ]);

        if (!caseRow.rows.length) {
          return { content: [{ type: 'text', text: JSON.stringify({ error: 'Case not found', caseId }) }] };
        }

        const caseTitle = caseRow.rows[0].title as string;
        const evidenceSummary = evRow.rows
          .map((r) => `• ${r.title ?? ''}: ${((r.extracted_text ?? r.description) ?? '').slice(0, 400)}`)
          .join('\n');
        const caseCtx = `Case: ${caseTitle}\nCharge: ${chargeDescription}\nEvidence:\n${evidenceSummary}`;

        const [prosecutionRaw, defenseRaw] = await Promise.all([
          callGemma(
            'prosecution',
            'You are the prosecutor. Be assertive, fact-focused, and legally precise.',
            `${caseCtx}\n\nWrite an opening statement as JSON: { "opening": string, "keyArguments": string[], "evidenceHighlights": string[] }`,
          ),
          callGemma(
            'defense',
            'You are the defense attorney. Challenge the prosecution\'s case and present your theory.',
            `${caseCtx}\n${defenseTheory ? `Defense theory: ${defenseTheory}\n` : ''}Write defense opening as JSON: { "opening": string, "challengePoints": string[], "alternativeNarrative": string }`,
          ),
        ]);

        const judgeRaw = await callGemma(
          'judge',
          'You are the presiding judge evaluating both sides objectively under the rules of evidence.',
          `${caseCtx}\nProsecution: ${prosecutionRaw.slice(0, 1500)}\nDefense: ${defenseRaw.slice(0, 1500)}\n\nProvide judicial assessment as JSON: { "admissibleEvidence": string[], "excludedEvidence": string[], "prosecutionStrengthScore": number, "defenseStrengthScore": number, "verdictProbability": { "guilty": number, "notGuilty": number }, "keyWeaknesses": string[], "judicialNotes": string }`,
        );

        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              caseId,
              caseTitle,
              charge: chargeDescription,
              prosecution: JSON.parse(prosecutionRaw),
              defense: JSON.parse(defenseRaw),
              judgment: JSON.parse(judgeRaw),
              disclaimer: 'Demonstrative simulation only — not legal advice. Results reflect AI reasoning, not evidentiary standards.',
            }),
          }],
        };
      } catch (err) {
        return { content: [{ type: 'text', text: JSON.stringify({ error: err instanceof Error ? err.message : String(err) }) }] };
      } finally {
        await pool.end();
      }
    },
  );

  // ── legal.check_services ──────────────────────────────────────────────────
  server.registerTool(
    'legal.check_services',
    {
      description:
        'Probe all 9 backing services (Postgres, Redis, Qdrant, Neo4j, Ollama, RabbitMQ, CouchDB, SeaweedFS, Obsidian) and report health status with latency. Use to diagnose why other tools are returning errors.',
      inputSchema: {},
    },
    async () => {
      const results: Record<string, { ok: boolean; latencyMs?: number; detail?: string }> = {};

      const probe = async (name: string, fn: () => Promise<void>) => {
        const t0 = Date.now();
        try {
          await fn();
          results[name] = { ok: true, latencyMs: Date.now() - t0 };
        } catch (err) {
          results[name] = {
            ok: false,
            latencyMs: Date.now() - t0,
            detail: err instanceof Error ? err.message : String(err),
          };
        }
      };

      await Promise.allSettled([
        probe('postgres', async () => {
          const { Pool } = await import('pg');
          const p = new Pool({ connectionString: ENV.DATABASE_URL, max: 1 });
          await p.query('SELECT 1');
          await p.end();
        }),
        probe('redis', async () => {
          const { getRedis } = await import('$lib/server/redis.js');
          await getRedis().ping();
        }),
        probe('qdrant', async () => {
          const r = await fetch(`${ENV.QDRANT_URL ?? 'http://localhost:6333'}/`, { signal: AbortSignal.timeout(4_000) });
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
        }),
        probe('neo4j', async () => {
          const { getNeo4jDriver } = await import('$lib/server/neo4j-driver.js');
          const s = getNeo4jDriver().session({ defaultAccessMode: 'READ' });
          await s.run('RETURN 1');
          await s.close();
        }),
        probe('ollama', async () => {
          const r = await fetch(`${ENV.OLLAMA_BASE_URL ?? 'http://localhost:11434'}/api/tags`, { signal: AbortSignal.timeout(4_000) });
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
        }),
        probe('rabbitmq', async () => {
          const u = new URL(ENV.RABBITMQ_URL ?? 'amqp://guest:guest@localhost:5672');
          const auth = Buffer.from(`${u.username || 'guest'}:${u.password || 'guest'}`).toString('base64');
          const r = await fetch(`http://${u.hostname}:15672/api/overview`, {
            headers: { Authorization: `Basic ${auth}` },
            signal: AbortSignal.timeout(4_000),
          });
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
        }),
        probe('couchdb', async () => {
          const base = process.env.COUCHDB_URL ?? 'http://localhost:5984';
          const auth = Buffer.from(`${process.env.COUCHDB_USER ?? 'admin'}:${process.env.COUCHDB_PASSWORD ?? 'deeds123'}`).toString('base64');
          const r = await fetch(`${base}/`, { headers: { Authorization: `Basic ${auth}` }, signal: AbortSignal.timeout(4_000) });
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
        }),
        probe('seaweedfs', async () => {
          const r = await fetch(
            `http://localhost:${process.env.SEAWEED_MASTER_PORT ?? 9333}/cluster/status`,
            { signal: AbortSignal.timeout(4_000) },
          );
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
        }),
        probe('obsidian', async () => {
          const { isObsidianAvailable } = await import('$lib/server/integrations/obsidian-client.js');
          if (!await isObsidianAvailable()) throw new Error('Obsidian Local REST API unreachable or API key missing');
        }),
      ]);

      const healthy = Object.values(results).filter((r) => r.ok).length;
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            summary: `${healthy}/${Object.keys(results).length} services healthy`,
            allHealthy: healthy === Object.keys(results).length,
            services: results,
          }),
        }],
      };
    },
  );
}
