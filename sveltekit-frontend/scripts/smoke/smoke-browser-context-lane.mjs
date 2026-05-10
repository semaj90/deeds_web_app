/**
 * smoke-browser-context-lane.mjs
 *
 * Smoke test for the Browser Context Lane architecture.
 * Verifies the three pillars of the lane:
 *   1. Sanitization (Schemes, Queries, Tokens, Caps)
 *   2. Prompt Construction (Labeling, Disclaimer, Formatting)
 *   3. API Logic (Degraded response, JSONB safety)
 *
 * This test runs in pure Node.js and must NOT call external services
 * (Gemma4, Qdrant, Neo4j, DB). It uses the local SvelteKit logic via tsx.
 */

import { sanitizeBrowserContext, emptyContext } from '../../src/lib/server/admin/browser-context-sanitizer.js';
import { formatBrowserContextForPrompt, BROWSER_CONTEXT_DISCLAIMER } from '../../src/lib/server/admin/ai-chat-service.js';
import { BROWSER_CONTEXT_CAPS } from '../../src/lib/types/browser-context.js';
import assert from 'node:assert';

console.log('🧪 Running Browser Context Lane Smoke Test...');

async function testSanitizer() {
  console.log('\n[1/3] Sanitizer Logic...');

  // 1. Forbidden schemes
  const forbidden = sanitizeBrowserContext({
    captured_at: new Date().toISOString(),
    session_id: 'test',
    tabs: [
      { title: 'Forbidden', url: 'chrome://settings' },
      { title: 'Safe', url: 'https://example.com' }
    ]
  });
  assert.strictEqual(forbidden.context.tabs.length, 1, 'Should drop chrome:// tab');
  assert.strictEqual(forbidden.stats.forbidden_schemes_seen, 1, 'Should count forbidden scheme');
  console.log('  ✅ Drops forbidden schemes (chrome://)');

  // 2. Query string stripping
  const query = sanitizeBrowserContext({
    captured_at: new Date().toISOString(),
    session_id: 'test',
    tabs: [
      { title: 'Token Leak', url: 'https://example.com/page?token=secret123&user=admin#fragment' }
    ]
  });
  assert.strictEqual(query.context.tabs[0].url, 'https://example.com/page#fragment', 'Should strip query string entirely');
  console.log('  ✅ Strips query strings entirely');

  // 3. Token redaction in snippets
  const tokens = sanitizeBrowserContext({
    captured_at: new Date().toISOString(),
    session_id: 'test',
    snippets: [
      { 
        source_url: 'https://example.com', 
        text: 'Auth header: Bearer eyJhbGciLCJub25lIiwiZGVmYXVsdCI...\nsecret: abc-123-def-456' 
      }
    ]
  });
  // console.log('SNIPPET:', tokens.context.snippets[0].text);
  assert.ok(tokens.context.snippets[0].text.includes('Bearer [REDACTED]'), 'Should redact Bearer token');
  assert.ok(tokens.context.snippets[0].text.includes('secret: [REDACTED]'), 'Should redact secret key line');
  console.log('  ✅ Redacts secrets from snippets (Bearer, secret)');

  // 4. Enforced Caps
  const manyTabs = Array.from({ length: 100 }, (_, i) => ({ title: `Tab ${i}`, url: `https://test.com/${i}` }));
  const capped = sanitizeBrowserContext({
    captured_at: new Date().toISOString(),
    session_id: 'test',
    tabs: manyTabs
  });
  assert.strictEqual(capped.context.tabs.length, BROWSER_CONTEXT_CAPS.MAX_TABS, `Should cap at ${BROWSER_CONTEXT_CAPS.MAX_TABS} tabs`);
  console.log(`  ✅ Enforces caps (max ${BROWSER_CONTEXT_CAPS.MAX_TABS} tabs)`);
}

function testPromptBuilder() {
  console.log('\n[2/3] Prompt Construction...');

  const ctx = {
    captured_at: new Date().toISOString(),
    session_id: 'test-session',
    current_tab: { title: 'Docs', url: 'https://svelte.dev' },
    tabs: [],
    snippets: [
      { source_url: 'https://svelte.dev', text: 'Svelte 5 runes are awesome.' }
    ],
    history_hits: [],
    sanitized: { urls_redacted: 0, snippet_redactions: 0 },
    trust: 'untrusted_user_visible'
  };

  const prompt = formatBrowserContextForPrompt(ctx);
  assert.ok(prompt.startsWith(BROWSER_CONTEXT_DISCLAIMER), 'Prompt must start with disclaimer');
  assert.ok(prompt.includes('Current tab: Docs'), 'Prompt should include tab title');
  assert.ok(prompt.includes('Svelte 5 runes'), 'Prompt should include snippet text');
  console.log('  ✅ Includes disclaimer: "' + BROWSER_CONTEXT_DISCLAIMER + '"');
  console.log('  ✅ Formats tabs and snippets correctly for the LLM');
}

function testDegradedResponse() {
  console.log('\n[3/3] API Degraded Contract...');

  const empty = emptyContext();
  const res = sanitizeBrowserContext(empty);
  
  assert.strictEqual(res.context.session_id, 'empty', 'Empty context should have session_id="empty"');
  assert.ok(Array.isArray(res.context.tabs), 'Should have tabs array');
  assert.ok(res.context.received_at, 'Should have received_at timestamp');
  assert.strictEqual(res.context.trust, 'untrusted_user_visible', 'Should have untrusted label');
  console.log('  ✅ Returns valid degraded snapshot for empty inputs');
}

async function main() {
  try {
    await testSanitizer();
    testPromptBuilder();
    testDegradedResponse();
    console.log('\n✨ Browser Context Lane smoke test PASSED.');
  } catch (err) {
    console.error('\n❌ Browser Context Lane smoke test FAILED:');
    console.error(err);
    process.exit(1);
  }
}

main();