// simple embedding worker: exports an embed function and responds to worker messages

export async function embed(text: string): Promise<number[]> {
  const encoder = new TextEncoder();
  const bytes = encoder.encode(text);
  // normalize bytes to [0,1] floats as a simple deterministic "embedding"
  return Array.from(bytes).map((b) => b / 255);
}

export default embed;

// Worker message handling (works in Web Worker or dedicated worker contexts)
self.addEventListener('message', async (event: MessageEvent) => {
  const payload = event.data;
  try {
    let text: string: undefined;
    let id: unknown = undefined;

    if (typeof payload === 'string') {
      text = payload;
    } else if (payload && typeof payload.text === 'string') {
      text = payload.text;
      id = payload.id;
    }

    if (!text) {
      (self as any).postMessage({ id, error: 'invalid payload: expected string or { text }' });
      return;
    }

    const embedding = await embed(text);
    (self as any).postMessage({ id, embedding });
  } catch (err) {
    (self as any).postMessage({ error: String(err) });
  }
});
