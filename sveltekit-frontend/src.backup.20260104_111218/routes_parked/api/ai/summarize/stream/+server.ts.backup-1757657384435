
import type { RequestHandler } from './$types';

const SUMMARIZER_BASE =
  import.meta.env.SUMMARIZER_BASE_URL || "http://localhost:8091";

export const POST: RequestHandler = async ({ request }) => {
  let payload: any;
  try {
    payload = await request.json();
  } catch {
    return new Response(JSON.stringify({ ok: false, error: "invalid json" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  const upstream = await fetch(`${SUMMARIZER_BASE}/summarize/stream`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  }).catch((e: any) => {
    const msg = e instanceof Error ? e.message : "upstream error";
    return new Response(JSON.stringify({ ok: false, error: msg }), {
      status: 502,
      headers: { "content-type": "application/json" },
    }) as any as Response;
  });

  if (!(upstream instanceof Response)) {
    return new Response(
      JSON.stringify({ ok: false, error: "failed to reach summarizer" }),
      {
        status: 502,
        headers: { "content-type": "application/json" },
      }
    );
  }

  const headers = new Headers(upstream.headers);
  headers.set("content-type", "text/event-stream");
  headers.set("cache-control", "no-cache");
  headers.set("connection", "keep-alive");
  headers.set("x-accel-buffering", "no");

  return new Response(upstream.body, {
    status: upstream.status,
    headers,
  });
};
