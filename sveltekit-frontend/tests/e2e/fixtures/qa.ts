import { test as base, expect } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import { redact, routeTemplate } from '../../../scripts/qa/error-fingerprint.mjs';

/**
 * Collects browser-side failure signals for one test and attaches them as JSON.
 *
 * Signals: uncaught page exceptions, console errors, failed network requests, and HTTP 5xx
 * responses (a 5xx does not produce requestfailed, so it is read from the response event).
 * Every value is redacted before it is attached: no query strings, tokens or emails.
 *
 * feature_label comes from a test tag "@feature:<label>" (for example @feature:agent.acp.execute).
 */

type QaEvent = Record<string, unknown>;

function featureLabelFrom(tags: string[]): string {
  const tag = tags.find((value) => value.startsWith('@feature:'));
  return tag ? tag.slice('@feature:'.length) : 'unlabeled';
}

export const test = base.extend<{ qaEvents: QaEvent[] }>({
  // auto: every test gets the collector, even one that never requests it.
  qaEvents: [async ({ page }, use, testInfo) => {
    const events: QaEvent[] = [];
    const common = {
      run_id: process.env.QA_RUN_ID ?? null,
      feature_label: featureLabelFrom(testInfo.tags),
      test: testInfo.titlePath.join(' > '),
      retry: testInfo.retry,
    };

    const pathOf = (url: string) => {
      try {
        return routeTemplate(new URL(url).pathname);
      } catch {
        return '(invalid-url)';
      }
    };

    page.on('pageerror', (error) => {
      events.push({
        ...common,
        source: 'browser',
        error_code: undefined,
        message: redact(error.message),
        stack: error.stack,
      });
    });

    page.on('console', (message) => {
      if (message.type() !== 'error') return;
      events.push({ ...common, source: 'console', message: redact(message.text()) });
    });

    page.on('requestfailed', (request) => {
      events.push({
        ...common,
        source: 'network',
        route: pathOf(request.url()),
        message: redact(request.failure()?.errorText ?? 'request failed'),
      });
    });

    page.on('response', (response) => {
      if (response.status() < 500) return;
      events.push({ ...common, source: 'http', route: pathOf(response.url()), status: response.status() });
    });

    await use(events);

    // Write a file and attach its path: the Playwright JSON report keeps only paths, not
    // in-memory bodies, so an attachment created from a body is unreadable by the aggregator.
    const file = testInfo.outputPath('qa-browser-events.json');
    writeFileSync(file, JSON.stringify(events, null, 2), 'utf8');
    await testInfo.attach('qa-browser-events.json', { path: file, contentType: 'application/json' });
  }, { auto: true }],
});

export { expect };
