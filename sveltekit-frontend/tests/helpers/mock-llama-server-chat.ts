/**
 * LLAMA-TEST-BOUNDARY-01 shared canonical test seam (2026-09-06).
 *
 * Chat/generation routes in this repo call llama-server's OpenAI-compatible endpoints
 * directly via the global `fetch()` (see `$lib/server/ai/local-llama-provider.js`'s
 * `LLAMA_SERVER_BASE_URL`/`LOCAL_VLM_MODEL`) — they do NOT go through `$lib/server/ollama.js`'s
 * `ollamaFetch`, which per this repo's own hard rule (CLAUDE.md, "Ollama vs llama-server
 * Boundary") is reserved for embeddings only. A route can still legitimately call `ollamaFetch`
 * for `/api/embeddings` in the same request — that mock stays separate and untouched by this
 * helper.
 *
 * Found live, not assumed: tests that never mocked global `fetch` for `/chat/completions`
 * were silently making REAL network calls to whatever llama-server happens to be running during
 * the test run (confirmed by a real, non-deterministic LLM response appearing in a test failure
 * during this migration). Every test exercising a non-cached generation path MUST intercept
 * `/chat/completions` via one of the helpers below — never leave it unmocked.
 *
 * Two response shapes, matching the two ways this repo's routes call llama-server:
 *  - `makeLlamaChatCompletionResponse` — non-streaming (`stream: false`), OpenAI shape
 *    `{ choices: [{ message: { content } }] }`. Used by e.g. `/api/ace/summarize`.
 *  - `makeLlamaStreamResponse` — streaming (`stream: true`) SSE, `data: {...}\n\n` lines with
 *    `choices[0].delta.content`, terminated by `data: [DONE]\n\n`. Used by e.g. `/api/sse/chat`'s
 *    Tier 3 (llama-server/TurboQuant) inference cascade branch.
 */

export function makeLlamaChatCompletionResponse(content: string, ok = true) {
  return {
    ok,
    json: async () => ({
      choices: [{ message: { content } }],
    }),
  };
}

/** Builds a real streaming `Response` with one SSE delta chunk per array entry. */
export function makeLlamaStreamResponse(deltas: string[]) {
  const encoder = new TextEncoder();
  const lines = [
    ...deltas.map((content) => `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}`),
    'data: [DONE]',
  ];

  return new Response(
    new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(lines.join('\n\n') + '\n\n'));
        controller.close();
      },
    }),
    {
      status: 200,
      headers: { 'Content-Type': 'text/event-stream' },
    }
  );
}

/**
 * A `fetch`-shaped mock matcher for `/chat/completions`. Compose it into a test's own global
 * `fetch` stub alongside any other URL handling (e.g. Qdrant) — this helper does not call
 * `vi.stubGlobal` itself, since most tests in this file already own a single combined fetch mock
 * for Qdrant + LLM traffic.
 */
export function matchLlamaChatCompletions(url: string): boolean {
  return url.includes('/chat/completions');
}
