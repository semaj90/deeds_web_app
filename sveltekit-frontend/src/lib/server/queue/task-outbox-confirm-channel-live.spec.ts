// @vitest-environment node

import '../analysis/test-env-bootstrap.js';
import { describe, expect, it } from 'vitest';
import { proveTaskOutboxConfirmChannel } from '../../../../scripts/atlas/prove-task-outbox-confirm-channel.mts';

describe('QUEUE-09 task outbox confirm-channel proof', () => {
  it('proves the atlas.tasks.v1 outbox-to-confirm-channel delivery boundary', async () => {
    const report = await proveTaskOutboxConfirmChannel();

    expect(report.status).toBe('TASK_OUTBOX_CONFIRM_CHANNEL_PROVEN');
    expect(report.directTaskPublishRejected).toBe(true);
    expect(report.outboxTask.pendingBeforePublish).toBe(1);
    expect(report.outboxTask.confirmedPublish).toBe(true);
    expect(report.outboxTask.deliveredAfterConfirm).toBe(true);
    expect(report.consumed.received).toBe(true);
    expect(report.consumed.acknowledged).toBe(true);
    expect(report.consumed.actionKeyMatched).toBe(true);
    expect(report.consumed.routingKeyMatched).toBe(true);
  }, 30_000);
});
