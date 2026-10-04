// @vitest-environment node
/**
 * Hermetic contract tests for GET /api/health/database (DB-READY-TESTS-01).
 * Postgres is fully mocked: SQLSTATE 57P03 must report `starting` (retryable, HTTP 200),
 * never `unavailable`, and a real outage / auth failure must stay `unavailable`.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { execute, getPoolStatus, resetPoolHealth } = vi.hoisted(() => ({
  execute: vi.fn(),
  getPoolStatus: vi.fn(() => ({ poolHealthy: true })),
  resetPoolHealth: vi.fn(),
}));

vi.mock('$lib/server/db/client', () => ({
  db: { execute },
  getPoolStatus,
  resetPoolHealth,
}));

type Handler = (evt: { locals: Record<string, unknown> }) => Promise<Response>;
let GET: Handler;

const authed = { locals: { user: { id: '1' } } };

beforeEach(async () => {
  execute.mockReset();
  resetPoolHealth.mockReset();
  getPoolStatus.mockReset();
  getPoolStatus.mockReturnValue({ poolHealthy: true });
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  GET = (await import('../../../routes/api/health/database/+server.js')).GET as unknown as Handler;
});

describe('GET /api/health/database', () => {
  it('401 unavailable/UNAUTHORIZED without a user, and never touches the database', async () => {
    const res = await GET({ locals: {} });
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ status: 'unavailable', reason: 'UNAUTHORIZED', retryable: false });
    expect(execute).not.toHaveBeenCalled();
  });

  it('healthy when SELECT 1 succeeds', async () => {
    execute.mockResolvedValue([{ ok: 1 }]);
    const res = await GET(authed);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ status: 'healthy', reason: 'OK', sqlstate: null, retryable: false });
  });

  it('self-heals a degraded pool flag on success', async () => {
    getPoolStatus.mockReturnValue({ poolHealthy: false });
    execute.mockResolvedValue([{ ok: 1 }]);
    await GET(authed);
    expect(resetPoolHealth).toHaveBeenCalledTimes(1);
  });

  it('SQLSTATE 57P03 "starting up" => starting, retryable, HTTP 200', async () => {
    execute.mockRejectedValue(Object.assign(new Error('the database system is starting up'), { code: '57P03' }));
    const res = await GET(authed);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ status: 'starting', reason: 'STARTING_UP', sqlstate: '57P03', retryable: true });
  });

  it('Drizzle-wrapped 57P03 (pg error in .cause) => starting', async () => {
    const inner = Object.assign(new Error('the database system is starting up'), { code: '57P03' });
    execute.mockRejectedValue(Object.assign(new Error('Failed query: SELECT 1'), { cause: inner }));
    expect((await (await GET(authed)).json()).status).toBe('starting');
  });

  it('"in recovery mode" => starting', async () => {
    execute.mockRejectedValue(new Error('the database system is in recovery mode'));
    expect(await (await GET(authed)).json()).toMatchObject({ status: 'starting', reason: 'IN_RECOVERY' });
  });

  it('ECONNREFUSED => unavailable but retryable (not starting)', async () => {
    execute.mockRejectedValue(Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:5434'), { code: 'ECONNREFUSED' }));
    expect(await (await GET(authed)).json()).toMatchObject({ status: 'unavailable', reason: 'CONNECTION_REFUSED', retryable: true });
  });

  it('auth failure 28P01 => unavailable, non-retryable', async () => {
    execute.mockRejectedValue(Object.assign(new Error('password authentication failed'), { code: '28P01' }));
    expect(await (await GET(authed)).json()).toMatchObject({ status: 'unavailable', retryable: false });
  });

  it('degraded responses keep the same top-level keys as the success shape', async () => {
    execute.mockResolvedValueOnce([{ ok: 1 }]);
    const ok = Object.keys(await (await GET(authed)).json()).sort();
    execute.mockRejectedValueOnce(Object.assign(new Error('starting up'), { code: '57P03' }));
    const degraded = Object.keys(await (await GET(authed)).json()).sort();
    expect(degraded).toEqual(ok);
  });
});
