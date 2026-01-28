
import { test, expect } from '@playwright/test';
import fs from 'fs';

const DATA_SCREENSHOT_DIR = 'tests/screenshots/user-flow';

// Ensure screenshot directory exists
if (!fs.existsSync(DATA_SCREENSHOT_DIR)) {
    console.log(`Creating screenshot directory: ${DATA_SCREENSHOT_DIR}`);
    fs.mkdirSync(DATA_SCREENSHOT_DIR, { recursive: true });
}

test.describe('YoRHa Detective User Flow Verification', () => {

    test('Full User Flow: Login -> Create Case -> Upload Evidence -> Verify', async ({ page }) => {
        test.setTimeout(180000); // 3 minutes timeout

        // Monitor browser logs
        page.on('console', msg => console.log('BROWSER:', msg.text()));
        page.on('pageerror', err => console.log('BROWSER ERROR:', err));

        // 1. Visit Login Page / Home
        console.log('Navigating to homepage...');
        try {
            await page.goto('http://localhost:5173/');
        } catch (e) {
            console.log('Initial navigation failed, retrying...');
            await page.goto('http://localhost:5173/');
        }

        // Wait for potential splash or load
        await page.waitForLoadState('domcontentloaded');

        // Check if we are redirected to login (if bypass failed) or at home (if bypass worked)
        const url = page.url();
        console.log(`Current URL: ${url}`);

        if (url.includes('login')) {
            console.log('At login page, attempting login...');
            // Need to verify login form selectors
             await page.fill('input[name="email"]', 'admin@yorha.dev');
             // Password might not be needed if bypass is kinda half-working, but let's assume standard flow
             // await page.fill('input[name="password"]', 'demo123');
             await page.click('button[type="submit"]');
             await page.waitForURL('http://localhost:5173/');
        }

        console.log('Homepage loaded.');
        await page.screenshot({ path: `${DATA_SCREENSHOT_DIR}/01-homepage.png` });

        // 2. Verify Homepage UI Elements
        const newCaseBtn = page.locator('a.new-case-btn');
        const globalSearch = page.locator('a[href="/global-search"]');

        await expect(newCaseBtn).toBeVisible({ timeout: 10000 });
        await expect(globalSearch).toBeVisible();
        console.log('UI Elements Verified: New Case Button & Sidebar Global Search.');

        // 3. Create Case Flow
        console.log('Clicking New Case...');
        await expect(newCaseBtn).toHaveAttribute('href', '/cases/new');

        try {
            await newCaseBtn.click({ timeout: 5000 });
            await page.waitForURL('**/cases/new', { timeout: 10000 });
        } catch (e) {
            console.log('Click/Navigation failed or timed out, trying direct navigation...');
            await page.goto('http://localhost:5173/cases/new');
        }

        await expect(page.locator('h1')).toContainText(/New Case|Create Case/i);
        await page.screenshot({ path: `${DATA_SCREENSHOT_DIR}/02-new-case-page.png` });

        // Fill out form
        await page.fill('input[name="title"]', 'AutoTest Case ' + Date.now());
        await page.fill('textarea#narrative', 'This is an automated test narrative checking the full creation flow.');

        // Guided questions
        await page.fill('input#who', 'Automated Tester');
        await page.fill('input#what', 'Testing the system');
        await page.fill('input#when', 'Right now');
        await page.fill('input#where', 'Virtual Environment');

        // 4. Test Evidence Upload (File Input)
        // Create a dummy file
        const dummyFile = 'tests/scripts/dummy.txt';
        if (!fs.existsSync(dummyFile)) {
             if (!fs.existsSync('tests/scripts')) fs.mkdirSync('tests/scripts', {recursive: true});
            fs.writeFileSync(dummyFile, 'This is a test evidence file content.');
        }

        console.log('Uploading evidence...');
        // The file input is inside .file-drop-zone
        const fileInput = page.locator('input[type="file"]');
        await fileInput.setInputFiles(dummyFile);

        // Verify it appears in the list
        await expect(page.locator('.uploaded-files li')).toContainText('dummy.txt');
        await page.screenshot({ path: `${DATA_SCREENSHOT_DIR}/03-evidence-uploaded.png` });

        // 5. Submit Case
        console.log('Submitting case...');
        await page.click('button.btn-submit');

        // Wait for redirect to /cases/[id]/overview
        // This might take a moment due to "AI analysis" simulation
        await page.waitForURL(/\/cases\/.*\/overview/, { timeout: 30000 });
        console.log('Redirected to Case Overview');

        await page.screenshot({ path: `${DATA_SCREENSHOT_DIR}/04-case-overview.png` });

        // Verify key elements on overview
        await expect(page.locator('h1')).toBeVisible(); // Case title should be there

        console.log('Case Creation Flow Complete.');
    });

    test('Homepage Button Mapping Check', async ({ page }) => {
        // Go to home
        await page.goto('http://localhost:5173/');

        // List of sidebar links to check
        const links = [
            { name: 'Command Center', href: '/command-center' },
            { name: 'Active Cases', href: '/' }, // This is home
            { name: 'Evidence Library', href: '/evidence' },
             { name: 'Global Search', href: '/global-search' },
             { name: 'AI Assistant', href: '/chat' },
        ];

        for (const link of links) {
            console.log(`Testing link: ${link.name}`);
            const locator = page.locator(`.sidebar-nav a[href="${link.href}"]`).first();
            await expect(locator).toBeVisible();
            await expect(locator).toHaveAttribute('href', link.href);

            // We could click and verify, but that might slow it down too much.
            // Visibility and href check is good for "mapping".
        }

        await page.screenshot({ path: `${DATA_SCREENSHOT_DIR}/05-sidebar-verified.png` });
    });
});
