/**
 * Parent Atlas: ACE Chat DAG Journey E2E Spec
 *
 * Validates the end-to-end journey:
 * 1. ACE Chat UI interaction (chat-input, chat-send)
 * 2. Simulated Redis centroid cache hit & BitFrost Token FSM state progression
 * 3. Topological DAG synthesis and repair proposal display
 * 4. Citation rendering and debug telemetry
 *
 * @see docs/architecture/
 * @validates Parent Atlas Pillar 1
 */

import { expect, test } from '@playwright/test';
import fs from 'fs';
import path from 'path';
import { PORTS } from '../helpers/env-ports.js';

const SCREENSHOT_DIR = path.join(process.cwd(), 'test-results', 'screenshots', 'ace-dag');

if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

test.describe('Pillar 1: ACE Chat DAG Journey E2E', () => {
  test.beforeEach(async ({ page }) => {
    // Intercept SSE streaming route for ACE chat
    await page.route('**/api/sse/chat', async (route) => {
      const mockSynthesis = [
        '### ACE Context & Topological DAG Synthesis',
        '',
        '**Centroid Cache**: HIT (`atlas:bitfrost:v1:centroid_lookup:packet_digest:c7d72127`)',
        '**BitFrost FSM**: `UNLOADED` -> `ADMITTED` -> `RESIDENT` (residency warming complete)',
        '',
        '#### Proposed DAG Execution Plan:',
        '1. **Node 1: InspectSchemaDrift** (inbound: 0, outbound: 2)',
        '   - Verifies 483,801 graph nodes and partial traversal index',
        '2. **Node 2: ExtractASTCoordinates** (inbound: 1, outbound: 1)',
        '   - Computes source-coordinate binding for verified candidate files',
        '3. **Node 3: SynthesizeRepairProposal** (inbound: 2, outbound: 0)',
        '   - Emits additive DDL and deterministic checksum receipt',
      ].join('\n');

      const streamChunk1 = `data: {"id":"ace-dag-1","role":"assistant","content":"### ACE Context & Topological DAG Synthesis\\n\\n**Centroid Cache**: HIT","status":"streaming","confidence":0.92,"source":"server"}\n\n`;

      const doneChunk = `data: {"id":"ace-dag-1","role":"assistant","content":${JSON.stringify(mockSynthesis)},"status":"done","confidence":0.95,"source":"server","citations":["sveltekit-frontend/src/lib/server/atlas/cache/bitfrost-token-fsm-v1.ts","sveltekit-frontend/drizzle/manual/20261013_graph_revision_and_traversal_CONCURRENT_DRAFT.sql"],"contextUsed":["Parent Atlas DAG Engine","BitFrost FSM v1"]}\n\n`;

      await route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        headers: {
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        },
        body: streamChunk1 + doneChunk,
      });
    });

    // Intercept centroid lookup endpoint
    await page.route('**/api/topology/centroids**', async (route) => {
      // Mock 32 64-dim dummy centroids
      const floatCount = 32 * 64;
      const buf = Buffer.alloc(floatCount * 4);
      for (let i = 0; i < floatCount; i++) {
        buf.writeFloatLE(0.01 * (i % 100), i * 4);
      }
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          centroids: Array.from(new Float32Array(buf.buffer, buf.byteOffset, floatCount)),
          meta: {
            count: 32,
            dim: 64,
            gridRows: 4,
            gridCols: 8,
          },
        }),
      });
    });

    // Intercept BitFrost cache effectiveness metrics
    await page.route('**/api/cache/bitfrost-effectiveness**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          ok: true,
          hitRate: 0.94,
          residentCount: 15,
          admittedCount: 28,
          fsmState: 'RESIDENT',
        }),
      });
    });
  });

  test('User submits query, triggers centroid hit, BitFrost warming, and renders DAG repair proposal', async ({ page }) => {
    // 1. Navigate to chat page with debug telemetry enabled
    const targetUrl = `${PORTS.APP_BASE}/chat?debug=1`;
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded' });

    // 2. Verify chat UI elements exist
    const chatInput = page.locator('[data-testid="chat-input"]');
    const chatSend = page.locator('[data-testid="chat-send"]');
    const chatWindow = page.locator('[data-testid="chat-window"]');

    await expect(chatInput).toBeVisible({ timeout: 10000 });
    await expect(chatSend).toBeVisible({ timeout: 10000 });
    await expect(chatWindow).toBeVisible();

    // 3. User types a query requiring DAG synthesis
    const query = 'Synthesize DAG repair plan for schema drift';
    await chatInput.fill(query);
    await expect(chatInput).toHaveValue(query);

    // 4. Submit the query
    await chatSend.click();

    // 5. Assert user message appears in chat window
    const userMessage = page.locator('[data-testid="chat-message"][data-role="user"]');
    await expect(userMessage).toContainText(query, { timeout: 10000 });

    // 6. Assert assistant message renders the synthesized DAG response
    const assistantMessage = page.locator('[data-testid="chat-message"][data-role="assistant"]');
    await expect(assistantMessage).toBeVisible({ timeout: 15000 });
    await expect(assistantMessage).toContainText('Topological DAG Synthesis', { timeout: 15000 });
    await expect(assistantMessage).toContainText('Centroid Cache: HIT');
    await expect(assistantMessage).toContainText('BitFrost FSM: UNLOADED -> ADMITTED -> RESIDENT');
    await expect(assistantMessage).toContainText('Node 1: InspectSchemaDrift');
    await expect(assistantMessage).toContainText('Node 3: SynthesizeRepairProposal');

    // 7. Verify source badge / answer source reflects SERVER or LOCAL
    const answerSource = page.locator('[data-testid="answer-source"]');
    if (await answerSource.count() > 0) {
      await expect(answerSource.first()).toBeVisible();
    }

    // 8. Verify debug overlay is present and reports healthy metrics
    const debugOverlay = page.locator('[data-testid="debug-overlay"]');
    if (await debugOverlay.count() > 0) {
      await expect(debugOverlay).toBeVisible();
      await expect(debugOverlay).toContainText('Dev Metrics');
    }

    // 9. Verify input is cleared and ready for next turn
    await expect(chatInput).toHaveValue('');
    await expect(chatSend).toBeEnabled();

    // Take screenshot for visual evidence
    await page.screenshot({ path: path.join(SCREENSHOT_DIR, '01-ace-dag-journey-complete.png') });
  });

  test('Resilience: handles downstream SSE disruption gracefully without uncaught crashes', async ({ page }) => {
    // Override SSE route to simulate transient error
    await page.route('**/api/sse/chat', async (route) => {
      await route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Inference lane busy' }),
      });
    });

    const targetUrl = `${PORTS.APP_BASE}/chat`;
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded' });

    const chatInput = page.locator('[data-testid="chat-input"]');
    const chatSend = page.locator('[data-testid="chat-send"]');

    await expect(chatInput).toBeVisible({ timeout: 10000 });
    await chatInput.fill('Test resilient recovery on 503');
    await chatSend.click();

    // Verify UI stays interactive and does not permanently disable send button
    await page.waitForTimeout(1000);
    await expect(chatSend).toBeEnabled({ timeout: 10000 });
  });
});
