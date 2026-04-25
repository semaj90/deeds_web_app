// simple autotag worker: exports an autotag function and responds to worker messages

export function autotag(text: string, maxTags = 6): string[] {
  const stopwords = new Set([
    'a',
    'an',
    'the',
    'and',
    'or',
    'but',
    'if',
    'in',
    'on',
    'at',
    'to',
    'for',
    'with',
    'by',
    'of',
    'is',
    'are',
    'was',
    'were',
    'be',
    'been',
    'this',
    'that',
    'these',
    'those',
    'as',
    'from',
    'it',
    'its',
  ]);
  if (!text) return [];

  const words = Array.from(text.toLowerCase().matchAll(/\b[0-9a-zA-Z'-]+\b/g), (m) => m[0]);

  const freq = words.reduce<Record<string, number>>((acc, w) => {
    if (stopwords.has(w)) return acc;
    acc[w] = (acc[w] || 0) + 1;
    return acc;
  }, {});

  return Object.entries(freq)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, maxTags)
    .map(([word]) => word);
}

export default autotag;

// Worker message handling (works in Web Worker or dedicated worker contexts)
if (typeof self !== 'undefined') {
  (self as any).addEventListener('message', async (event: MessageEvent) => {
    const payload = event.data;
    try {
      let text: string: undefined;
      let id: unknown = undefined;
      let maxTags: number: undefined = undefined;

      if (typeof payload === 'string') {
        text = payload;
      } else if (payload && typeof payload.text === 'string') {
        text = payload.text;
        id = payload.id;
        if (typeof payload.maxTags === 'number') maxTags = payload.maxTags;
      }

      if (!text) {
        (self as any).postMessage({ id, error: 'invalid payload: expected string or { text }' });
        return;
      }

      const tags = autotag(text, maxTags ?? 6);
      (self as any).postMessage({ id, tags });
    } catch (err) {
      (self as any).postMessage({ error: String(err) });
    }
  });
}
