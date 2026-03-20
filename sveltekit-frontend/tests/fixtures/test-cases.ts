/**
 * Test case seed data
 * Seeded by global-setup.ts, cleaned up by global-teardown.ts
 * All cases are created through a real auth_session for the seeded dev user.
 * That user matches the dev bypass identity so older bypass-based tests still see the same rows.
 */
export const PLAYWRIGHT_DEV_SESSION_USER = {
	email: 'admin@yorha.dev',
	role: 'admin'
} as const;

export const TEST_CASE_SEED = [
	{
		title: '[PW-TEST] Yorha v. State — Criminal Defense Alpha',
		description:
			'Automated Playwright test case — criminal defense matter with multiple evidence items. ' +
			'YoRHa Unit 2B faces charges related to unauthorized drone operations over restricted airspace.',
		status: 'open',
		priority: 'high',
	},
	{
		title: '[PW-TEST] Goliath Corp v. Resistance — Corporate Beta',
		description:
			'Automated Playwright test case — corporate litigation matter. ' +
			'The Resistance challenges Goliath Corp patents on machine-human interface technology.',
		status: 'open',
		priority: 'medium',
	},
	{
		title: '[PW-TEST] Unit 9S Discovery Motion — Appellate Gamma',
		description:
			'Automated Playwright test case — appellate discovery motion. ' +
			'Unit 9S seeks expanded discovery into Machine Network internal communications.',
		status: 'open',
		priority: 'low',
	},
] as const;

/** Marker prefix so test cases are identifiable in the DB for manual cleanup if needed */
export const TEST_CASE_PREFIX = '[PW-TEST]';

/** Path used to persist created case IDs between global-setup and global-teardown */
export const TEST_IDS_FILE = 'test-results/.playwright-test-case-ids.json';
