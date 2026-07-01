/**
 * sanitize-gemma4-output.ts
 *
 * Strips <|channel>thought...thought|> blocks from Gemma4 responses.
 * These are "leaked" thinking blocks that contaminate summaries.
 *
 * The blocks appear because Gemma4's embedded chat template has reasoning
 * enabled at the GGUF level, and --reasoning-budget 0 isn't fully effective
 * across all llama-server versions.
 *
 * This sanitizer:
 * 1. Removes everything between <|channel>thought and <channel|>
 * 2. Cleans up leftover markers
 * 3. Returns clean, summary-only text
 */

export function sanitizeGemma4Output(text: string): string {
  if (!text) return text;

  // Remove <|channel>thought...thought|> blocks (greedy, across newlines)
  let cleaned = text.replace(/<\|channel>thought[\s\S]*?<channel\|>/g, '');

  // Clean up any leftover channel markers
  cleaned = cleaned.replace(/<\|?channel\|?>/g, '');

  // Trim leading/trailing whitespace
  cleaned = cleaned.trim();

  return cleaned;
}

export function isLeakedSummary(text: string): boolean {
  return /<\|channel>thought|<channel\|>/.test(text);
}

/**
 * Batch sanitizer for API responses with multiple completions
 */
export function sanitizeOpenAIResponse<T extends { choices?: Array<{ message?: { content?: string } }> }>(
  response: T
): T {
  if (!response.choices) return response;

  const sanitized = { ...response };
  sanitized.choices = response.choices.map((choice) => ({
    ...choice,
    message: choice.message
      ? {
          ...choice.message,
          content: choice.message.content ? sanitizeGemma4Output(choice.message.content) : undefined,
        }
      : undefined,
  }));

  return sanitized;
}
