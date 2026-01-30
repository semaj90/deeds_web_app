import { test, expect  } from '@playwright/test';

test.describe.skip('RAG sync smoke', () => {
  test('IndexedDB -> agent -> /api/rag/sync -> persisted', async ({ page }) => {
    // Adjust baseURL via PLAYWRIGHT_BASE_URL or run dev server on default
    const base = process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:5173';
    await page.goto(`${base}/rag-test`);

    // Click the button to create a pending doc
    const createBtn = page.getByRole('button', { name: /create pending doc/i });
    await expect(createBtn).toBeVisible({ timeout: 5000 });
    await createBtn.click();

    // Wait for the UI to show a pending doc entry
    const status = page.getByText(/syncStatus:/i).first();
    await expect(status).toBeVisible({ timeout: 5000 });

    // Wait up to 30s for the syncStatus to become 'synced'
    await page.waitForFunction(
      () => {
        const el = Array.from(document.querySelectorAll('body *')).find((n) =>
          /syncStatus:\s*/i.test(n.textContent || '')
        );
        if (!el) return false;
        return /synced/i.test(el.textContent || '');
      },
      { timeout: 30000 }
    );

    // Verify IndexedDB entry has embedding and syncStatus
    const result = await page.evaluate(async () => {
      // @ts-ignore - access IDB helper on window if present
      const dbName = 'deeds-legal-ai-db';
      try {
        const req = indexedDB.open(dbName);
        const db = await new Promise((res, rej) => {
          req.onsuccess = () => res(req.result);
          req.onerror = () => rej(req.error);
        });
        const tx = db.transaction('documents', 'readonly');
        const store = tx.objectStore('documents');
        const all = await new Promise((res, rej) => {
          const r = store.getAll();
          r.onsuccess = () => res(r.result);
          r.onerror = () => rej(r.error);
        });
        return all;
      } catch (e) {
        return { error: String(e) };
      }
    });

    // Basic assertions
    expect(result).not.toHaveProperty('error');
    expect(Array.isArray(result)).toBe(true);
    const synced = result.find((d: any) => d?.syncStatus === 'synced');
    expect(synced).toBeDefined();
    expect(Array.isArray(synced.embedding)).toBe(true);
    expect(synced.embedding.length).toBeGreaterThan(0);
  });
});
