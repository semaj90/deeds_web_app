import { test, expect } from './fixtures/qa';

// Live check for browser/server error linking (SERVER-LOG-LINK-02). Off by default.
// The test-only executor route answers 500 when the body is not valid JSON; it fails while
// parsing, before any executor runs, so nothing is written.
test.skip(process.env.QA_SERVER500 !== '1', 'set QA_SERVER500=1 to trigger one deliberate server 500');

test('one deliberate server 500 reaches the browser collector', { tag: '@feature:infra.vite' }, async ({ page, qaEvents }) => {
  await page.goto('/');
  const status = await page.evaluate(async () => {
    const response = await fetch('/api/retrieval/executor-tree-test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{not json',
    });
    return response.status;
  });
  expect(status).toBe(500);
  await expect.poll(() => qaEvents.filter((event) => event.source === 'http').length).toBe(1);
});
