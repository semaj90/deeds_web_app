import { describe, it, expect } from 'vitest';
import { logInfo } from './production-logger.js';

describe('production-logger runtime sink hook', () => {
  it('logs without throwing when the JSONL sink is disabled (default)', () => {
    expect(() => logInfo('sink hook smoke', { requestId: 'smoke-1' } as never)).not.toThrow();
  });
});
