/**
 * Concept Extraction Tool
 *
 * Extracts 3-5 semantic concepts from a query using Gemma4
 * and matches them against a postgres.concepts registry.
 *
 * Flow:
 *   1. Stream query to Gemma4 with structured prompt
 *   2. Parse streaming JSON response for concept array
 *   3. Filter by confidence threshold (default 0.7)
 *   4. Look up each concept in postgres.concepts table
 *   5. Return matched concept IDs + raw extraction data
 *
 * Graceful degradation: On any error (Gemma4 timeout, DB miss, parse fail),
 * returns empty conceptIds array and empty extracted array.
 */

import { z } from 'zod';
import { pool } from '$lib/server/db/client.js';
import { bifrostChat } from '$lib/server/ollama.js';
import { ENV } from '$lib/server/env.server.js';

// ── Types & Schemas ──────────────────────────────────────────────────────────

export const ConceptExtractionRequestSchema = z.object({
  query: z.string().min(1).max(1000, 'Query too long (max 1000 chars)'),
  maxConcepts: z.number().int().min(1).max(10).optional().default(5),
  minConfidence: z.number().min(0.5).max(0.95).optional().default(0.7),
});

export type ConceptExtractionRequest = z.infer<typeof ConceptExtractionRequestSchema>;

export interface ExtractedConcept {
  name: string;
  confidence: number;
  category?: string;
}

export interface ConceptExtractionResponse {
  conceptIds: string[];
  extracted: ExtractedConcept[];
  durationMs: number;
}

// ── System Prompt ────────────────────────────────────────────────────────────

const CONCEPT_EXTRACTION_PROMPT = `You are a semantic concept extractor for legal research queries.
Extract 3-5 key semantic concepts from the user's query.

Rules:
- Each concept must be 1-3 words
- Focus on domain-specific terms (not generic words like "what" or "is")
- Assign confidence 0.6-1.0 based on how central the concept is to the query
- Output ONLY a JSON object with a "concepts" array, no other text

Example input: "How do reciprocal rank fusion algorithms handle multiple ranking signals?"
Example output:
{
  "concepts": [
    {"name": "reciprocal rank fusion", "confidence": 0.95, "category": "algorithm"},
    {"name": "ranking signals", "confidence": 0.85, "category": "ir_concept"},
    {"name": "multi-signal ranking", "confidence": 0.80, "category": "algorithm"}
  ]
}

Now extract concepts from this query:`;

// ── Main Function ────────────────────────────────────────────────────────────

export async function extractQueryConceptsViaGemma(
  request: ConceptExtractionRequest
): Promise<ConceptExtractionResponse> {
  const startMs = Date.now();

  try {
    // Validate input
    const validated = ConceptExtractionRequestSchema.parse(request);

    // Stream Gemma4 for concept extraction
    const extracted = await streamConceptsFromGemma(validated);

    // Filter by confidence
    const filtered = extracted.filter((c) => c.confidence >= validated.minConfidence);
    const limited = filtered.slice(0, validated.maxConcepts);

    // Look up concept IDs in postgres
    const conceptIds = await lookupConceptIds(limited.map((c) => c.name));

    return {
      conceptIds,
      extracted: limited,
      durationMs: Date.now() - startMs,
    };
  } catch (err) {
    // Log error but don't throw — graceful degradation
    if (err instanceof z.ZodError) {
      console.error('[concept-extraction] Validation error:', err.errors);
    } else {
      console.error('[concept-extraction] Error:', err);
    }

    return {
      conceptIds: [],
      extracted: [],
      durationMs: Date.now() - startMs,
    };
  }
}

// ── Streaming Concept Extraction ─────────────────────────────────────────────

async function streamConceptsFromGemma(
  request: ConceptExtractionRequest
): Promise<ExtractedConcept[]> {
  const prompt = `${CONCEPT_EXTRACTION_PROMPT}\n\n"${request.query}"`;

  // Use bifrostChat for streaming (with L1 + L2 cache automatic)
  const response = await bifrostChat(
    [{ role: 'user', content: prompt }],
    ENV.GEMMA_MODEL || 'gemma3-legal:latest',
    {
      temperature: 0.3,
      maxTokens: 500,
    }
  );

  // Parse response JSON
  const jsonStr = response.trim();
  const parsed = parseConceptJson(jsonStr);

  return parsed;
}

function parseConceptJson(text: string): ExtractedConcept[] {
  try {
    // Find JSON object in response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.warn('[concept-extraction] No JSON found in response');
      return [];
    }

    const json = JSON.parse(jsonMatch[0]);
    if (!Array.isArray(json.concepts)) {
      console.warn('[concept-extraction] No concepts array in JSON');
      return [];
    }

    // Validate each concept
    const concepts: ExtractedConcept[] = [];
    for (const item of json.concepts) {
      if (
        typeof item.name === 'string' &&
        typeof item.confidence === 'number' &&
        item.confidence >= 0 &&
        item.confidence <= 1
      ) {
        concepts.push({
          name: item.name.trim(),
          confidence: item.confidence,
          category: item.category ? String(item.category) : undefined,
        });
      }
    }

    return concepts;
  } catch (err) {
    console.error('[concept-extraction] JSON parse error:', err);
    return [];
  }
}

// ── Postgres Lookup ──────────────────────────────────────────────────────────

async function lookupConceptIds(conceptNames: string[]): Promise<string[]> {
  if (conceptNames.length === 0) {
    return [];
  }

  try {
    // Query postgres.concepts table (may not exist yet)
    // If table doesn't exist, catch error and return empty
    const result = await pool.query(
      `SELECT id, name FROM concepts WHERE LOWER(name) = ANY($1)`,
      [conceptNames.map((n) => n.toLowerCase())]
    );

    return result.rows.map((row) => row.id);
  } catch (err) {
    // Table may not exist or concepts not found
    if (
      err instanceof Error &&
      (err.message.includes('does not exist') || err.message.includes('relation'))
    ) {
      console.debug('[concept-extraction] Concepts table not yet populated, skipping lookup');
    } else {
      console.error('[concept-extraction] Postgres lookup error:', err);
    }
    return [];
  }
}

// ── Export ───────────────────────────────────────────────────────────────────

export default extractQueryConceptsViaGemma;
