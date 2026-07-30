/**
 * @fileoverview Utility for robustly extracting JSON objects from large text blocks,
 * designed to handle common LLM output patterns (prose wrapping, fenced blocks, etc.).
 * This function must be used instead of simple JSON.parse() calls in critical paths.
 */
export type JsonExtractionResult = {
  /** The extracted, validated JSON object. */
  value: any | null;
  /** A boolean indicating if the parsing succeeded. */
  success: boolean;
  /** A detailed string describing the parsing process (e.g., 'Found in fenced block', 'Direct parse'). */
  source: string;
  /** The raw text chunk that was successfully parsed. */
  rawText: string | null;
}

/**
 * Attempts to extract a JSON object from a given text string using multiple strategies.
 * @param text The full text output from an LLM or external source.
 * @returns An object containing the parsed value, success flag, source, and raw text.
 */
export function extractJsonCandidate(text: string): JsonExtractionResult {
  // Strategy 1: Attempt direct parse (e.g., if the output is *purely* JSON)
  try {
    const trimmedText = text.trim();
    if (trimmedText.startsWith('{') && trimmedText.endsWith('}')) {
      const parsed = JSON.parse(trimmedText);
      return { value: parsed, success: true, source: 'Direct parse', rawText: trimmedText };
    }
  } catch (e) {
    // Failed direct parse, continue to next strategies.
  }

  // Strategy 2: Attempt extraction from fenced code blocks (```json ... ```)
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/g);
  if (fenced && fenced.length > 0) {
    for (let i = fenced.length - 1; i >= 0; i--) {
      const rawCandidate = fenced[i].trim();
      try {
        const parsed = JSON.parse(rawCandidate);
        return { value: parsed, success: true, source: `Fenced Block (Index ${i})`, rawText: rawCandidate };
      } catch (e) {
        // This specific block failed to parse, try the next one.
      }
    }
  }

  // Strategy 3: Attempt extraction using balanced braces (heuristic, less reliable)
  // Note: Implementing a true balanced brace scanner is complex and often requires
  // an AST traversal or a dedicated state machine. For this first pass, we rely on
  // the regex and hope for the best, prioritizing the structured search above.
  // The original regex: /\{[\s\S]*\}/g is used here as a last resort,
  // but its failure mode is high.
  const regexMatches = text.match(/\{[\s\S]*\}/g);
  if (regexMatches && regexMatches.length > 0) {
    for (let i = regexMatches.length - 1; i >= 0; i--) {
      const rawCandidate = regexMatches[i];
      try {
        const parsed = JSON.parse(rawCandidate);
        return { value: parsed, success: true, source: `Regex Match (Index ${i})`, rawText: rawCandidate };
      } catch (e) {
        // Failed regex match, continue to next candidate.
      }
    }
  }

  // If all strategies fail
  return { value: null, success: false, source: 'Failed all checks', rawText: null };
}

/**
 * Analyzes the result of candidate extraction and validates against a Zod schema.
 * @param candidateResult The result from extractJsonCandidate.
 * @param schemaValidator The Zod schema used for validation.
 * @returns A fully validated, processed, and safe data object.
 */
export function validateAndProcessJson(candidateResult: JsonExtractionResult, schemaValidator: any): any {
  if (!candidateResult.success) {
    console.warn('[JSON Validation] Could not find any parsable JSON candidate.');
    return null;
  }

  try {
    // 1. Attempt Zod validation against the schema
    const validatedObject = schemaValidator.parse(candidateResult.value);

    console.log(`[JSON Validation] ✅ Success: Parsed JSON structure also passed Zod schema validation from source: ${candidateResult.source}`);
    return validatedObject;
  } catch (e) {
    console.error(`[JSON Validation] ❌ Schema Mismatch: Parsed JSON was structurally valid but failed Zod validation. Error: ${e.message}`);
    // Critical: Do not proceed with invalid data.
    return null;
  }
}