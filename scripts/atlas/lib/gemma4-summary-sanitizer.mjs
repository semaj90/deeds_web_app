const LEAK_PATTERNS = [
  /<\|channel\|>\s*(analysis|thought|reasoning)\b/i,
  /<\|channel\>\s*(analysis|thought|reasoning)\b/i,
  /<channel\|>/i,
  /<\|start\|>\s*(analysis|thought|reasoning)\b/i,
  /<start_of_turn>/i,
  /<end_of_turn>/i,
  /<\s*start\s+of\s+turn\s*>/i,
  /<\s*end\s+of\s+turn\s*>/i,
  /<\|message\|>/i,
  /<\|end\|>/i,
  /<\|endthinking\|?>/i,
  /<think\b[^>]*>/i,
  /<thinking\b[^>]*>/i,
  /<\/think>/i,
  /<\/thinking>/i,
  /<\s*bos\s*>/i,
  /<\s*eos\s*>/i,
  /\bwe need answer\b/i,
  /\bwe need to\b/i,
  /\blet me\b/i,
  /\bthe user asks\b/i,
  /\bthe user wants\b/i,
  /\bprovided code snippet\b/i,
  /\banalyze the code\b/i,
  /\bi need to\b/i,
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

const META_PHRASE_RE = [
  /\b(i\s+see\s+you['’]?re|i\s+see\s+that|let\s+me(?:\s+(?:tie|clarify|know|summarize|address|check))?|we\s+need\s+to|the\s+user\s+(?:wants|asked|asks|is\s+asking|is\s+looking)|here['’]s\s+(?:a\s+)?(?:summary|thinking|analysis|breakdown)|to\s+clarify)\b[^.?!]*(?:[.?!]\s*)?/gi,
];

function normalizeGemmaMarkers(value) {
  return String(value ?? '')
    .replace(/<\|channel\>\s*(analysis|thought|reasoning)\s*<channel\|>/gi, '')
    .replace(/<\|channel\>\s*(final|commentary)\s*<channel\|>/gi, '')
    .replace(/<\|endthinking\|?>/gi, '')
    .replace(/<\|thinking\|?>/gi, '');
}

function removeTransportTags(value) {
  return String(value ?? '')
    .split(/<end_of_turn>\s*<start_of_turn>\s*user/i)[0]
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

function filterMetaLines(value) {
  let text = String(value ?? '')
    .replace(/\r/g, '')
    .replace(/^\s*(the\s+)?user\s+(wants|asked|asks|is asking|is looking)[^.?!]*(?:[.?!]\s*)+/gim, '')
    .replace(/^\s*(the\s+)?provided\s+code\s+snippet[^.?!]*(?:[.?!]\s*)+/gim, '')
    .replace(/^\s*(i\s+need|we\s+need|let me|let'?s)[^.?!]*(?:[.?!]\s*)+/gim, '')
  for (const pattern of META_PHRASE_RE) {
    text = text.replace(pattern, '');
  }
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => {
      if (!line) return false;
      if (META_LINE_RE.some((pattern) => pattern.test(line))) return false;
      return true;
    })
    .join('\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function stripGemma4ChannelBlocks(value) {
  let text = normalizeGemmaMarkers(value);
  text = text.replace(CHANNEL_BLOCK_RE, '');
  text = text.replace(/<think\b[^>]*>[\s\S]*?<\/think>/gi, '');
  text = text.replace(/<thinking\b[^>]*>[\s\S]*?<\/thinking>/gi, '');
  return filterMetaLines(removeTransportTags(text));
}

export function hasGemma4ReasoningLeak(value) {
  const text = String(value ?? '');
  return LEAK_PATTERNS.some((pattern) => pattern.test(text));
}

export function sanitizeGemma4Summary(value) {
  const raw = String(value ?? '').trim();
  const stripped = stripGemma4ChannelBlocks(raw);
  const stillLeaky = hasGemma4ReasoningLeak(stripped);
  return {
    raw,
    summary: stripped,
    changed: stripped !== raw,
    leaky: stillLeaky || hasGemma4ReasoningLeak(raw),
    safe: Boolean(stripped) && !stillLeaky,
  };
}

export function isUsableGemma4Summary(value, options = {}) {
  const minLength = Number(options.minLength ?? 40);
  const minUniqueWords = Number(options.minUniqueWords ?? 8);
  const sanitized = sanitizeGemma4Summary(value);
  if (!sanitized.safe) return false;
  if (sanitized.summary.length < minLength) return false;
  const uniqueWords = new Set(sanitized.summary.toLowerCase().match(/[a-z0-9_.$/-]{3,}/g) ?? []);
  return uniqueWords.size >= minUniqueWords;
}
