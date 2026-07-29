const DEFAULT_STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with',
  'by', 'from', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'as', 'if', 'into',
  'that', 'this', 'these', 'those', 'it', 'its', 'they', 'them', 'we', 'you', 'i',
]);

export function splitIdentifier(value) {
  const text = String(value ?? '').trim();
  if (!text) return [];
  return text
    .replace(/[^A-Za-z0-9_./-]+/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/[\s/_./-]+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

export function tokenizeCodeAware(input, options = {}) {
  const stopwords = options.stopwords ?? DEFAULT_STOPWORDS;
  const tokens = new Set();
  const raw = String(input ?? '');

  for (const rawPart of raw.split(/[\r\n\t ]+/)) {
    for (const part of splitIdentifier(rawPart)) {
      const lower = part.toLowerCase();
      if (lower.length < 2) continue;
      if (stopwords.has(lower)) continue;
      tokens.add(lower);
    }
  }

  return [...tokens];
}

export function buildTokenHistogram(text, options = {}) {
  const histogram = new Map();
  for (const token of tokenizeCodeAware(text, options)) {
    histogram.set(token, (histogram.get(token) ?? 0) + 1);
  }
  return histogram;
}

export function encodeSparseVector(text, registry, options = {}) {
  const histogram = buildTokenHistogram(text, options);
  const tokens = [...histogram.entries()];
  const maxTerms = options.maxTerms ?? 256;
  const indices = [];
  const values = [];

  for (const [token, frequency] of tokens.slice(0, maxTerms)) {
    const tokenId = registry.resolveTokenId(token);
    const weight = Math.log1p(frequency) * (registry.documentFrequency(token) > 0 ? 1 : 0.75);
    indices.push(tokenId);
    values.push(Number(weight.toFixed(6)));
  }

  return { indices, values, tokenCount: tokens.length };
}
