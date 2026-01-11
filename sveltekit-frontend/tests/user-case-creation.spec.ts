
import { test, expect } from '@playwright/test';
import { generateUser } from './utils';

test.describe('User Case Creation', () => {
    test('should allow a registered user to create a case', async ({ page, request }) => {
        const user = generateUser();

        // 1. Register via API
        const registerRes = await request.post('/api/auth/register', {
            data: user
        });

        if (!registerRes.ok()) {
            console.error('Registration failed:', registerRes.status(), await registerRes.text());
        }
        expect(registerRes.ok()).toBeTruthy();
        const registerData = await registerRes.json();
        console.log('Registered user:', registerData.user.id);

        // 2. Set cookie context (Playwright request context is separate from page context usually,
        // unless they share storage state. But here we might need to login via page or share cookies).
        // Actually, request.post might set cookies in the context, which the page shares if using the same context.
        // Let's verify by visiting /dashboard.

        await page.goto('/dashboard');

        // If redirected to login, maybe cookies didn't stick?
        // Let's force login via API if needed or rely on session.
        // If register sets cookie, we are good.

        // 3. Navigate to Case Creation
        await page.goto('/cases/new'); // Or /cases/create

        const caseTitle = `Test Case ${Date.now()}`;

        // Handle form
        await page.waitForSelector('input[name="title"]', { timeout: 10000 });
        await page.fill('input[name="title"]', caseTitle);

        // Optional fields
        if (await page.locator('textarea[name="description"]').isVisible()) {
            await page.fill('textarea[name="description"]', 'Playwright test case');
        }

        // Submit
        // Check for "Save" or "Create" button
        const submitBtn = page.locator('button[type="submit"]');
        await submitBtn.click();

        // 4. Verify Case Created
        // Expect redirect to case detail
        await page.waitForURL(/\/cases\/[a-zA-Z0-9-]+/);

        const url = page.url();
        const caseId = url.split('/').pop();
        console.log(`Case created: ${caseId}`);

        await expect(page.locator('h1, h2, .case-title')).toContainText(caseTitle);
    });
});
