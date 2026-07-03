#!/usr/bin/env node
/**
 * Hardened Gemma4 Summary Sanitizer
 *
 * Removes reasoning markers and training tokens one-at-a-time with detailed tracking.
 * Each marker type is tested independently for safe removal.
 *
 * Marker types:
 *   - end_of_turn: <end_of_turn> (training marker)
 *   - start_of_turn: <start_of_turn> (training marker)
 *   - control_tokens: <|...|> (Gemma4 control tokens like <|turn>, <|think|>)
 *   - thinking_blocks: <thinking>...</thinking> (reasoning/chain-of-thought)
 *   - special_tokens: <bos>, <eos>, <pad>, <unk> (tokenizer special tokens)
 */

/**
 * Strip reasoning markers from Gemma4 output
 * Returns: { summary: cleaned, markersCleaned: [], markersFailed: [] }
 */
export function sanitizeGemma4Summary(raw) {
  if (!raw || typeof raw !== 'string') {
    return { summary: '', markersCleaned: [], markersFailed: [] };
  }

  let cleaned = raw;
  const markersCleaned = [];
  const markersFailed = [];

  // Test each marker type independently
  const markerTests = [
    {
      name: 'end_of_turn',
      pattern: /<end_of_turn>/gi,
      description: 'Training marker <end_of_turn>'
    },
    {
      name: 'start_of_turn',
      pattern: /<start_of_turn>/gi,
      description: 'Training marker <start_of_turn>'
    },
    {
      name: 'turn_marker',
      pattern: /<turn\|?>/gi,
      description: 'Turn boundary marker <turn|>'
    },
    {
      name: 'control_tokens',
      pattern: /<\|[a-z_]+\|?>/gi,
      description: 'Control tokens like <|turn>, <|think|>'
    },
    {
      name: 'thinking_open',
      pattern: /<thinking>/gi,
      description: 'Thinking block open <thinking>'
    },
    {
      name: 'thinking_close',
      pattern: /<\/thinking>/gi,
      description: 'Thinking block close </thinking>'
    },
    {
      name: 'bos',
      pattern: /<bos>/gi,
      description: 'Beginning of sequence token'
    },
    {
      name: 'eos',
      pattern: /<eos>/gi,
      description: 'End of sequence token'
    },
    {
      name: 'pad',
      pattern: /<pad>/gi,
      description: 'Padding token'
    },
    {
      name: 'unk',
      pattern: /<unk>/gi,
      description: 'Unknown token'
    }
  ];

  // Apply each test independently
  for (const test of markerTests) {
    try {
      if (test.pattern.test(cleaned)) {
        cleaned = cleaned.replace(test.pattern, '');
        markersCleaned.push(test.name);
      }
    } catch (err) {
      markersFailed.push({
        marker: test.name,
        error: err.message
      });
    }
  }

  // Normalize whitespace
  cleaned = cleaned
    .replace(/\s+/g, ' ')  // Multiple spaces → single space
    .replace(/\s+([.,!?])/g, '$1')  // Space before punctuation
    .trim();

  return {
    summary: cleaned,
    markersCleaned,
    markersFailed,
    lengthBefore: raw.length,
    lengthAfter: cleaned.length
  };
}

/**
 * Check if a summary is usable (meets minimum quality thresholds)
 *
 * Criteria:
 *   - Length >= minLength (default 30 chars)
 *   - Unique words >= minUniqueWords (default 6)
 *   - Not empty or whitespace-only
 *   - Contains at least 2 non-special characters
 */
export function isUsableGemma4Summary(summary, options = {}) {
  const {
    minLength = 30,
    minUniqueWords = 6,
    maxLength = 5000
  } = options;

  if (!summary || typeof summary !== 'string') {
    return false;
  }

  const trimmed = summary.trim();
  if (trimmed.length < minLength || trimmed.length > maxLength) {
    return false;
  }

  // Count unique words (simple: split on whitespace)
  const words = trimmed.toLowerCase().split(/\s+/);
  const uniqueWords = new Set(words);
  if (uniqueWords.size < minUniqueWords) {
    return false;
  }

  // Ensure not all single character or punctuation
  const letters = trimmed.match(/[a-zA-Z0-9]/g) || [];
  if (letters.length < 10) {
    return false;
  }

  return true;
}

/**
 * Detailed contamination report for a summary
 * Used for testing and debugging
 */
export function analyzeContamination(summary) {
  if (!summary || typeof summary !== 'string') {
    return { isClean: true, contaminants: [], totalMatches: 0 };
  }

  const contaminants = [];
  const patterns = [
    { name: 'end_of_turn', regex: /<end_of_turn>/gi },
    { name: 'start_of_turn', regex: /<start_of_turn>/gi },
    { name: 'turn_marker', regex: /<turn\|?>/gi },
    { name: 'control_tokens', regex: /<\|[a-z_]+\|?>/gi },
    { name: 'thinking', regex: /<\/?thinking>/gi },
    { name: 'bos', regex: /<bos>/gi },
    { name: 'eos', regex: /<eos>/gi },
    { name: 'pad', regex: /<pad>/gi },
    { name: 'unk', regex: /<unk>/gi }
  ];

  let totalMatches = 0;

  for (const pattern of patterns) {
    const matches = (summary.match(pattern.regex) || []).length;
    if (matches > 0) {
      contaminants.push({
        type: pattern.name,
        count: matches,
        example: (summary.match(pattern.regex) || [])[0]
      });
      totalMatches += matches;
    }
  }

  return {
    isClean: contaminants.length === 0,
    contaminants,
    totalMatches
  };
}
