import { test, expect } from './fixtures/qa';

// Known-failure check for the pipeline itself. Off by default so a normal sweep stays green.
// Run with QA_SELFTEST=1 to prove that a browser exception and a failed assertion are both
// captured, attached, and classified. The final assertion is intentionally false.
test.skip(process.env.QA_SELFTEST !== '1', 'set QA_SELFTEST=1 to run the known-failure check');

test('known failure: uncaught page exception is captured, then assertion fails', { tag: '@feature:infra.vite' }, async ({ page, qaEvents }) => {
  await page.goto('/');
  await page.evaluate(() => setTimeout(() => { throw new TypeError('qa selftest exception'); }, 0));
  await page.waitForTimeout(500);
  expect(qaEvents.some((event) => event.source === 'browser')).toBe(true);
  expect(1, 'intentional failure for the pipeline self-test').toBe(2);
});
