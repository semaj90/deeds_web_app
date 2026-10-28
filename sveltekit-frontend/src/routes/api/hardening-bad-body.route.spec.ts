// @vitest-environment node
// H1 hardening (docs/CODEBASE_DIRECTORY_MAP.md): routes that read request.json() must answer a
// malformed or wrongly-typed body with 400 before touching any backend.
import { describe, it, expect, vi } from 'vitest';

vi.mock('$lib/server/auth-utils.js', () => ({
  requireAdmin: vi.fn(),
  requireUser: vi.fn(),
  requireUserOrService: vi.fn(),
}));
vi.mock('$lib/server/db/client.js', () => ({ pool: { query: vi.fn() }, db: {} }));
vi.mock('$lib/server/env.server.js', () => ({ ENV: {} }));
vi.mock('$lib/server/atlas/ontology-resolution-boundary-postgres.js', () => ({
  resolveOntologyLabelV1: vi.fn(async () => ({})),
}));
vi.mock('$lib/server/redis.js', () => ({ getRedis: vi.fn(() => ({ get: vi.fn(), del: vi.fn() })) }));
vi.mock('$lib/server/embedding/embed.js', () => ({ embedText: vi.fn() }));
vi.mock('$lib/server/atlas/identity/packet-key-builder.js', () => ({ computePacketKey: vi.fn() }));
vi.mock('$lib/server/atlas/identity/packet-identity-resolver.js', () => ({
  resolveCanonicalPacketKey: vi.fn(),
}));
vi.mock('$lib/server/grpc/embedding-client.js', () => ({ generateSingleEmbedding: vi.fn() }));
vi.mock('$lib/server/vector/qdrant-manager.js', () => ({ qdrant: { client: {} } }));
vi.mock('$lib/server/llm/runtime-contract.js', () => ({ LLM_MODEL_ID: 'ornith-1.5-9b' }));
vi.mock('$lib/server/analytics/research-cache.js', () => ({}));
vi.mock('$lib/server/ollama.js', () => ({ embedOrChatFetch: vi.fn(), getLlamaGenerationEndpoint: vi.fn() }));
vi.mock('$lib/server/analytics/research-index.js', () => ({ buildResearchIndex: vi.fn() }));

function makeEvent(body: unknown) {
  const req = new Request('http://localhost/x', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
  return { request: req, locals: { user: { id: 1, role: 'admin' } } } as any;
}

const cases: Array<{ name: string; load: () => Promise<{ POST: (e: any) => Response | Promise<Response> }>; bad: unknown[] }> = [
  {
    name: 'admin/atlas/ontology-resolution',
    load: () => import('./admin/atlas/ontology-resolution/+server.js'),
    bad: ['{nope', {}, { label: '' }, { label: 5 }],
  },
  {
    name: 'admin/atlas/ontology-resolution/oak-search',
    load: () => import('./admin/atlas/ontology-resolution/oak-search/+server.js'),
    bad: ['{nope', {}, { query: '' }, { query: 'ok', limit: 'many' }],
  },
  {
    name: 'admin/batch-embeddings/embed',
    load: () => import('./admin/batch-embeddings/embed/+server.js'),
    bad: ['{nope', {}, { packetKey: 'p', text: '' }, { packetKey: 'p', text: 5 }],
  },
  {
    name: 'admin/parents-atlas/actions',
    load: () => import('./admin/parents-atlas/actions/+server.js'),
    bad: ['{nope', {}, { action: 'rm -rf' }, { action: 'compile-wiki', query: 5 }],
  },
  {
    name: 'cache/bitfrost-effectiveness',
    load: () => import('./cache/bitfrost-effectiveness/+server.js'),
    bad: ['{nope', {}, { action: 'drop' }, { action: 'record', layer: 'L9' }],
  },
  {
    name: 'analytics/research-topics',
    load: () => import('./analytics/research-topics/+server.js'),
    bad: ['{nope', {}, { action: 'delete-everything' }],
  },
];

describe('H1: bad request bodies are rejected with 400', () => {
  for (const c of cases) {
    it(c.name, async () => {
      const { POST } = await c.load();
      for (const body of c.bad) {
        const res = await POST(makeEvent(body));
        expect(res.status, `${c.name} <- ${JSON.stringify(body)}`).toBe(400);
      }
    });
  }
});
