import { describe, it, expect } from 'vitest';
import { setupTest, cleanupTest } from '$lib/test-utils/setup';
import {
  getBitsOverrides,
  registerOverride,
} from '../components/ui/wrappers/bits/bits-overrides.js';

describe('Bits overrides registry', () => {
  beforeEach(async () => {
    await setupTest();
  });

  afterEach(async () => {
    await cleanupTest();
  });

  it('allows registering and retrieving an override', () => {
    const fake = { Button: { name: 'FakeButton' } };
    registerOverride('test-override', fake, {});

    const all = getBitsOverrides();
    expect(all['test-override']).toBeDefined();
    expect(all['test-override']).toEqual(fake);
  });
});



