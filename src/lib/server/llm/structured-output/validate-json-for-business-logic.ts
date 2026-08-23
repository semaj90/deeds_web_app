/**
 * @fileoverview Handles the validation and post-processing of raw JSON candidates.
 * This layer is responsible for ensuring that data derived from LLMs
 * is both syntactically correct (JSON.parse) and semantically correct (Zod validation)
 * before being used in business logic.
 */
export type JsonValidationResult = {
    /** The final, trusted, and type-safe data object. */
    data: any | null;
    /** True if the data passed parsing AND schema validation. */
    validated: boolean;
    /** The source of truth for the data. */
    source: string;
}

/**
 * Processes a candidate JSON object through validation layers.
 * @param rawCandidate The raw, parsed object from extract-json-candidates.
 * @param schemaValidator The Zod schema used for validation.
 * @returns A structured result object.
 */
export function validateJsonForBusinessLogic(rawCandidate: any, schemaValidator: any): JsonValidationResult {
  if (!rawCandidate) {
    return { data: null, validated: false, source: 'No candidate provided' };
  }

  // We assume that if we reached this function, the rawCandidate passed JSON.parse.
  // Now we check the schema.
  try {
    const validatedData = schemaValidator.parse(rawCandidate);
    return { data: validatedData, validated: true, source: 'Passed all checks' };
  } catch (e) {
    console.warn(`Validation failed: ${e.message}. The data is syntactically correct but schema-invalid.`);
    return { data: null, validated: false, source: 'Schema Failure' };
  }
}