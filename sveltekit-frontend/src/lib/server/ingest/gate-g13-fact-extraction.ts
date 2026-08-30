/**
 * Phase 110 Gate G13: Fact Extraction
 * Extracts N-ary facts from packet content via Gemma4, validates with Zod, persists to atlas_facts
 */

import { db } from '$lib/server/db/client.js';
import { atlasFacts, atlasFactArguments } from '$lib/server/db/schema/atlas-facts.js';
import { extractedFactSchema, type ExtractedFact, type FactArgument } from './fact-extraction.schema.js';
import crypto from 'crypto';
import { eq } from 'drizzle-orm';

import { ENV } from '$lib/server/env.server.js';
import { LLM_MODEL_ID } from '$lib/server/llm/runtime-contract.js';
export interface GateG13Result {
  fact_id: string;
  packet_key: string;
  source_ref: string;
  fact_text: string;
  confidence: number;
  reasoning_trace?: string;
  arguments_count: number;
  validation_proof: 'PASS' | 'FAIL';
  error?: string;
}

/**
 * Strip Gemma4 thinking tags from response
 * Handles <|channel>thought...</channel|> and <thinking>...</thinking> blocks
 * Uses case-insensitive matching for robustness
 */
function stripThinkingTags(text: string): string {
  // Remove <|channel>...</channel|> tags (closing is </channel|> with forward slash)
  let result = text.replace(/<\|channel>[\s\S]*?<\/channel\|>/gi, '');
  // Remove <thinking>...</thinking> tags
  result = result.replace(/<thinking>[\s\S]*?<\/thinking>/gi, '');
  // Clean up extra whitespace
  result = result.trim();
  return result;
}

/**
 * Extract JSON array from text with bracket depth tracking
 * Avoids false positives from prose containing brackets
 * Validates bracket nesting safety before parsing
 */
function extractJsonArray(text: string): unknown[] | null {
  // First, strip all thinking tags
  const cleaned = stripThinkingTags(text);

  // Remove markdown code fences
  let processed = cleaned.replace(/```(?:json)?\s*/gi, '').replace(/```\s*/gi, '');
  processed = processed.trim();

  // Try each '[' position, looking for a valid JSON array
  let searchIdx = 0;
  while (true) {
    const startIdx = processed.indexOf('[', searchIdx);
    if (startIdx === -1) {
      return null;
    }

    // Track bracket depth to find matching ']'
    let depth = 0;
    let inString = false;
    let escaped = false;
    let endIdx = -1;

    for (let i = startIdx; i < processed.length; i++) {
      const char = processed[i];

      // Handle escape sequences in strings
      if (escaped) {
        escaped = false;
        continue;
      }

      if (char === '\\' && inString) {
        escaped = true;
        continue;
      }

      // Handle string boundaries
      if (char === '"') {
        inString = !inString;
        continue;
      }

      // Skip bracket counting if we're inside a string
      if (inString) {
        continue;
      }

      // Track bracket depth
      if (char === '[') {
        depth++;
      } else if (char === ']') {
        depth--;
        // When depth reaches 0, we've found the matching bracket
        if (depth === 0) {
          endIdx = i;
          break;
        }
      }
    }

    if (endIdx === -1 || endIdx <= startIdx) {
      searchIdx = startIdx + 1;
      continue;
    }

    const jsonStr = processed.substring(startIdx, endIdx + 1);

    try {
      const parsed = JSON.parse(jsonStr);
      if (Array.isArray(parsed)) {
        return parsed;
      }
    } catch {
      // This wasn't valid JSON, try the next bracket
      searchIdx = startIdx + 1;
      continue;
    }
  }
}

/**
 * Extract facts from packet content using Gemma4
 * Returns validated ExtractedFact objects ready for persistence
 */
export async function extractFactsFromPacket(
  packet_key: string,
  source_ref: string,
  content: string,
  gemma4_url: string = ENV.LLAMA_SERVER_URL ?? 'http://127.0.0.1:8090'
): Promise<ExtractedFact[]> {
  const prompt = `TASK: Extract 3-5 key facts from the provided text.

TEXT:
${content}

EXTRACT FACTS ABOUT: Authentication methods, security measures, system components, data flow, configuration details, or requirements.

FOR EACH FACT, CREATE A JSON OBJECT:
- fact_text: ONE declarative sentence describing the fact (max 120 characters)
- confidence: 0.5 to 1.0 (how certain you are this fact is accurate)
- reasoning_trace: brief explanation of WHERE this fact comes from in the text
- arguments: array of 1-3 structured arguments from this fact:
  * argument_index: 0, 1, 2, etc.
  * argument_name: "subject" | "object" | "predicate" | "temporal_anchor" | "location" | "event" | "entity" | "other"
  * argument_value: the actual value (string, max 255 chars)
  * argument_type: "entity" | "event" | "location" | "temporal" | "numeric" | "boolean" | "relation" | "other"

EXAMPLE (do NOT copy this literally, GENERATE NEW FACTS):
[
  {
    "fact_text": "Users are identified by UUID v4 format identifiers.",
    "confidence": 0.95,
    "reasoning_trace": "Stated directly in User Identification section",
    "arguments": [
      {"argument_index": 0, "argument_name": "subject", "argument_value": "Users", "argument_type": "entity"},
      {"argument_index": 1, "argument_name": "predicate", "argument_value": "identified by", "argument_type": "relation"},
      {"argument_index": 2, "argument_name": "object", "argument_value": "UUID v4 identifiers", "argument_type": "entity"}
    ]
  }
]

RESPOND WITH ONLY A VALID JSON ARRAY. NO PREAMBLE. NO THINKING. NO MARKDOWN.`;

  const response = await fetch(`${gemma4_url}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: LLM_MODEL_ID,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
      stream: false,
      max_tokens: 2048
    })
  });

  if (!response.ok) {
    throw new Error(`Gemma4 fact extraction failed: ${response.statusText}`);
  }

  const data = await response.json() as { choices: Array<{ message: { content: string } }> };
  let extracted_text = data.choices[0]?.message.content || '[]';

  // Strip thinking tags
  extracted_text = stripThinkingTags(extracted_text);

  // Try to extract JSON array
  let facts: unknown[] | null = null;
  try {
    facts = JSON.parse(extracted_text);
  } catch {
    // If direct parse fails, try extracting array from text
    facts = extractJsonArray(extracted_text);
  }

  if (!facts || !Array.isArray(facts)) {
    console.warn('[Gate G13] No valid JSON array found in Gemma4 response');
    console.warn('[Gate G13] Raw response:', extracted_text.substring(0, 200));
    return [];
  }

  if (facts.length === 0) {
    console.warn('[Gate G13] Gemma4 returned empty array');
    return [];
  }

  const validated_facts: ExtractedFact[] = [];
  for (let i = 0; i < facts.length; i++) {
    try {
      const fact_with_meta = {
        packetKey: packet_key,
        sourceRef: source_ref,
        ...(facts[i] as Record<string, unknown>)
      };

      const validated = extractedFactSchema.parse(fact_with_meta);
      validated_facts.push(validated);
    } catch (err) {
      if (err instanceof Error) {
        console.warn(`[Gate G13] Fact ${i} validation failed:`, {
          raw_fact: JSON.stringify(facts[i]).substring(0, 200),
          error: err.message
        });
      } else {
        console.warn(`[Gate G13] Fact ${i} validation failed:`, err);
      }
    }
  }

  console.log(
    `[Gate G13] Extracted ${validated_facts.length}/${facts.length} facts after Zod validation`
  );

  return validated_facts;
}

/**
 * Persist validated facts to atlas_facts and atlas_fact_arguments tables
 * Uses atomic transactions per fact to ensure consistency
 * Normalizes confidence to 0.0-1.0 range
 * Returns GateG13Result array with proof of persistence
 */
export async function persistExtractedFacts(facts: ExtractedFact[]): Promise<GateG13Result[]> {
  const results: GateG13Result[] = [];

  for (const fact of facts) {
    try {
      // Normalize confidence to 0.0-1.0 range
      const normalized_confidence = Math.max(0, Math.min(1, fact.confidence));

      // Insert within transaction for atomicity
      const fact_id = await db.transaction(async (tx) => {
        // Insert into atlas_facts
        const inserted_fact = await tx
          .insert(atlasFacts)
          .values({
            packetKey: fact.packet_key,
            sourceRef: fact.source_ref,
            factText: fact.fact_text,
            confidence: normalized_confidence,
            reasoningTrace: fact.reasoning_trace
          })
          .returning({ id: atlasFacts.id });

        const id = inserted_fact[0]?.id;
        if (!id) {
          throw new Error('FACT_INSERT_READBACK_MISSING');
        }

        // Insert arguments for this fact (within same transaction)
        if (fact.arguments.length > 0) {
          await tx.insert(atlasFactArguments).values(
            fact.arguments.map((arg) => ({
              factId: id,
              argumentIndex: arg.argument_index,
              argumentName: arg.argument_name,
              argumentValue: arg.argument_value,
              argumentType: arg.argument_type
            }))
          );
        }

        return id;
      });

      // Verify readback (outside transaction, but validates persistence)
      const readbackRows = await db
        .select()
        .from(atlasFacts)
        .where(eq(atlasFacts.id, fact_id))
        .limit(1);
      const readback = readbackRows[0] ?? null;

      if (!readback) {
        throw new Error('READBACK_FAILED');
      }

      results.push({
        fact_id,
        packet_key: fact.packet_key,
        source_ref: fact.source_ref,
        fact_text: fact.fact_text,
        confidence: normalized_confidence,
        reasoning_trace: fact.reasoning_trace,
        arguments_count: fact.arguments.length,
        validation_proof: 'PASS'
      });
    } catch (err) {
      results.push({
        fact_id: crypto.randomUUID(),
        packet_key: fact.packet_key,
        source_ref: fact.source_ref,
        fact_text: fact.fact_text,
        confidence: fact.confidence,
        reasoning_trace: fact.reasoning_trace,
        arguments_count: fact.arguments.length,
        validation_proof: 'FAIL',
        error: String(err)
      });
    }
  }

  return results;
}

/**
 * Gate G13 end-to-end: extract facts, validate, and persist
 */
export async function gateG13FactExtraction(
  packet_key: string,
  source_ref: string,
  content: string
): Promise<{ results: GateG13Result[]; proof_state: 'PASS' | 'PARTIAL' | 'FAIL' }> {
  try {
    const extracted = await extractFactsFromPacket(packet_key, source_ref, content);
    const persisted = await persistExtractedFacts(extracted);

    const pass_count = persisted.filter(r => r.validation_proof === 'PASS').length;
    const total = persisted.length;

    return {
      results: persisted,
      proof_state: total === 0 ? 'FAIL' : pass_count === total ? 'PASS' : 'PARTIAL'
    };
  } catch (err) {
    console.error('[Gate G13] Fatal error in fact extraction:', err);
    return {
      results: [],
      proof_state: 'FAIL'
    };
  }
}
