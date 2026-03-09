import type { RequestHandler } from '@sveltejs/kit';

function detectScript(text: string): string {
  if (!text) return 'unknown';

  const patterns: Record<string, RegExp> = {
    latin: /[A-Za-z\u00C0-\u024F]/g,
    cyrillic: /[\u0400-\u04FF]/g,
    arabic: /[\u0600-\u06FF\u0750-\u077F]/g,
    han: /[\u4E00-\u9FFF\u3400-\u4DBF]/g,
    hangul: /[\uAC00-\uD7AF]/g,
    devanagari: /[\u0900-\u097F]/g,
  };

  let best = 'unknown';
  let bestCount = 0;

  for (const [name, re] of Object.entries(patterns)) {
    const m = text.match(re);
    const count = m ? m.length : 0;
    if (count > bestCount) {
      best = name;
      bestCount = count;
    }
  }

  // If nothing matched, try a fallback for simple detection of numbers/punctuation
  if (best === 'unknown') {
    if (/\p{Script=Latin}/u.test(text)) return 'latin';
    return 'unknown';
  }

  return best;
}

export const POST: RequestHandler = async ({ request }) => {
  try {
    const body = await request.json().catch(() => ({}));
    const text = String((body && body.text) ?? '');
    const language = detectScript(text);

    return new Response(JSON.stringify({ ok: true, language, length: text.length }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: String(err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

export const GET: RequestHandler = async () => {
  // Simple health check for the endpoint
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
