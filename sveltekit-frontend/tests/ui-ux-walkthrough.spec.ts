
import { test, expect } from '@playwright/test';
import * as path from 'path';
import { PORTS } from './helpers/env-ports.js';

test.describe('UI/UX Walkthrough', () => {
    test.use({ viewport: { width: 1280, height: 720 } });

    // Increase timeout for slow page loads in dev mode
    test.setTimeout(120000);

    test('Navigate through core pages and capture screenshots', async ({ page }) => {

        async function capture(name, url) {
            console.log(`Navigating to ${name}...`);
            try {
                await page.goto(url);
                // Wait for network idle or load, fallback to timeout if needed
                try {
                    await page.waitForLoadState('load', { timeout: 10000 });
                } catch (e) {
                    console.log(`Warning: ${name} load event timed out, but continuing...`);
                }
                await page.waitForTimeout(2000);
                await page.screenshot({ path: `test-results/screenshots/${name}.png` });
            } catch (e) {
                console.error(`ERROR: Failed to capture ${name}`, e);
            }
        }

	    await capture('01-cases', `${PORTS.APP_BASE}/cases`);
	    await capture('02-evidence', `${PORTS.APP_BASE}/evidence`);
	    await capture('03-poi', `${PORTS.APP_BASE}/persons-of-interest`);
	    await capture('04-analysis', `${PORTS.APP_BASE}/analysis-center`);
	    await capture('05-global-search', `${PORTS.APP_BASE}/global-search`);
	    await capture('06-system-config', `${PORTS.APP_BASE}/system-configuration`);
	    await capture('07-terminal', `${PORTS.APP_BASE}/terminal`);

        // New Case Modal
        console.log('Testing New Case Modal...');
        try {
	            await page.goto(`${PORTS.APP_BASE}/cases`);
            await page.waitForLoadState('load');
            await page.waitForTimeout(2000);

            // Try explicit button text locator
            console.log('Clicking + New Case button...');
            const newCaseBtn = page.getByText('+ New Case').first();

            if (await newCaseBtn.isVisible()) {
                 await newCaseBtn.click();
                 await page.waitForTimeout(2000);
                 await page.screenshot({ path: 'test-results/screenshots/08-new-case-modal.png' });
            } else {
                console.log('Could not find New Case button');
            }
        } catch (e) {
            console.error('ERROR: Failed during modal test', e);
        }
    });
});
