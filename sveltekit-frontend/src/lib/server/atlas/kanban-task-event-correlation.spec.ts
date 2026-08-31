import { describe, expect, it } from 'vitest';

import { parseKanbanTaskEventCorrelationPayload } from './kanban-task-event-contracts.js';

describe('kanban task event correlation payload', () => {
  it('accepts reserved correlation fields and event-specific fields', () => {
    expect(parseKanbanTaskEventCorrelationPayload({
      pickupId: 'pickup-1',
      agentName: 'orchestrator',
      traceId: 'trace-1',
      eventSpecific: { status: 'completed' },
    })).toMatchObject({
      pickupId: 'pickup-1',
      agentName: 'orchestrator',
      traceId: 'trace-1',
      eventSpecific: { status: 'completed' },
    });
  });

  it('rejects malformed reserved correlation fields', () => {
    expect(() => parseKanbanTaskEventCorrelationPayload({ traceId: 42 }))
      .toThrow();
  });
});
