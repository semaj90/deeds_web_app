/**
 * HCA (Hierarchical Context Attention) 128-token compressor.
 *
 * Deterministic compression of prior answers and tool results into
 * ≤128-token (~512 char) summary cards for Gemma4's context window.
 *
 * These cards are the "reusable memory units" in the KV summary cache:
 * every useful answer becomes a small card that the model can recall
 * without re-running full retrieval. On the next related query, Gemma4
 * gets the card first and calls MCP tools for details only if needed.
 *
 * Format:
 *   {
 *     key:             'query:{sha1}',
 *     type:            'prior-answer',
 *     summary128:      ≤512 chars (~128 tokens),
 *     source:          'openai-facade',
 *     ttl:             '6h',
 *     embeddingQueued: true,
 *     aceTags:         ['graphSimilaritySafe', 'batchCosineSimilarityAsync', ...]
 *   }
 */

export type HCACardType = 'prior-answer' | 'tool-result' | 'trace-span';

export interface HCACard {
  key:             string;
  type:            HCACardType;
  summary128:      string;   // ≤512 chars (~128 tokens at 4 chars/token)
  source:          string;
  ttl:             string;
  embeddingQueued: boolean;
  fromRedis:       boolean;
  queuedForEmbedding: boolean;
  aceTags:         string[];
  summaryTokensTarget: number;
}

// ── Token/char budget ─────────────────────────────────────────────────────────

const TARGET_TOKENS = 128;
const CHARS_PER_TOKEN = 4;
const MAX_CHARS = TARGET_TOKENS * CHARS_PER_TOKEN; // 512

// ── Extraction patterns ───────────────────────────────────────────────────────

const CAMEL_OR_PASCAL = /\b([A-Z][a-zA-Z0-9]{3,}|[a-z]{2,}[A-Z][a-zA-Z0-9]{2,})\b/g;
const FILE_EXT        = /\b[\w-]{3,}\.(?:ts|svelte|js|py|go|sql|rs|tsx|jsx|mjs|cjs)\b/g;
const FUNCTION_CALL   = /\b([a-z][a-zA-Z0-9]+(?:Async|GPU|Cache|Search|Build|Run|Fetch|Get|Set|Init|Load|Save))\b/g;

function extractIdentifiers(text: string): string[] {
  const ids = new Set<string>();
  for (const m of text.matchAll(CAMEL_OR_PASCAL)) {
    if (m[0].length <= 40) { ids.add(m[0]); if (ids.size >= 6) break; }
  }
  for (const m of text.matchAll(FILE_EXT)) {
    ids.add(m[0]); if (ids.size >= 8) break;
  }
  for (const m of text.matchAll(FUNCTION_CALL)) {
    ids.add(m[0]); if (ids.size >= 10) break;
  }
  // Deduplicate: if foo.ts and foo both present, keep foo.ts
  return [...ids].slice(0, 8);
}

function cleanForSentence(text: string): string {
  return text
    .replace(/```[\s\S]*?```/gm, '[code]')
    .replace(/`[^`\n]+`/g, (m) => m.slice(1, -1)) // inline code → bare text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')        // markdown links
    .replace(/#+\s*/g, '')                            // headings
    .replace(/\*\*/g, '')                             // bold
    .replace(/\n{2,}/g, '. ')
    .replace(/\n/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function extractSentences(text: string, n = 2): string[] {
  const clean     = cleanForSentence(text);
  const sentences = clean.match(/[^.!?]+[.!?]+/g) ?? [clean];
  return sentences
    .map(s => s.trim())
    .filter(s => s.length > 10)
    .slice(0, n);
}

// ── Main compressor ───────────────────────────────────────────────────────────

export function compressToHCACard(
  text:   string,
  key:    string,
  source: string,
  opts: {
    type?:            HCACardType;
    ttl?:             string;
    embeddingQueued?: boolean;
    fromRedis?:       boolean;
  } = {}
): HCACard {
  const sentences   = extractSentences(text, 2);
  const identifiers = extractIdentifiers(text);

  let summary = sentences.join(' ');
  if (identifiers.length > 0) {
    const keySymbols = identifiers.slice(0, 5).join(', ');
    summary += ` Key: ${keySymbols}.`;
  }

  // Hard trim to MAX_CHARS
  if (summary.length > MAX_CHARS) {
    summary = summary.slice(0, MAX_CHARS - 1) + '…';
  }

  return {
    key,
    type:                opts.type ?? 'prior-answer',
    summary128:          summary,
    source,
    ttl:                 opts.ttl ?? '6h',
    embeddingQueued:     opts.embeddingQueued ?? false,
    fromRedis:           opts.fromRedis ?? false,
    queuedForEmbedding:  opts.embeddingQueued ?? false,
    aceTags:             identifiers.slice(0, 5),
    summaryTokensTarget: TARGET_TOKENS,
  };
}

/** Format the card as a context snippet for injection into Gemma4's prompt. */
export function hcaCardToContextSnippet(card: HCACard): string {
  return (
    `[Prior answer — ${card.source} | ${card.ttl} TTL]\n` +
    `${card.summary128}\n` +
    `(Full answer cached at ${card.key})`
  );
}

/** Estimate token count of a HCA card (for KV budget tracking). */
export function hcaCardTokens(card: HCACard): number {
  return Math.ceil(card.summary128.length / CHARS_PER_TOKEN);
}
