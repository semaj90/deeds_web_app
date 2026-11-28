// @vitest-environment node
// Access rules, exercised with explicit locals so the development login bypass plays no part.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { evaluateApiRouteAccess } from '$lib/server/auth/api-route-access';
import { A2A_TOOL_REQUIRED_PERMISSION, requiredA2aToolPermission } from '$lib/agent/tool-permissions';

const mocks = vi.hoisted(() => ({
  gateway: vi.fn(async () => ({ jsonrpc: '2.0', id: 1, result: { ok: true } })),
  clear: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
  names: ['packet.search', 'startup.briefing', 'topology.status', 'label.generator', 'learning.trainer', 'new.unlisted'],
}));

vi.mock('$lib/agent/register-tools', () => ({}));
vi.mock('$lib/agent/tool-registry', () => ({ getToolNames: () => mocks.names }));
vi.mock('$lib/agent/tool-gateway', () => ({ buildToolGatewayManifest: () => ({ result: { tools: [] } }), handleToolGatewayRequest: mocks.gateway }));
vi.mock('$lib/agent/tool-diagnostic', () => ({
  ToolDiagnostics: { logRequest: vi.fn(), logDispatch: vi.fn(), logResult: vi.fn(), getSummary: () => ({}), exportReport: () => ({}), getLog: () => [], clear: mocks.clear },
}));
vi.mock('$lib/server/observability/agent-trace-recorder', () => ({ recordAgentTrace: vi.fn(async () => undefined) }));
vi.mock('$lib/server/env.server', () => ({ ENV: { AGENT_TRACE_ENABLED: 'false' } }));
vi.mock('$lib/server/db/client', () => ({ db: { insert: mocks.insert, update: mocks.update, delete: mocks.remove, select: vi.fn() } }));

const user = (role: string) => ({ id: '7', role });
const ID = '00000000-0000-4000-8000-000000000001';

async function rpc(role: string | null, body: Record<string, unknown>) {
  const { POST } = await import('./rpc/+server.js');
  const response = await POST({
    request: new Request('http://localhost/api/agent/rpc', { method: 'POST', body: JSON.stringify({ jsonrpc: '2.0', id: 1, ...body }) }),
    locals: { user: role ? user(role) : null },
  } as never);
  return response.status;
}

describe('A2A route access', () => {
  beforeEach(() => vi.clearAllMocks());

  it('refuses anonymous callers', async () => {
    expect(await rpc(null, { method: 'tools/call', params: { name: 'packet.search' } })).toBe(401);
    expect(mocks.gateway).not.toHaveBeenCalled();
  });

  it.each([
    ['user', 'packet.search', 200], ['user', 'topology.status', 403], ['user', 'label.generator', 403], ['user', 'learning.trainer', 403],
    ['analyst', 'topology.status', 200], ['analyst', 'label.generator', 200], ['analyst', 'learning.trainer', 403], ['analyst', 'new.unlisted', 403],
    ['admin', 'learning.trainer', 200], ['admin', 'new.unlisted', 200], ['unknown-role', 'packet.search', 403],
  ])('%s calling %s gets %i, by tools/call and by direct method', async (role, tool, status) => {
    expect(await rpc(role, { method: 'tools/call', params: { name: tool } })).toBe(status);
    expect(await rpc(role, { method: tool })).toBe(status);
    expect(mocks.gateway).toHaveBeenCalledTimes(status === 200 ? 2 : 0);
  });

  it('limits diagnostics, including clear, to admins', async () => {
    expect(await rpc('analyst', { method: 'tools/diagnostics', params: { type: 'clear' } })).toBe(403);
    expect(mocks.clear).not.toHaveBeenCalled();
    expect(await rpc('admin', { method: 'tools/diagnostics', params: { type: 'clear' } })).toBe(200);
    expect(mocks.clear).toHaveBeenCalledOnce();
    const { GET } = await import('./rpc/+server.js');
    const get = async (query: string, role: string | null) =>
      (await GET({ url: new URL(`http://localhost/api/agent/rpc${query}`), locals: { user: role ? user(role) : null } } as never)).status;
    expect(await get('?diagnostic=log', 'user')).toBe(403);
    expect(await get('?diagnostic=log', 'admin')).toBe(200);
    expect(await get('', 'user')).toBe(200);
    expect(await get('', null)).toBe(401);
  });

  it('gives every registered gateway tool an explicit permission', async () => {
    const { readdirSync, readFileSync } = await import('node:fs');
    const { fileURLToPath } = await import('node:url');
    const directory = fileURLToPath(new URL('../../../lib/agent/tools/', import.meta.url));
    const registered = readdirSync(directory).filter((file) => file.endsWith('.tool.ts'))
      .flatMap((file) => [...readFileSync(directory + file, 'utf8').matchAll(/registerTool\(\s*'([^']+)'/g)].map((match) => match[1]));
    expect(Object.keys(A2A_TOOL_REQUIRED_PERMISSION).sort()).toEqual(registered.sort());
    expect(requiredA2aToolPermission('constructor')).toBe('code:write');
  });
});

describe('public and write routes', () => {
  beforeEach(() => vi.clearAllMocks());

  it('requires sign-in for opencode-dispatch', () => {
    expect(evaluateApiRouteAccess('/api/opencode-dispatch', null)).toEqual({ status: 401, error: 'Authentication required' });
  });

  it.each([
    ['../statutes/+server.js', 'POST'], ['../statutes/[id]/+server.js', 'PUT'], ['../statutes/[id]/+server.js', 'DELETE'], ['../glossary/+server.js', 'POST'],
  ])('%s %s is admin only and writes nothing when refused', async (modulePath, method) => {
    const modules = {
      '../statutes/+server.js': () => import('../statutes/+server.js'),
      '../statutes/[id]/+server.js': () => import('../statutes/[id]/+server.js'),
      '../glossary/+server.js': () => import('../glossary/+server.js'),
    } as Record<string, () => Promise<Record<string, any>>>;
    const handler = (await modules[modulePath]!())[method];
    const call = (role: string | null) => handler({
      params: { id: ID }, locals: { user: role ? user(role) : null },
      request: new Request('http://localhost/x', { method, body: method === 'DELETE' ? undefined : '{not json' }),
    }) as Promise<Response>;
    expect((await call(null)).status).toBe(401);
    expect((await call('user')).status).toBe(403);
    expect((await call('analyst')).status).toBe(403);
    expect(mocks.insert).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.remove).not.toHaveBeenCalled();
    // An admin gets past the access check (invalid JSON then yields 400; DELETE reaches the mocked database).
    expect([400, 500]).toContain((await call('admin')).status);
  });
});
