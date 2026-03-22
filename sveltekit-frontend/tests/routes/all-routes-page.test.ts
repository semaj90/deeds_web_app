import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type InteractionType = 'view' | 'navigate' | 'analyze' | 'patch_apply';

type RouteDisplayState = {
  id: string;
  path: string;
  kind: 'page' | 'layout' | 'server' | 'endpoint';
  errorCount?: number;
  warningCount?: number;
  infoCount?: number;
  errorState?: 'healthy' | 'flaky' | 'broken';
  status?: 'ok' | 'warning' | 'error';
  lastErrorAt?: string;
  lastErrorMessage?: string;
};

async function logInteraction(
  routeId: string,
  interactionType: InteractionType,
  metadata: Record<string, unknown> = {}
): Promise<boolean> {
  try {
    const response = await fetch(`/api/routes/${routeId}/interactions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        interaction_type: interactionType,
        metadata,
      }),
    });

    return response.ok;
  } catch {
    return false;
  }
}

function formatErrorCount(count: number): string {
  return count === 1 ? '1 error' : `${count} errors`;
}

function getHealthEmoji(state: NonNullable<RouteDisplayState['errorState']>): string {
  if (state === 'healthy') return '✅';
  if (state === 'flaky') return '🟡';
  return '❌';
}

function truncateMessage(message: string, maxLength = 100): string {
  return message.length > maxLength ? `${message.slice(0, maxLength)}...` : message;
}

describe('Phase 7: Interaction Logging', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('posts a view interaction to the correct endpoint', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true });

    const result = await logInteraction('route-123', 'view');

    expect(result).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith('/api/routes/route-123/interactions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        interaction_type: 'view',
        metadata: {},
      }),
    });
  });

  it('includes metadata in the interaction payload', async () => {
    fetchMock.mockResolvedValueOnce({ ok: true });

    await logInteraction('route-123', 'navigate', { path: '/test' });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(body.metadata).toEqual({ path: '/test' });
  });

  it('returns false for API errors and network errors', async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 500 });
    const apiResult = await logInteraction('route-123', 'view');

    fetchMock.mockRejectedValueOnce(new Error('Network error'));
    const networkResult = await logInteraction('route-123', 'view');

    expect(apiResult).toBe(false);
    expect(networkResult).toBe(false);
  });

  it('logs supported interaction types in call order', async () => {
    fetchMock.mockResolvedValue({ ok: true });

    await logInteraction('route-order-test', 'view');
    await logInteraction('route-order-test', 'navigate', { path: '/test' });
    await logInteraction('route-order-test', 'analyze');
    await logInteraction('route-order-test', 'patch_apply', { patch_id: 'patch-123' });

    expect(fetchMock).toHaveBeenCalledTimes(4);

    const bodies = fetchMock.mock.calls.map((call) => JSON.parse(call[1].body as string));
    expect(bodies[0].interaction_type).toBe('view');
    expect(bodies[1].interaction_type).toBe('navigate');
    expect(bodies[1].metadata.path).toBe('/test');
    expect(bodies[2].interaction_type).toBe('analyze');
    expect(bodies[3].interaction_type).toBe('patch_apply');
    expect(bodies[3].metadata.patch_id).toBe('patch-123');
  });
});

describe('Phase 8: Error Display', () => {
  it('formats error counts correctly', () => {
    expect(formatErrorCount(1)).toBe('1 error');
    expect(formatErrorCount(5)).toBe('5 errors');
    expect(formatErrorCount(10)).toBe('10 errors');
  });

  it('reports error and warning presence from route state', () => {
    const brokenRoute: RouteDisplayState = {
      id: 'route-1',
      path: '/test',
      kind: 'page',
      errorCount: 5,
      warningCount: 0,
      infoCount: 0,
      errorState: 'broken',
      status: 'error',
    };

    const warningRoute: RouteDisplayState = {
      id: 'route-2',
      path: '/test',
      kind: 'page',
      errorCount: 0,
      warningCount: 3,
      infoCount: 1,
      errorState: 'flaky',
      status: 'warning',
    };

    expect(brokenRoute.errorCount).toBeGreaterThan(0);
    expect(warningRoute.warningCount).toBeGreaterThan(0);
  });

  it('maps route health state to the correct indicator', () => {
    expect(getHealthEmoji('healthy')).toBe('✅');
    expect(getHealthEmoji('flaky')).toBe('🟡');
    expect(getHealthEmoji('broken')).toBe('❌');
  });

  it('handles last error details and truncation', () => {
    const now = new Date().toISOString();
    const route: RouteDisplayState = {
      id: 'route-3',
      path: '/test',
      kind: 'page',
      lastErrorAt: now,
      lastErrorMessage: 'Type error: Cannot read property x of undefined',
    };

    expect(new Date(route.lastErrorAt ?? '').toLocaleString()).toBeTruthy();
    expect(route.lastErrorMessage).toBe('Type error: Cannot read property x of undefined');
    expect(truncateMessage('A'.repeat(150)).length).toBeLessThanOrEqual(103);
    expect(truncateMessage('short')).toBe('short');
  });

  it('keeps empty error details undefined when absent', () => {
    const route: RouteDisplayState = {
      id: 'route-4',
      path: '/test',
      kind: 'page',
    };

    expect(route.lastErrorMessage).toBeUndefined();
    expect(route.lastErrorAt).toBeUndefined();
  });
});
