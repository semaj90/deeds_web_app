import { describe, expect, it, vi } from 'vitest';
import { DispatcherMiddleware } from './dispatcher-middleware.js';

describe('DispatcherMiddleware strict READ_ONLY', () => {
  it('suppresses audit, LangGraph persistence, and Engram writes and returns a receipt', async () => {
    const query = vi.fn();
    const connect = vi.fn(async () => ({ query, release: vi.fn() }));
    const recordObservation = vi.fn(async () => undefined);
    const applyHeadroom = vi.fn((state) => state);
    const applyToolResult = vi.fn(async ({ state, resultEnvelope }) => ({ result: resultEnvelope, updatedState: state }));
    const persistStateToDB = vi.fn(async () => undefined);
    const pool = { connect } as any;
    const engram = { recordObservation } as any;
    const langGraph = {
      applyHeadroom,
      applyToolResult,
      persistStateToDB,
      getConfig: () => ({ maxToolResultChars: 1000 }),
    } as any;
    const middleware = new DispatcherMiddleware(pool, engram, langGraph, true);
    const tool = middleware.wrap(async (_input, context) => {
      expect(context.policy.mode).toBe('READ_ONLY');
      return { content: [{ type: 'text', text: 'bounded read result' }] };
    }, 'atlas.query', 'session-read-only', 'READ_ONLY');

    const result = await tool({ query: 'known test query' }) as any;

    expect(connect).not.toHaveBeenCalled();
    expect(query).not.toHaveBeenCalled();
    expect(recordObservation).not.toHaveBeenCalled();
    expect(applyHeadroom).not.toHaveBeenCalled();
    expect(applyToolResult).not.toHaveBeenCalled();
    expect(persistStateToDB).not.toHaveBeenCalled();
    expect(result.read_only_side_effect_receipt).toMatchObject({
      executionMode: 'READ_ONLY', attemptedWrites: 2, committedWrites: 0,
      entries: expect.arrayContaining([
        expect.objectContaining({ subsystem: 'dispatcher-audit', committedWrites: 0 }),
        expect.objectContaining({ subsystem: 'engram', committedWrites: 0 }),
      ]),
    });
  });

  it('does not persist audit or Engram state when the strict read-only handler throws', async () => {
    const connect = vi.fn();
    const recordObservation = vi.fn();
    const middleware = new DispatcherMiddleware({ connect } as any, { recordObservation } as any, null, false);
    const tool = middleware.wrap(async () => { throw new Error('read failed'); }, 'atlas.query', 'session-error', 'READ_ONLY');

    await expect(tool({ query: 'failure' })).rejects.toThrow('read failed');
    expect(connect).not.toHaveBeenCalled();
    expect(recordObservation).not.toHaveBeenCalled();
  });
});
