import { getTableName } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { agentOsEvents, taskRegistry } from './agent-os-registry.js';

describe('agent os registry schema', () => {
  it('exports the canonical task and event ledger tables', () => {
    expect(getTableName(taskRegistry)).toBe('task_registry');
    expect(getTableName(agentOsEvents)).toBe('agent_os_events');
  });

  it('keeps the task and event identity columns visible to the app schema', () => {
    expect(taskRegistry.taskId.name).toBe('task_id');
    expect(taskRegistry.taskType.name).toBe('task_type');
    expect(taskRegistry.status.name).toBe('status');
    expect(agentOsEvents.traceId.name).toBe('trace_id');
    expect(agentOsEvents.eventType.name).toBe('event_type');
    expect(agentOsEvents.featureId.name).toBe('feature_id');
  });
});
