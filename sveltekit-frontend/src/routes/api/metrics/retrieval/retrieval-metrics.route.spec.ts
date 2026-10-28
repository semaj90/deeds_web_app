// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import { GET } from './+server.js';

const summary = vi.hoisted(() => vi.fn(async () => ({ p50: 1 })));
vi.mock('$lib/server/telemetry/retrieval-metrics.js', () => ({ getRetrievalMetricsSummary: summary }));

const call = (locals: unknown) =>
  GET({ url: new URL('http://localhost/api/metrics/retrieval?hours=999'), locals } as any);

describe('GET /api/metrics/retrieval', () => {
  it('401 without a session, and never reads metrics', async () => {
    const res = await call({ user: null });
    expect(res.status).toBe(401);
    expect(summary).not.toHaveBeenCalled();
  });

  it('200 with a session and clamps hours to 72', async () => {
    const res = await call({ user: { id: 1 } });
    expect(res.status).toBe(200);
    expect(summary).toHaveBeenCalledWith(undefined, 72);
  });
});
