import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeConnectionHost,
  normalizeRedisUrl,
  resolveDatabaseUrl,
  resolveRedisConfig,
} from '../atlas/connection-config.mjs';

test('normalizeConnectionHost keeps real hosts and rewrites 0.0.0.0', () => {
  assert.equal(normalizeConnectionHost('127.0.0.1'), '127.0.0.1');
  assert.equal(normalizeConnectionHost('0.0.0.0'), '127.0.0.1');
  assert.equal(normalizeConnectionHost('', 'legal-ai-redis'), 'legal-ai-redis');
});

test('normalizeRedisUrl preserves host:port inputs but normalizes bare hosts', () => {
  assert.equal(normalizeRedisUrl('localhost:6379'), 'redis://localhost:6379');
  assert.equal(normalizeRedisUrl('redis://127.0.0.1:6379'), 'redis://127.0.0.1:6379');
  assert.equal(normalizeRedisUrl('', '127.0.0.1', '6379'), 'redis://127.0.0.1:6379');
});

test('resolveRedisConfig prefers env password and host normalization', () => {
  const config = resolveRedisConfig({
    REDIS_URL: 'localhost:6379',
    REDIS_HOST: '0.0.0.0',
    REDIS_PORT: '6379',
    REDIS_PASSWORD: 'redis',
  });

  assert.equal(config.host, '127.0.0.1');
  assert.equal(config.port, 6379);
  assert.equal(config.password, 'redis');
  assert.equal(config.url, 'redis://127.0.0.1:6379');
});

test('resolveDatabaseUrl defaults to the documented host/port/user tuple', () => {
  assert.equal(
    resolveDatabaseUrl({}),
    'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db',
  );
});

test('resolveDatabaseUrl normalizes a host override and keeps env credentials', () => {
  assert.equal(
    resolveDatabaseUrl({
      DB_HOST: '0.0.0.0',
      DB_PORT: '5434',
      DB_USER: 'legal_admin',
      DB_PASSWORD: '123456',
      DB_NAME: 'legal_ai_db',
    }),
    'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db',
  );
});

