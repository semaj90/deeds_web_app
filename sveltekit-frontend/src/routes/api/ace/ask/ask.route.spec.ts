import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST } from './+server.js';

vi.mock('$lib/server/auth-utils.js', () => ({
  requireUser: vi.fn(),
}));

vi.mock('$lib/server/ace/ace-script-runner-v1.js', () => ({
  runAceScriptV1: vi.fn(async (script: string, query: string) => {
    if (query === 'trigger-failure') throw new Error('Simulated runner failure');
    return { stdout: `Answer for ${query}` };
  }),
}));

function makeEvent(body: unknown) {
  const req = new Request('http://localhost/api/ace/ask', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
  return {
    request: req,
    locals: { user: { id: 'test-user', email: 'user@example.com' } },
  } as any;
}

describe('POST /api/ace/ask route hardening', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 200 with result on valid query', async () => {
    const res = await POST(makeEvent({ query: 'What is a deed of trust?' }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.result).toBe('Answer for What is a deed of trust?');
  });

  it('returns 400 when query is empty', async () => {
    const res = await POST(makeEvent({ query: '   ' }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe('Validation failed');
  });

  it('returns 400 when query exceeds 4096 characters', async () => {
    const largeQuery = 'a'.repeat(4097);
    const res = await POST(makeEvent({ query: largeQuery }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe('Validation failed');
  });

  it('returns 400 when body is not valid JSON', async () => {
    const res = await POST(makeEvent('{ invalid json'));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe('Invalid JSON body');
  });

  it('returns 500 without leaking internal details when script fails', async () => {
    const res = await POST(makeEvent({ query: 'trigger-failure' }));
    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.error).toBe('Ask failed');
    expect(data.details).toBe('Script execution failed or timed out');
  });
});
