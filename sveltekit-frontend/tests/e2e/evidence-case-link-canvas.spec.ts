import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import pg from 'pg';
import { TEST_CASE_SEED } from '../fixtures/test-cases.js';

const DB_URL =
  process.env.DATABASE_URL || 'postgresql://legal_admin:123456@localhost:5432/legal_ai_db';
const DEV_USER_ID = '00000000-0000-0000-0000-000000000001';
const pool = new pg.Pool({ connectionString: DB_URL });

type SeedCase = {
  id: string;
  title: string;
};

const cleanupEvidenceIds = new Set<string>();
const cleanupCanvasCaseIds = new Set<string>();
const cleanupCitationIds = new Set<string>();
const cleanupStatuteIds = new Set<string>();
const cleanupCaseLinkIds = new Set<string>();

function extractCases(payload: any): SeedCase[] {
  return payload?.data?.cases ?? payload?.cases ?? payload?.data ?? [];
}

async function loadSeededCases(request: APIRequestContext): Promise<SeedCase[]> {
  const response = await request.get(
    `/api/cases?limit=20&search=${encodeURIComponent('[PW-TEST]')}`
  );
  expect(response.ok()).toBeTruthy();

  const body = await response.json();
  const cases = extractCases(body);

  return TEST_CASE_SEED.map((seedCase) => {
    const match = cases.find((item: SeedCase) => item.title === seedCase.title);
    expect(match, `Missing seeded case: ${seedCase.title}`).toBeTruthy();
    return match as SeedCase;
  });
}

async function insertEvidenceRow(title: string, caseId: string): Promise<string> {
  const evidenceNumber = `PW-EV-${Date.now().toString(36).toUpperCase()}`;
  const fileName = `${title}.pdf`;
  const description = 'Playwright smoke evidence row';
  const fileUrl = `minio://playwright-smoke/${fileName}`;
  const fileHash = `sha256:${evidenceNumber.toLowerCase()}`;

  const result = await pool.query<{ id: string }>(
    `INSERT INTO evidence (
			case_id,
			evidence_number,
			user_id,
			uploaded_by,
			title,
			summary,
			description,
			evidence_type,
			file_url,
			file_name,
			file_type,
			file_size,
			hash,
			uploaded_at,
			mime_type,
			type,
			created_at,
			updated_at
		) VALUES ($1, $2, $3, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW(), $13, $14, NOW(), NOW())
		RETURNING id`,
    [
      caseId,
      evidenceNumber,
      DEV_USER_ID,
      title,
      description,
      description,
      'document',
      fileUrl,
      fileName,
      'application/pdf',
      1024,
      fileHash,
      'application/pdf',
      'document',
    ]
  );

  const evidenceId = result.rows[0]?.id;
  expect(evidenceId).toBeTruthy();
  cleanupEvidenceIds.add(evidenceId);
  return evidenceId;
}

async function insertCitationRow(citationText: string): Promise<string> {
  const result = await pool.query<{ id: string }>(
    `INSERT INTO citations (
      citation_type,
      formatted_citation,
      quoted_text,
      created_by,
      created_at,
      updated_at
    ) VALUES ($1, $2, $3, $4, NOW(), NOW())
    RETURNING id`,
    ['case_law', citationText, citationText, DEV_USER_ID]
  );

  const citationId = result.rows[0]?.id;
  expect(citationId).toBeTruthy();
  cleanupCitationIds.add(citationId);
  return citationId;
}

async function findStatuteIdBySection(section: string): Promise<string | null> {
  const result = await pool.query<{ id: string }>(
    'SELECT id FROM statutes WHERE section = $1 LIMIT 1',
    [section]
  );

  return result.rows[0]?.id ?? null;
}

async function stubCompletedOnboarding(page: Page): Promise<void> {
  await page.route('**/api/onboarding', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        hasCompletedOnboarding: true,
        onboardingStep: 9,
      }),
    });
  });
}

test.describe('Evidence link and canvas smoke flows', () => {
  test.describe.configure({ mode: 'serial' });

  test.afterEach(async () => {
    for (const linkId of cleanupCaseLinkIds) {
      await pool.query('DELETE FROM case_statute_links WHERE id = $1', [linkId]).catch(() => {});
    }
    cleanupCaseLinkIds.clear();

    for (const evidenceId of cleanupEvidenceIds) {
      await pool.query('DELETE FROM evidence WHERE id = $1', [evidenceId]).catch(() => {});
    }
    cleanupEvidenceIds.clear();

    for (const citationId of cleanupCitationIds) {
      await pool.query('DELETE FROM citations WHERE id = $1', [citationId]).catch(() => {});
    }
    cleanupCitationIds.clear();

    for (const statuteId of cleanupStatuteIds) {
      await pool.query('DELETE FROM statutes WHERE id = $1', [statuteId]).catch(() => {});
    }
    cleanupStatuteIds.clear();

    for (const caseId of cleanupCanvasCaseIds) {
      await pool.query('DELETE FROM canvas_states WHERE case_id = $1', [caseId]).catch(() => {});
    }
    cleanupCanvasCaseIds.clear();
  });

  test.afterAll(async () => {
    await pool.end();
  });

  test('links a selected evidence record to a chosen case and persists it', async ({
    page,
    request,
  }) => {
    const [initialCase, targetCase] = await loadSeededCases(request);
    const evidenceTitle = `[PW-SMOKE] evidence-link-${Date.now()}`;
    const evidenceId = await insertEvidenceRow(evidenceTitle, initialCase.id);
    const caseSearchTerm =
      targetCase.title.replace(/^\[PW-TEST\]\s*/, '').split(' ')[0] ?? '[PW-TEST]';

    await stubCompletedOnboarding(page);

    await page.goto('/evidence');
    await page.waitForLoadState('networkidle');

    const evidenceCard = page.locator('[role="button"]').filter({ hasText: evidenceTitle }).first();
    await expect(evidenceCard).toBeVisible();
    await evidenceCard.click();

    await expect(page.getByText('Document Analysis')).toBeVisible();
    await page.getByLabel('Close').click();
    await expect(page.getByText('Document Analysis')).not.toBeVisible();

    await page.getByRole('button', { name: /Link Evidence to Case/i }).click();

    const caseSearchInput = page.getByPlaceholder('Search and select a case...');
    await caseSearchInput.fill(caseSearchTerm);
    await expect(page.getByRole('listbox')).toBeVisible();

    const caseOption = page
      .locator('.results-dropdown .result-item')
      .filter({ hasText: targetCase.title })
      .first();
    await expect(caseOption).toBeVisible();
    await caseOption.click();

    await expect(page.getByText(`Linked ${evidenceTitle} to ${targetCase.title}.`)).toBeVisible();

    await expect
      .poll(async () => {
        const response = await request.get(`/api/evidence/${evidenceId}`);
        if (!response.ok()) return null;
        const body = await response.json();
        return body.caseId ?? null;
      })
      .toBe(targetCase.id);
  });

  test('loads a saved canvas snapshot and keeps it persisted after save', async ({
    page,
    request,
  }) => {
    const [canvasCase] = await loadSeededCases(request);
    cleanupCanvasCaseIds.add(canvasCase.id);

    const seededSnapshot = {
      version: 1,
      viewport: {
        pan: { x: 0, y: 0 },
        zoom: 1,
      },
      nodes: [
        {
          id: `pw-canvas-node-${Date.now()}`,
          kind: 'note',
          x: 96,
          y: 112,
          w: 240,
          h: 96,
          title: 'Persisted canvas note',
          body: 'Persisted canvas note',
          color: '#e0f7fa',
        },
      ],
      edges: [],
      updatedAt: new Date().toISOString(),
    };

    const seedResponse = await request.post(`/api/cases/${canvasCase.id}/canvas`, {
      data: seededSnapshot,
      headers: { 'Content-Type': 'application/json' },
    });
    expect(seedResponse.ok()).toBeTruthy();

    await stubCompletedOnboarding(page);

    await page.goto(`/cases/${canvasCase.id}`);
    await page.waitForLoadState('networkidle');

    await page.getByRole('button', { name: /^Canvas$/ }).click();
    await expect(page.getByText('note: Persisted canvas note')).toBeVisible();

    await page.getByRole('button', { name: /Save Canvas/i }).click();

    await expect
      .poll(async () => {
        const response = await request.get(`/api/cases/${canvasCase.id}/canvas`);
        if (!response.ok()) return null;
        const body = await response.json();
        return body?.nodes?.[0]?.title ?? null;
      })
      .toBe('Persisted canvas note');

    const persistedResponse = await request.get(`/api/cases/${canvasCase.id}/canvas`);
    const persistedSnapshot = await persistedResponse.json();
    expect(persistedSnapshot.version).toBe(1);
    expect(persistedSnapshot.nodes).toHaveLength(1);
    expect(persistedSnapshot.nodes[0].kind).toBe('note');
    expect(persistedSnapshot.nodes[0].title).toBe('Persisted canvas note');
  });

  test('starts with empty case link lists and supports citation and statute linking', async ({
    request,
  }) => {
    const [targetCase] = await loadSeededCases(request);

    const initialCitationsResponse = await request.get(`/api/cases/${targetCase.id}/citations`);
    expect(initialCitationsResponse.ok()).toBeTruthy();
    const initialCitationsBody = await initialCitationsResponse.json();
    expect(initialCitationsBody.success).toBe(true);
    expect(initialCitationsBody.data ?? []).toEqual([]);

    const initialLawsResponse = await request.get(`/api/cases/${targetCase.id}/laws`);
    expect(initialLawsResponse.ok()).toBeTruthy();
    const initialLawsBody = await initialLawsResponse.json();
    expect(initialLawsBody.success).toBe(true);
    expect(initialLawsBody.data ?? []).toEqual([]);

    const citationText = `PW Citation ${Date.now()}`;
    const citationId = await insertCitationRow(citationText);

    const linkCitationResponse = await request.post(`/api/cases/${targetCase.id}/citations`, {
      data: {
        citation_id: citationId,
        link_type: 'CITED_IN',
        notes: 'Playwright linked citation',
      },
      headers: { 'Content-Type': 'application/json' },
    });
    expect(linkCitationResponse.status()).toBe(201);
    const linkCitationBody = await linkCitationResponse.json();
    expect(linkCitationBody.success).toBe(true);
    expect(linkCitationBody.data?.citationId ?? linkCitationBody.data?.citation_id).toBe(
      citationId
    );
    if (linkCitationBody.data?.id) {
      cleanupCaseLinkIds.add(linkCitationBody.data.id);
    }

    const statuteCode = `PW-STAT-${Date.now()}`;
    const linkLawResponse = await request.post(`/api/cases/${targetCase.id}/laws`, {
      data: {
        statute_code: statuteCode,
        link_type: 'CHARGED_UNDER',
        notes: 'Playwright linked statute',
      },
      headers: { 'Content-Type': 'application/json' },
    });
    expect(linkLawResponse.status()).toBe(201);
    const linkLawBody = await linkLawResponse.json();
    expect(linkLawBody.success).toBe(true);
    if (linkLawBody.data?.id) {
      cleanupCaseLinkIds.add(linkLawBody.data.id);
    }

    const statuteId = await findStatuteIdBySection(statuteCode);
    expect(statuteId).toBeTruthy();
    cleanupStatuteIds.add(statuteId!);

    await expect
      .poll(async () => {
        const response = await request.get(`/api/cases/${targetCase.id}/citations`);
        if (!response.ok()) return null;
        const body = await response.json();
        return body.data ?? [];
      })
      .toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            citationId,
            citationText,
            linkType: 'CITED_IN',
          }),
        ])
      );

    await expect
      .poll(async () => {
        const response = await request.get(`/api/cases/${targetCase.id}/laws`);
        if (!response.ok()) return null;
        const body = await response.json();
        return body.data ?? [];
      })
      .toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            statuteId,
            statuteSection: statuteCode,
            linkType: 'CHARGED_UNDER',
          }),
        ])
      );
  });
});
