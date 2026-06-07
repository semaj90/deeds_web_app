// sveltekit-frontend/src/lib/server/memory/memory-anchor.ts

export interface MemoryAnchor {
  objective: string;
  decisions: string[];
  blockers: string[];
  files: string[];
  commands: string[];
  nextActions: string[];
}

/**
 * Strips reasoning artifacts from raw text input to sanitize the data.
 * @param {string} text - The raw text input from an agent or tool run.
 * @returns {string} The cleaned, focused text.
 */
export function stripReasoningLeak(text: string): string {
  // 1. Remove channel markers
  let cleanedText = text.replace(/<channel\|>[\s\S]*?<\|channel>/g, '');
  cleanedText = cleanedText.replace(/<\|channel>[\s\S]*?<channel\|>/g, '');
  
  // 2. Remove Thinking blocks (This pattern targets the structure: Thinking: [content])
  cleanedText = cleanedText.replace(/^Thinking:[\s\S]*?(?=\n(?:[A-Z][\w -]+:|$))/m, '');
  
  // 3. Truncate to prevent overly large inputs that exceed cache limits
  return cleanedText.slice(0, 12000);
}

/**
 * Helper function to extract and collect multiple lines matching a regex pattern.
 * @param {string} text - The source text.
 * @param {RegExp} regex - The regex to match.
 * @param {number} maxCount - The maximum number of matches to return.
 * @returns {string[]} An array of collected strings.
 */
export function pickLines(text: string, regex: RegExp, maxCount: number): string[] {
  const matches = [...text.matchAll(regex)];
  return matches.map(match => match[0]);
}

/**
 * Creates a structured, sanitized Memory Anchor object from raw session text.
 * @param {unknown} input - The raw source content (e.g., chat history, tool logs).
 * @returns {MemoryAnchor} A structured, compressed anchor object.
 */
export function toMemoryAnchor(input: unknown): MemoryAnchor {
  const rawText = typeof input === 'string' ? input : JSON.stringify(input ?? '');
  const clean = stripReasoningLeak(rawText);

  return {
    objective: firstSentence(clean).slice(0, 240),
    decisions: pickLines(clean, /decision|decided|use |keep |remove |disable /i, 8),
    blockers: pickLines(clean, /blocker|fail|error|missing|broken|drift|mismatch/i, 5),
    files: pickLines(clean, /[\w./\\-]+\.(ts|js|mjs|md|jsonc|sql|ps1)/i, 12),
    commands: pickLines(clean, /\b(npm|node|pnpm|docker|rg|curl|pwsh|npx)\b/i, 8),
    nextActions: pickLines(clean, /next|todo|fix|patch|run |verify/i, 3),
  };
}

// Helper function to get the first sentence, assuming it starts with a capital letter.
function firstSentence(text: string): string {
  const match = text.match(/^[^.\n]*(\.[^.\n]*)*\.\s+([A-Z][a-z]*[\w\s]*)/);
  if (match) {
    // Return the first sentence found, or a safe fallback.
    return match[0] + " ";
  }
  return text.substring(0, Math.min(1000, text.length)); // Fallback to a short snippet
}