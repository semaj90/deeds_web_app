/**
 * @fileoverview Utility module defining common failure handling and structured error messages
 * for JSON parsing attempts that fail schema validation or are otherwise unusable.
 */
export type ParseErrorDetail = {
    /** The raw text that failed to parse. */
    rawText: string;
    /** The Zod error object, if available. */
    zodError?: string;
    /** A human-readable summary of why the data was rejected. */
    reason: string;
}

/**
 * Aggregates and reports all reasons why a candidate JSON failed to achieve 'FULLY_PROVEN' status.
 * @param errors An array of error details from the parsing and validation process.
 */
export function aggregateParseErrors(errors: Array<ParseErrorDetail>): string {
    if (errors.length === 0) {
        return "No parsing errors encountered.";
    }

    let summary = `\n--- JSON Parsing Failures Detected (${errors.length} issues) ---\n`;

    errors.forEach((error, index) => {
        summary += `[Error ${index + 1}] Source: ${error.source}\n`;
        summary += `  -> Reason: ${error.reason}\n`;
        if (error.zodError) {
            summary += `  -> Validation Issue: ${error.zodError}\n`;
        }
        summary += `\n`;
    });

    return summary + "----------------------------------------------------------\n";
}