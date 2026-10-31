import test from 'node:test';
import assert from 'node:assert/strict';
import { rabbitMqHostPort } from './validate-dev-services.mjs';

test('RabbitMQ host probe defaults to the current Docker host mapping', () => {
  assert.equal(rabbitMqHostPort('5673'), 5673);
});

test('RabbitMQ host probe accepts a valid alternate Compose port', () => {
  assert.equal(rabbitMqHostPort('5672'), 5672);
});

test('RabbitMQ host probe rejects invalid ports', () => {
  for (const value of ['0', '65536', 'abc', '5673.5']) {
    assert.throws(() => rabbitMqHostPort(value), /RABBITMQ_HOST_PORT_INVALID/);
  }
});
