// @vitest-environment node
/**
 * AGENTIC-FIX-SEC-01: callers must not be able to assign verification_status = 'passed'.
 * Query layer is mocked; no datastore is touched.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockUpdate } = vi.hoisted(() => ({ mockUpdate: vi.fn() }));
vi.mock('$lib/db/queries/route-health-queries.js', () => ({
  updatePatchVerificationStatus: mockUpdate,
}));

const PATCH_ID = '123e4567-e89b-42d3-a456-426614174000';
const ROUTE_ID = 'cases-overview';

type Handler = (evt: {
  request: Request;
  locals: Record<string, unknown>;
  params: Record<string, string>;
}) => Promise<Response>;

describe('PUT /api/routes/:routeId/error-brain-patch/:patchId', () => {
  let put: Handler;

  const req = (body: unknown) =>
    new Request('http://localhost/x', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  const authed = { user: { id: '1' } };

  beforeEach(async () => {
    vi.resetAllMocks();
    const mod = (await import(
      '../../../../../../src/routes/api/routes/[routeId]/error-brain-patch/[patchId]/+server.js'
    )) as unknown as { PUT: Handler };
    put = mod.PUT;
  });

  it('401 without a user', async () => {
    const res = await put({
      request: req({ verification_status: 'failed' }),
      locals: {},
      params: { routeId: ROUTE_ID, patchId: PATCH_ID },
    });
    expect(res.status).toBe(401);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('rejects a caller-supplied passed with VERIFICATION_RECEIPT_REQUIRED and never writes', async () => {
    const res = await put({
      request: req({ verification_status: 'passed', verification_message: 'trust me' }),
      locals: authed,
      params: { routeId: ROUTE_ID, patchId: PATCH_ID },
    });
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe('VERIFICATION_RECEIPT_REQUIRED');
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('ignores extra receipt-like fields: still rejects passed', async () => {
    const res = await put({
      request: req({ verification_status: 'passed', verified: true, receipt_id: 'abc' }),
      locals: authed,
      params: { routeId: ROUTE_ID, patchId: PATCH_ID },
    });
    expect(res.status).toBe(403);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('400 on an invalid status', async () => {
    const res = await put({
      request: req({ verification_status: 'verified' }),
      locals: authed,
      params: { routeId: ROUTE_ID, patchId: PATCH_ID },
    });
    expect(res.status).toBe(400);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('404 on a non-UUID patch id', async () => {
    const res = await put({
      request: req({ verification_status: 'failed' }),
      locals: authed,
      params: { routeId: ROUTE_ID, patchId: 'nope' },
    });
    expect(res.status).toBe(404);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('scopes the update to the route in the URL (route/patch mismatch yields 404)', async () => {
    mockUpdate.mockResolvedValue(undefined);
    const res = await put({
      request: req({ verification_status: 'failed' }),
      locals: authed,
      params: { routeId: ROUTE_ID, patchId: PATCH_ID },
    });
    expect(mockUpdate).toHaveBeenCalledWith(PATCH_ID, 'failed', undefined, ROUTE_ID);
    expect(res.status).toBe(404);
  });

  it('still allows failed and pending', async () => {
    for (const status of ['failed', 'pending'] as const) {
      mockUpdate.mockResolvedValue({
        id: PATCH_ID,
        verificationStatus: status,
        verificationTimestamp: null,
        verificationMessage: null,
      });
      const res = await put({
        request: req({ verification_status: status }),
        locals: authed,
        params: { routeId: ROUTE_ID, patchId: PATCH_ID },
      });
      expect(res.status).toBe(200);
      expect((await res.json()).verification_status).toBe(status);
    }
  });
});
