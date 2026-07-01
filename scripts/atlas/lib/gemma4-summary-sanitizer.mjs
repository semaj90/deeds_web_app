const LEAK_PATTERNS = [
  /<\|channel\|>\s*(analysis|thought|reasoning)\b/i,
  /<\|start\|>\s*(analysis|thought|reasoning)\b/i,
  /<\|message\|>/i,
  /<\|end\|>/i,
  /<think\b[^>]*>/i,
  /<\/think>/i,
  /\bwe need answer\b/i,
  /\bthe user asks\b/i,
  /\bi need to\b/i,
  /\blet'?s craft\b/i,
  /^\s*(analysis|thought|reasoning)\s*:/i,
];

const CHANNEL_BLOCK_RE =
  /<\|channel\|>\s*(analysis|thought|reasoning)\b[\s\S]*?(?=<\|channel\|>\s*(final|commentary)\b|<\|start\|>\s*(final|commentary)\b|$)/gi;

export function stripGemma4ChannelBlocks(value) {
  let text = String(value ?? '');
  text = text.replace(CHANNEL_BLOCK_RE, '');
  text = text.replace(/<\|channel\|>\s*(final|commentary)\b/gi, '');
  text = text.replace(/<\|start\|>\s*(final|commentary)\b/gi, '');
  text = text.replace(/<\|message\|>/gi, '');
  text = text.replace(/<\|end\|>/gi, '');
  text = text.replace(/<think\b[^>]*>[\s\S]*?<\/think>/gi, '');
  return text.trim();
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
