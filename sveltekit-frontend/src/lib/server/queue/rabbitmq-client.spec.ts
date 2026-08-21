import { describe, expect, it } from 'vitest';

import { EXCHANGES } from './topology.js';
import {
  AUTHORITATIVE_TASK_PUBLISH_ERROR,
  assertConveniencePublishTarget,
} from './rabbitmq-client.js';

describe('RabbitMQ convenience publisher boundary', () => {
  it('rejects direct publish to the canonical durable task exchange', () => {
    expect(() => assertConveniencePublishTarget(EXCHANGES.tasks)).toThrow(
      AUTHORITATIVE_TASK_PUBLISH_ERROR,
    );
  });

  it('still allows non-authoritative notification and legacy exchanges', () => {
    expect(() => assertConveniencePublishTarget(EXCHANGES.events)).not.toThrow();
    expect(() => assertConveniencePublishTarget('analytics.events')).not.toThrow();
    expect(() => assertConveniencePublishTarget('vector.updates')).not.toThrow();
  });
});
