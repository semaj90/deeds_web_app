/**
 * Forensic test barrel — single import surface for new specs.
 *
 *   import { test, expect, summarise, hardErrorCount, UUID_RE } from './index';
 *
 *   test('foo', async ({ authedPage, forensicPage, pool }) => {
 *     // authedPage: pre-logged-in via storageState
 *     // forensicPage: { page, log } with 5 listeners attached
 *     // pool: worker-scope pg.Pool
 *   });
 *
 * Legacy specs that import from './_helpers' continue to work unchanged.
 * Migrate them in batches as the test infra matures.
 */

export { test, expect } from './fixtures/authed-page';
export type { CapturedLog } from './fixtures/forensic-page';
export {
	UUID_RE,
	summarise,
	hardErrorCount,
	stubCompletedOnboarding,
	navAndCapture,
} from './helpers/forensic';
