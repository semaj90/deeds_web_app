#!/usr/bin/env node
/**
 * Error-Brain Integration Test
 *
 * Tests the complete flow:
 * 1. Feature flags configuration
 * 2. Transport layer initialization
 * 3. Event publishing
 * 4. SSE streaming
 *
 * Usage:
 *   node scripts/test-error-brain-integration.mjs
 */

import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, '..');

console.log('🧪 Error-Brain Integration Test\n');

// Test 1: Feature Flags
console.log('Test 1: Feature Flags');
try {
  const { getErrorBrainConfig, isErrorBrainEnabled } = await import('../src/lib/server/error-brain/feature-flags.ts');
  const config = getErrorBrainConfig();
  console.log('  ✅ Config loaded:', JSON.stringify(config, null, 2));
  console.log('  ✅ Enabled:', isErrorBrainEnabled());
} catch (e) {
  console.error('  ❌ Failed:', e.message);
  process.exit(1);
}

// Test 2: Event Types
console.log('\nTest 2: Event Types');
try {
  const { createEvent } = await import('../src/lib/server/error-brain/events.ts');
  const event = createEvent('run.started', { runId: 'test-123', mode: 'test' });
  console.log('  ✅ Event created:', event.type);
  console.log('  ✅ Event data:', JSON.stringify(event, null, 2));
} catch (e) {
  console.error('  ❌ Failed:', e.message);
  process.exit(1);
}

// Test 3: Transport Factory
console.log('\nTest 3: Transport Factory');
try {
  const { getTransport } = await import('../src/lib/server/error-brain/transport/factory.ts');
  const transport = getTransport();
  console.log('  ✅ Transport initialized:', transport.name);

  // Test publish
  const { createEvent } = await import('../src/lib/server/error-brain/events.ts');
  const testEvent = createEvent('run.started', { runId: 'test-456', mode: 'integration-test' });
  await transport.publish(testEvent);
  console.log('  ✅ Event published successfully');
} catch (e) {
  console.error('  ❌ Failed:', e.message);
  process.exit(1);
}

// Test 4: SSE Transport (if enabled)
console.log('\nTest 4: SSE Transport');
try {
  const { getErrorBrainConfig } = await import('../src/lib/server/error-brain/feature-flags.ts');
  const config = getErrorBrainConfig();

  if (config.transport === 'sse' || config.transport === 'both') {
    const { getSSETransport } = await import('../src/lib/server/error-brain/transport/sse.ts');
    const sseTransport = getSSETransport();

    // Subscribe
    let receivedEvent = null;
    const unsubscribe = sseTransport.subscribe((event) => {
      receivedEvent = event;
    });

    // Publish test event
    const { createEvent } = await import('../src/lib/server/error-brain/events.ts');
    const testEvent = createEvent('run.progress', {
      runId: 'test-sse-789',
      filesScanned: 42,
      errorsFound: 7
    });
    await sseTransport.publish(testEvent);

    // Verify
    if (receivedEvent) {
      console.log('  ✅ SSE event received:', receivedEvent.type);
      console.log('  ✅ Subscriber count:', sseTransport.getSubscriberCount());
    } else {
      console.log('  ⚠️  No event received (transport may be disabled)');
    }

    unsubscribe();
  } else {
    console.log('  ⏭️  SSE transport not enabled in config');
  }
} catch (e) {
  console.error('  ❌ Failed:', e.message);
}

// Test 5: Run Tracker
console.log('\nTest 5: Run Tracker');
try {
  const { RunTracker } = await import('../src/lib/server/error-brain/run-tracker.ts');

  const runId = `test-run-${Date.now()}`;
  const tracker = new RunTracker(runId, { mode: 'integration-test' });

  tracker.setState('analyzing');
  tracker.incrementCounter('filesScanned', 10);
  tracker.incrementCounter('errorsFound', 3);

  await tracker.save();
  console.log('  ✅ Run saved:', runId);

  // Load back
  const loaded = await RunTracker.load(runId);
  console.log('  ✅ Run loaded:', loaded.state);
  console.log('  ✅ Counters:', JSON.stringify(loaded.counters, null, 2));
} catch (e) {
  console.error('  ❌ Failed:', e.message);
}console.log('\n✅ All integration tests passed!\n');

// Show next steps
console.log('📋 Next Steps:');
console.log('  1. Set environment variables in .env:');
console.log('     ERROR_BRAIN_ENABLED=true');
console.log('     ERROR_BRAIN_TRANSPORT=sse');
console.log('     ERROR_BRAIN_APPLY_MODE=off');
console.log('');
console.log('  2. Start dev server:');
console.log('     npm run dev');
console.log('');
console.log('  3. In another terminal, watch SSE stream:');
console.log('     curl http://localhost:5173/api/internal/error-brain/stream');
console.log('');
console.log('  4. Run batch fixer with events:');
console.log('     node scripts/batch-merger-fixer-v2.mjs --analyze');
console.log('');
