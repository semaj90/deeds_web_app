const baseUrl = process.env.AGENT_OBSERVATION_URL ?? 'http://127.0.0.1:5173';
const url = new URL('/api/memory/claude-mem', baseUrl);
const sessionId = `smoke-${Date.now()}`;
const observationId = `obs-${Date.now()}`;

const payload = {
  source: 'claude-mem',
  ide: 'opencode',
  sessionId,
  observationId,
  projectPath: 'C:\\Users\\james\\Videos\\deeds-web-app',
  summary: 'Smoke observation for Claude-Mem/OpenCode ingestion.',
  tags: ['smoke', 'claude-mem', 'opencode'],
  sourceRefs: ['scripts/memory/smoke-claude-mem-api.mjs'],
  toolCalls: [{ tool: 'smoke', status: 'ok' }],
  rawJson: { smoke: true, note: 'claude-mem alias smoke' },
};

const res = await fetch(url, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(payload),
});

const text = await res.text();
let data;
try {
  data = JSON.parse(text);
} catch {
  throw new Error(`Non-JSON response (${res.status}): ${text.slice(0, 500)}`);
}

if (!res.ok || !data?.ok) {
  throw new Error(`Smoke failed (${res.status}): ${JSON.stringify(data)}`);
}

console.log(
  JSON.stringify(
    {
      status: res.status,
      postgres_id: data.postgres_id,
      qdrant_point_id: data.qdrant_point_id,
      redis_key: data.redis_key,
      degraded: data.degraded ?? false,
      degraded_reason: data.degraded_reason ?? null,
    },
    null,
    2
  )
);
