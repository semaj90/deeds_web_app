/**
 * Ornith 1.5 / Qwen-family summary sanitizer.
 *
 * Copy of gemma4-summary-sanitizer.mjs with three changes:
 *   - ChatML tokens (<|im_start|>, <|im_end|>, <|endoftext|>) are stripped and flagged as leaks.
 *   - Meta-phrase and meta-line filters stay on one line. The Gemma copy let `[^.?!]*` and `\s*`
 *     cross newlines, which deleted sentences mid-line and joined markdown headings into one line.
 *   - Meta-line filtering is an explicit opt-in (`dropMetaLines`, default false) so legal
 *     "Note:" / "Important:" content is kept unless a caller asks for it to be dropped.
 *   - Reasoning-phrase leak patterns only match at the start of a line. Ordinary legal prose that
 *     says "let me" or "we need to" mid-sentence is not a leak.
 *
 * The Gemma4 module and its callers are unchanged.
 */

const LEAK_PATTERNS = [
  /<\|channel\|>\s*(analysis|thought|reasoning)\b/i,
  /<\|channel\>\s*(analysis|thought|reasoning)\b/i,
  /<channel>/i,
  /<\|start\|>\s*(analysis|thought|reasoning)\b/i,
  /<start_of_turn>/i,
  /<end_of_turn>/i,
  /<\s*start\s+of\s+turn\s*>/i,
  /<\s*end\s+of\s+turn\s*>/i,
  /<\|message\|>/i,
  /<\|end\|>/i,
  /<\|im_start\|>/i,
  /<\|im_end\|>/i,
  /<\|endoftext\|>/i,
  /<\|endthinking\/?>/i,
  /<think\b[^>]*>/i,
  /<thinking\b[^>]*>/i,
  /<\/think>/i,
  /<\/thinking>/i,
  /<\s*bos\s*>/i,
  /<\s*eos\s*>/i,
  /\bwe need answer\b/i,
  /^\s*(we need to|let me|the user (asks|wants)|i need to)\b/im,
  /\bprovided code snippet\b/i,
  /\banalyze the code\b/i,
  /\blet'?s craft\b/i,
  /^\s*(analysis|thought|reasoning)\s*:/i,
];

const CHANNEL_BLOCK_RE =
  /<\|channel\|>\s*(analysis|thought|reasoning)\b[\s\S]*?(?=<\|channel\|>\s*(final|commentary)\b|<\|start\|>\s*(final|commentary)\b|$)/gi;

const META_LINE_RE = [
  /^\s*(here'?s|here is)\s+(a\s+)?(thinking|summary|breakdown|analysis)/i,
  /^\s*(the\s+)?user\s+(wants|asked|asks|is asking|is looking)/i,
  /^\s*(i\s+need|we\s+need|let me|let'?s)\b/i,
  /^\s*(the\s+)?provided\s+code\s+snippet\b/i,
  /^\s*(analy[sz]e|analysis|plan|reasoning|thought|approach|output|note|important)\s*:/i,
  /^\s*(step\s*)?\d+\.\s+(\*\*)?(identify|analy[sz]e|break|define|note|step|first|then|finally|check|look)/i,
  /^\s*[-*]\s+(identify|analy[sz]e|break|define|note|step|first|then|finally|check|look)\b/i,
  /^\s*(the\s+)?code\s+is\s*:/i,
  /^\s*final\s+(answer|summary|plan)\s*:/i,
];

// Line-start only (`m` flag): a phrase is removed only when it opens a line, so mid-sentence
// legal prose stays intact. `[^.?!\n]` keeps the match on one line.
const META_PHRASE_RE = [
  /^[ \t]*(i\s+see\s+you['’]?re|i\s+see\s+that|let\s+me(?:[ \t]+(?:tie|clarify|know|summarize|address|check|think))?|we\s+need\s+to|the\s+user\s+(?:wants|asked|asks|is\s+asking|is\s+looking)|here['’]s\s+(?:a[ \t]+)?(?:summary|thinking|analysis|breakdown)|to\s+clarify)\b[^.?!\n]*(?:[.?!][ \t]*)?/gim,
];

function normalizeOrnithMarkers(value) {
  return String(value ?? '')
    .replace(/<\|channel\>\s*(analysis|thought|reasoning)\s*<channel\|>/gi, '')
    .replace(/<\|channel\>\s*(final|commentary)\s*<channel\|>/gi, '')
    .replace(/<\|endthinking\|?>/gi, '')
    .replace(/<\|thinking\|?>/gi, '');
}

function removeTransportTags(value) {
  return String(value ?? '')
    .split(/<end_of_turn>\s*<start_of_turn>\s*user/i)[0]
    .replace(/<\|im_start\|>\s*(system|user|assistant)?/gi, '')
    .replace(/<\|im_end\|>/gi, '')
    .replace(/<\|endoftext\|>/gi, '')
    .replace(/<start_of_turn>\s*(user|model|assistant|system)?/gi, '')
    .replace(/<\s*start\s+of\s+turn\s*>/gi, '')
    .replace(/<\s*end\s+of\s+turn\s*>/gi, '')
    .replace(/<\s*bos\s*>/gi, '')
    .replace(/<\s*eos\s*>/gi, '')
    .replace(/<end_of_turn>/gi, '')
    .replace(/<\|channel\|>\s*(final|commentary|analysis|thought|reasoning)?/gi, '')
    .replace(/<\|start\|>\s*(final|commentary|analysis|thought|reasoning)?/gi, '')
    .replace(/<\|message\|>/gi, '')
    .replace(/<\|end\|>/gi, '')
    .replace(/<channel\|>/gi, '')
    .replace(/<\/?thinking>/gi, '')
    .replace(/<\/?think>/gi, '');
}

// Reasoning phrases always go: they are leaks, not content. `dropMetaLines` only controls the
// structural META_LINE_RE drop, which also catches legal "Note:" / "Important:" lines.
function filterMetaLines(value, { dropMetaLines }) {
  let text = String(value ?? '')
    .replace(/\r/g, '')
    .replace(/^[ \t]*(the[ \t]+)?user[ \t]+(wants|asked|asks|is asking|is looking)[^.?!\n]*(?:[.?!][ \t]*)+/gim, '')
    .replace(/^[ \t]*(the[ \t]+)?provided[ \t]+code[ \t]+snippet[^.?!\n]*(?:[.?!][ \t]*)+/gim, '')
    .replace(/^[ \t]*(i[ \t]+need|we[ \t]+need|let me|let'?s)[^.?!\n]*(?:[.?!][ \t]*)+/gim, '');
  for (const pattern of META_PHRASE_RE) {
    text = text.replace(pattern, '');
  }
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => {
      if (!line) return false;
      if (dropMetaLines && META_LINE_RE.some((pattern) => pattern.test(line))) return false;
      return true;
    })
    .join('\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function stripOrnithChannelBlocks(value, options = {}) {
  const dropMetaLines = options.dropMetaLines ?? false;
  let text = normalizeOrnithMarkers(value);
  text = text.replace(CHANNEL_BLOCK_RE, '');
  text = text.replace(/<think\b[^>]*>[\s\S]*?<\/think>/gi, '');
  text = text.replace(/<thinking\b[^>]*>[\s\S]*?<\/thinking>/gi, '');
  return filterMetaLines(removeTransportTags(text), { dropMetaLines });
}

export function hasOrnithReasoningLeak(value) {
  const text = String(value ?? '');
  return LEAK_PATTERNS.some((pattern) => pattern.test(text));
}

// A reasoning block opened but never closed (reply cut off by max_tokens) cannot be stripped
// reliably. Its body is reasoning, not an answer, so the whole reply is unsafe.
function hasUnclosedReasoning(text) {
  const opened = /<think\b[^>]*>/i.test(text) || /<thinking\b[^>]*>/i.test(text);
  const closed = /<\/think>/i.test(text) || /<\/thinking>/i.test(text);
  const channelOpened = /<\|channel\|>\s*(analysis|thought|reasoning)\b/i.test(text);
  const channelFinal = /<\|channel\|>\s*(final|commentary)\b/i.test(text);
  return (opened && !closed) || (channelOpened && !channelFinal);
}

export function sanitizeOrnithSummary(value, options = {}) {
  const raw = String(value ?? '').trim();
  const unclosed = hasUnclosedReasoning(raw);
  const stripped = unclosed ? '' : stripOrnithChannelBlocks(raw, options);
  const stillLeaky = hasOrnithReasoningLeak(stripped);
  return {
    raw,
    summary: stripped,
    changed: stripped !== raw,
    leaky: stillLeaky || hasOrnithReasoningLeak(raw),
    safe: Boolean(stripped) && !stillLeaky && !unclosed,
  };
}

export function isUsableOrnithSummary(value, options = {}) {
  const minLength = Number(options.minLength ?? 40);
  const minUniqueWords = Number(options.minUniqueWords ?? 8);
  const sanitized = sanitizeOrnithSummary(value, options);
  if (!sanitized.safe) return false;
  if (sanitized.summary.length < minLength) return false;
  const uniqueWords = new Set(sanitized.summary.toLowerCase().match(/[a-z0-9_.$/-]{3,}/g) ?? []);
  return uniqueWords.size >= minUniqueWords;
}
