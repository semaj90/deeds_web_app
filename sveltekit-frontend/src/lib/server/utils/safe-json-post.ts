export type NormalizedApiError = {
  message: string;
  code: string;
  details?: unknown;
};

export function normalizeApiError(err: unknown): NormalizedApiError {
  if (err instanceof Error) {
    return {
      message: err.message,
      code: err.name || 'ERROR',
      details: err.stack,
    };
  }
  if (typeof err === 'string') {
    return { message: err, code: 'STRING_ERROR' };
  }
  return { message: 'Unknown error', code: 'UNKNOWN_ERROR', details: err };
}

async function readLimitedText(res: Response, maxBytes: number): Promise<string> {
  const body: any = (res as any).body;
  if (!body || typeof body.getReader !== 'function') {
    const txt = await res.text();
    if (txt.length > maxBytes) throw new Error(`Response too large: ${txt.length} bytes > ${maxBytes}`);
    return txt;
  }

  const reader = body.getReader();
  const decoder = new TextDecoder();
  let total = 0;
  let out = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk: Uint8Array = value;
    total += chunk.byteLength;
    if (total > maxBytes) {
      try { await reader.cancel(); } catch {}
      throw new Error(`Response too large: ${total} bytes > ${maxBytes}`);
    }
    out += decoder.decode(chunk, { stream: true });
  }
  out += decoder.decode();
  return out;
}

export async function safeJsonPost<T>(
  url: string,
  payload: unknown,
  opts: {
    timeoutMs?: number;
    maxResponseBytes?: number;
    fallback?: T;
  } = {}
): Promise<T | undefined> {
  const timeoutMs = opts.timeoutMs ?? 20_000;
  const maxResponseBytes = opts.maxResponseBytes ?? 2_000_000;

  let body: string;
  try {
    body = JSON.stringify(payload);
  } catch (err) {
    console.error('[safeJsonPost] JSON.stringify failed', { url, error: String(err) });
    return opts.fallback;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json',
      },
      body,
      signal: controller.signal,
    });

    let text: string;
    try {
      text = await readLimitedText(res, maxResponseBytes);
    } catch (err) {
      console.error('[safeJsonPost] readLimitedText failed', { url, error: String(err) });
      return opts.fallback;
    }

    if (!res.ok) {
      console.error('[safeJsonPost] HTTP error', {
        url,
        status: res.status,
        statusText: res.statusText,
        preview: text.slice(0, 500),
      });
      return opts.fallback;
    }

    try {
      return JSON.parse(text) as T;
    } catch (err) {
      console.error('[safeJsonPost] JSON.parse failed', {
        url,
        error: String(err),
        preview: text.slice(0, 500),
      });
      return opts.fallback;
    }
  } catch (err) {
    console.error('[safeJsonPost] fetch failed', { url, error: String(err) });
    return opts.fallback;
  } finally {
    clearTimeout(timer);
  }
}

export default safeJsonPost;
