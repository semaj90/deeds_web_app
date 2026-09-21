#!/usr/bin/env node
import test from 'node:test';
import assert from 'node:assert/strict';
import { resourceHeadroom } from './lib/resource-headroom.mjs';

test('resource headroom accepts a simulated bounded run above both floors', () => {
  const result = resourceHeadroom(process.cwd(), {
    ATLAS_MIN_FREE_DISK_BYTES: '1',
    ATLAS_MIN_FREE_MEMORY_BYTES: '1',
  });

  assert.equal(result.diskOk, true);
  assert.equal(result.memoryOk, true);
  assert.equal(result.ok, true);
});

test('resource headroom refuses when the configured memory floor is unavailable', () => {
  const result = resourceHeadroom(process.cwd(), {
    ATLAS_MIN_FREE_DISK_BYTES: '1',
    ATLAS_MIN_FREE_MEMORY_BYTES: String(Number.MAX_SAFE_INTEGER),
  });

  assert.equal(result.diskOk, true);
  assert.equal(result.memoryOk, false);
  assert.equal(result.ok, false);
});

test('resource headroom refuses when the configured disk floor is unavailable', () => {
  const result = resourceHeadroom(process.cwd(), {
    ATLAS_MIN_FREE_DISK_BYTES: String(Number.MAX_SAFE_INTEGER),
    ATLAS_MIN_FREE_MEMORY_BYTES: '1',
  });

  assert.equal(result.diskOk, false);
  assert.equal(result.memoryOk, true);
  assert.equal(result.ok, false);
});
