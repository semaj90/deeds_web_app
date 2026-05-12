/**
 * Hermes Dispatcher Integration Test
 * 
 * Verifies that the dispatcher can correctly resolve and execute a complex skill
 * (build_timeline) by mocking the tool handlers.
 */

import { hermesDispatcher } from './dispatcher.js';
import { STABLE_TOOLS } from './tools/registry.js';

async function runTest() {
  console.log('🚀 Starting Hermes Dispatcher Integration Test...');

  // Mock tool handlers for testing
  const originalHandlers = {
    'search:sql': STABLE_TOOLS['search:sql'].handler,
    'extract:metadata': STABLE_TOOLS['extract:metadata'].handler,
    'llm:generate': STABLE_TOOLS['llm:generate'].handler
  };

  STABLE_TOOLS['search:sql'].handler = async () => ({ rows: [{ id: 1, title: 'Evidence A' }, { id: 2, title: 'Evidence B' }] });
  STABLE_TOOLS['extract:metadata'].handler = async () => ({ metadata: { date: '2026-05-11' } });
  STABLE_TOOLS['llm:generate'].handler = async () => ({ response: 'Timeline synthesized successfully.' });

  try {
    const result = await hermesDispatcher.executeSkill('build_timeline', { caseId: 'test-case-123' }, { userId: 'tester' });
    
    console.log('Result:', JSON.stringify(result, null, 2));

    if (result.ok && result.toolResults.length === 3) {
      console.log('✅ Integration Test PASSED');
    } else {
      console.error('❌ Integration Test FAILED');
    }
  } catch (err) {
    console.error('💥 Test Crashed:', err);
  } finally {
    // Restore original handlers
    STABLE_TOOLS['search:sql'].handler = originalHandlers['search:sql'];
    STABLE_TOOLS['extract:metadata'].handler = originalHandlers['extract:metadata'];
    STABLE_TOOLS['llm:generate'].handler = originalHandlers['llm:generate'];
  }
}

// In a real environment, you'd run this via a test runner.
// For now, it's a structural verification of the dispatcher logic.
// runTest();
