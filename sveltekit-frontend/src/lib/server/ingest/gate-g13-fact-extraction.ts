/**
 * Phase 110 Gate G13: Fact Extraction
 * Extracts N-ary facts from packet content via Gemma4, validates with Zod, persists to atlas_facts
 */

import { db } from '$lib/server/db/client.js';
import { atlasFacts, atlasFactArguments } from '$lib/server/db/schema/atlas-facts.js';
import { extractedFactSchema, type ExtractedFact, type FactArgument } from './fact-extraction.schema.js';
import crypto from 'crypto';

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
 * Extract facts from packet content using Gemma4
 * Returns validated ExtractedFact objects ready for persistence
 */
export async function extractFactsFromPacket(
  packet_key: string,
  source_ref: string,
  content: string,
  gemma4_url: string = 'http://127.0.0.1:8090'
): Promise<ExtractedFact[]> {
  const prompt = `Extract structured facts from the following code or documentation:

${content}

Return a JSON array of facts where each fact has:
- fact_text: single sentence describing the fact
- confidence: 0.0-1.0 confidence in accuracy
- reasoning_trace: brief explanation of extraction logic
- arguments: array of {argument_index, argument_name, argument_value, argument_type}

Valid argument_name values: subject, object, predicate, temporal_anchor, location, event, entity, other
Valid argument_type values: entity, event, location, temporal, numeric, boolean, relation, other

Respond with ONLY the JSON array, no markdown or extra text.`;

  const response = await fetch(`${gemma4_url}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gemma4-legal-iq4xs-direct.gguf',
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
  const extracted_text = data.choices[0]?.message.content || '[]';

  let facts: unknown[];
  try {
    facts = JSON.parse(extracted_text);
  } catch {
    console.warn('[Gate G13] Failed to parse Gemma4 JSON response, returning empty array');
    return [];
  }

  if (!Array.isArray(facts)) {
    console.warn('[Gate G13] Gemma4 response was not an array, returning empty array');
    return [];
  }

  const validated_facts: ExtractedFact[] = [];
  for (const fact of facts) {
    try {
      const validated = extractedFactSchema.parse({
        packet_key,
        source_ref,
        ...fact
      });
      validated_facts.push(validated);
    } catch (err) {
      console.warn(`[Gate G13] Fact validation failed for packet ${packet_key}:`, err);
    }
  }

  return validated_facts;
}

/**
 * Persist validated facts to atlas_facts and atlas_fact_arguments tables
 * Returns GateG13Result array with proof of persistence
 */
export async function persistExtractedFacts(facts: ExtractedFact[]): Promise<GateG13Result[]> {
  const results: GateG13Result[] = [];

  for (const fact of facts) {
    try {
      // Insert into atlas_facts
      const inserted_fact = await db
        .insert(atlasFacts)
        .values({
          packet_key: fact.packet_key,
          source_ref: fact.source_ref,
          fact_text: fact.fact_text,
          confidence: fact.confidence,
          reasoning_trace: fact.reasoning_trace
        })
        .returning({ id: atlasFacts.id });

      const fact_id = inserted_fact[0]?.id;
      if (!fact_id) {
        throw new Error('Failed to retrieve inserted fact ID');
      }

      // Insert arguments for this fact
      for (const arg of fact.arguments) {
        await db.insert(atlasFactArguments).values({
          fact_id,
          argument_index: arg.argument_index,
          argument_name: arg.argument_name,
          argument_value: arg.argument_value,
          argument_type: arg.argument_type
        });
      }

      results.push({
        fact_id,
        packet_key: fact.packet_key,
        source_ref: fact.source_ref,
        fact_text: fact.fact_text,
        confidence: fact.confidence,
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
