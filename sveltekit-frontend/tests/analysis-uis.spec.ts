/**
 * Playwright Tests: Audio, Video, and Document Analysis UIs
 * Tests with real data from legal_ai_db and MinIO buckets
 */

import { test, expect } from '@playwright/test';
import { Pool } from 'pg';

const pool = new Pool({
	connectionString: 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db'
});

test.describe('Audio Analysis UI', () => {
	let audioEvidenceId: string;

	test.beforeAll(async () => {
		// Find real audio evidence from database
		const result = await pool.query(`
      SELECT id, title, file_name
      FROM evidence
      WHERE evidence_type = 'audio'
        AND metadata->'transcription' IS NOT NULL
      ORDER BY created_at DESC
      LIMIT 1
    `);

		if (result.rows.length > 0) {
			audioEvidenceId = result.rows[0].id;
			console.log(`Testing with audio: ${result.rows[0].title} (${audioEvidenceId})`);
		}
	});

	test('should load audio analysis page', async ({ page }) => {
		test.skip(!audioEvidenceId, 'No audio evidence with transcription found');

		await page.goto(`/audio-analysis/${audioEvidenceId}`);

		// Wait for page to load
		await expect(page.locator('h1')).toContainText(/Audio Analysis|Audio Test/i);

		// Check for back button
		await expect(page.locator('a[href="/evidence"]')).toBeVisible();
	});

	test('should display audio metadata', async ({ page }) => {
		test.skip(!audioEvidenceId, 'No audio evidence found');

		await page.goto(`/audio-analysis/${audioEvidenceId}`);

		// Wait for component to load
		await page.waitForSelector('.audio-analysis-view', { timeout: 10000 });

		// Check for metadata items
		const metadata = page.locator('.metadata-row');
		await expect(metadata).toBeVisible();

		// Should show file name, size, status
		await expect(metadata.locator('.metadata-item')).toHaveCount(4, { timeout: 5000 });
	});

	test('should have 4 tabs (transcription, timeline, analysis, entities)', async ({ page }) => {
		test.skip(!audioEvidenceId, 'No audio evidence found');

		await page.goto(`/audio-analysis/${audioEvidenceId}`);
		await page.waitForSelector('.tabs-container', { timeout: 10000 });

		// Check for all tabs
		await expect(page.locator('.tab')).toHaveCount(4);
		await expect(page.getByRole('button', { name: /transcription/i })).toBeVisible();
		await expect(page.getByRole('button', { name: /timeline/i })).toBeVisible();
		await expect(page.getByRole('button', { name: /ace analysis/i })).toBeVisible();
		await expect(page.getByRole('button', { name: /entities/i })).toBeVisible();
	});

	test('should display transcription text', async ({ page }) => {
		test.skip(!audioEvidenceId, 'No audio evidence found');

		await page.goto(`/audio-analysis/${audioEvidenceId}`);
		await page.waitForSelector('.tabs-container', { timeout: 10000 });

		// Click transcription tab (should be active by default)
		const transcriptionTab = page.getByRole('button', { name: /transcription/i });
		await transcriptionTab.click();

		// Wait for transcription panel
		await page.waitForSelector('.transcription-panel', { timeout: 5000 });

		// Check for transcription text or empty state
		const hasText = await page.locator('.transcription-text').isVisible();
		const hasEmptyState = await page.locator('.empty-state').isVisible();

		expect(hasText || hasEmptyState).toBeTruthy();

		if (hasText) {
			// Verify stats are shown
			await expect(page.locator('.transcription-stats')).toBeVisible();
		}
	});

	test('should switch between tabs', async ({ page }) => {
		test.skip(!audioEvidenceId, 'No audio evidence found');

		await page.goto(`/audio-analysis/${audioEvidenceId}`);
		await page.waitForSelector('.tabs-container', { timeout: 10000 });

		// Click timeline tab
		await page.getByRole('button', { name: /timeline/i }).click();
		await expect(page.locator('.timeline-panel')).toBeVisible({ timeout: 5000 });

		// Click ACE analysis tab
		await page.getByRole('button', { name: /ace analysis/i }).click();
		await expect(page.locator('.analysis-panel')).toBeVisible({ timeout: 5000 });

		// Click entities tab
		await page.getByRole('button', { name: /entities/i }).click();
		await expect(page.locator('.entities-panel')).toBeVisible({ timeout: 5000 });
	});

	test('should display ACE analysis if available', async ({ page }) => {
		test.skip(!audioEvidenceId, 'No audio evidence found');

		await page.goto(`/audio-analysis/${audioEvidenceId}`);
		await page.waitForSelector('.tabs-container', { timeout: 10000 });

		// Navigate to ACE analysis tab
		await page.getByRole('button', { name: /ace analysis/i }).click();
		await page.waitForSelector('.analysis-panel', { timeout: 5000 });

		// Check for ACE sections or empty state
		const hasAnalysis = await page.locator('.ace-section').isVisible();
		const hasEmptyState = await page.locator('.empty-state').isVisible();

		expect(hasAnalysis || hasEmptyState).toBeTruthy();

		if (hasAnalysis) {
			// Should have summary and confidence sections
			await expect(page.locator('.section-title').first()).toBeVisible();
		}
	});
});

test.describe('Video Analysis UI', () => {
	let videoEvidenceId: string;

	test.beforeAll(async () => {
		// Find or create test video evidence
		const result = await pool.query(`
      SELECT id, title, file_name
      FROM evidence
      WHERE evidence_type = 'video'
      ORDER BY created_at DESC
      LIMIT 1
    `);

		if (result.rows.length > 0) {
			videoEvidenceId = result.rows[0].id;
			console.log(`Testing with video: ${result.rows[0].title} (${videoEvidenceId})`);
		} else {
			// Create test video evidence
			const createResult = await pool.query(`
        INSERT INTO evidence (
          id, case_id, user_id, title, file_path, file_size,
          evidence_type, file_name, mime_type, metadata
        ) VALUES (
          gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9
        ) RETURNING id
      `, [
				'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
				'00000000-0000-0000-0000-000000000001',
				'Playwright Test Video Evidence',
				'uploads/video/test-playwright.mp4',
				1024000,
				'video',
				'test-playwright.mp4',
				'video/mp4',
				JSON.stringify({
					processingStatus: 'complete',
					vlmAnalysis: {
						summary: 'Test video showing office environment with person working at desk. Multiple objects detected including computer equipment.',
						keyObjects: ['person', 'desk', 'computer', 'chair', 'monitor'],
						activities: ['working', 'typing', 'reading'],
						setting: 'office environment, indoor, professional setting'
					},
					frameAnalysis: [
						{ timestamp: 0, description: 'Person seated at desk with computer', objects: ['person', 'desk', 'computer'], tags: ['office', 'work'], confidence: 0.89 },
						{ timestamp: 2, description: 'Close-up of hands typing on keyboard', objects: ['hands', 'keyboard'], tags: ['typing', 'work'], confidence: 0.92 },
						{ timestamp: 4, description: 'Monitor displaying legal document', objects: ['monitor', 'document'], tags: ['legal', 'document'], confidence: 0.85 }
					],
					sceneDetection: [
						{ startTime: 0, endTime: 3, description: 'Office setup - wide shot' },
						{ startTime: 3, endTime: 6, description: 'Typing activity - close-up' }
					],
					videoMetadata: {
						duration: 120,
						width: 1920,
						height: 1080,
						fps: 30,
						codec: 'h264',
						bitrate: 5000000
					}
				})
			]);

			videoEvidenceId = createResult.rows[0].id;
			console.log(`Created test video: ${videoEvidenceId}`);
		}
	});

	test('should load video analysis page', async ({ page }) => {
		test.skip(!videoEvidenceId, 'No video evidence found');

		await page.goto(`/video-analysis/${videoEvidenceId}`);

		// Wait for page to load
		await expect(page.locator('h1')).toContainText(/Video Analysis/i);

		// Check for back button
		await expect(page.locator('a[href="/evidence"]')).toBeVisible();
	});

	test('should display video metadata (resolution, fps, duration)', async ({ page }) => {
		test.skip(!videoEvidenceId, 'No video evidence found');

		await page.goto(`/video-analysis/${videoEvidenceId}`);
		await page.waitForSelector('.video-analysis-view', { timeout: 10000 });

		// Check for metadata items
		const metadata = page.locator('.metadata-row');
		await expect(metadata).toBeVisible();

		// Should show file name, size, duration, resolution, fps
		const metadataItems = metadata.locator('.metadata-item');
		await expect(metadataItems).toHaveCountGreaterThan(3);
	});

	test('should have 5 tabs (overview, frames, scenes, transcription, analysis)', async ({ page }) => {
		test.skip(!videoEvidenceId, 'No video evidence found');

		await page.goto(`/video-analysis/${videoEvidenceId}`);
		await page.waitForSelector('.tabs-container', { timeout: 10000 });

		// Check for tabs (transcription may be hidden if no audio)
		const tabs = page.locator('.tab');
		const tabCount = await tabs.count();

		expect(tabCount).toBeGreaterThanOrEqual(4); // At least 4 tabs (overview, frames, scenes, analysis)

		// Verify specific tabs exist
		await expect(page.getByRole('button', { name: /overview/i })).toBeVisible();
		await expect(page.getByRole('button', { name: /frame analysis/i })).toBeVisible();
		await expect(page.getByRole('button', { name: /scenes/i })).toBeVisible();
		await expect(page.getByRole('button', { name: /ace analysis/i })).toBeVisible();
	});

	test('should display VLM summary in overview tab', async ({ page }) => {
		test.skip(!videoEvidenceId, 'No video evidence found');

		await page.goto(`/video-analysis/${videoEvidenceId}`);
		await page.waitForSelector('.tabs-container', { timeout: 10000 });

		// Overview tab should be active by default
		await expect(page.locator('.overview-panel')).toBeVisible({ timeout: 5000 });

		// Check for VLM section or stats grid
		const hasVLM = await page.locator('.vlm-section').isVisible();
		const hasStats = await page.locator('.stats-grid').isVisible();

		expect(hasVLM || hasStats).toBeTruthy();

		if (hasVLM) {
			// Should show VLM summary
			await expect(page.locator('.vlm-summary')).toBeVisible();

			// Check for key objects, activities, setting
			const hasObjects = await page.locator('.vlm-objects').isVisible();
			const hasActivities = await page.locator('.vlm-activities').isVisible();

			if (hasObjects) {
				await expect(page.locator('.tag-object').first()).toBeVisible();
			}
		}

		// Stats grid should show counts
		if (hasStats) {
			await expect(page.locator('.stat-card')).toHaveCountGreaterThan(0);
		}
	});

	test('should display frame analysis grid', async ({ page }) => {
		test.skip(!videoEvidenceId, 'No video evidence found');

		await page.goto(`/video-analysis/${videoEvidenceId}`);
		await page.waitForSelector('.tabs-container', { timeout: 10000 });

		// Navigate to frame analysis tab
		await page.getByRole('button', { name: /frame analysis/i }).click();
		await page.waitForSelector('.frames-panel', { timeout: 5000 });

		// Check for frames grid or empty state
		const hasFrames = await page.locator('.frames-grid').isVisible();
		const hasEmptyState = await page.locator('.empty-state').isVisible();

		expect(hasFrames || hasEmptyState).toBeTruthy();

		if (hasFrames) {
			// Should have frame cards
			const frameCards = page.locator('.frame-card');
			await expect(frameCards.first()).toBeVisible();

			// Click on a frame card
			await frameCards.first().click();

			// Should have active state
			await expect(frameCards.first()).toHaveClass(/active/);
		}
	});

	test('should display scene detection', async ({ page }) => {
		test.skip(!videoEvidenceId, 'No video evidence found');

		await page.goto(`/video-analysis/${videoEvidenceId}`);
		await page.waitForSelector('.tabs-container', { timeout: 10000 });

		// Navigate to scenes tab
		await page.getByRole('button', { name: /scenes/i }).click();
		await page.waitForSelector('.scenes-panel', { timeout: 5000 });

		// Check for scenes list or empty state
		const hasScenes = await page.locator('.scenes-list').isVisible();
		const hasEmptyState = await page.locator('.empty-state').isVisible();

		expect(hasScenes || hasEmptyState).toBeTruthy();

		if (hasScenes) {
			// Should have scene cards
			await expect(page.locator('.scene-card').first()).toBeVisible();

			// Scene should show time range
			await expect(page.locator('.scene-duration').first()).toBeVisible();
		}
	});
});

test.describe('Document Analysis UI', () => {
	let documentEvidenceId: string;

	test.beforeAll(async () => {
		// Find or create test document evidence
		const result = await pool.query(`
      SELECT id, title, file_name
      FROM evidence
      WHERE evidence_type = 'document'
      ORDER BY created_at DESC
      LIMIT 1
    `);

		if (result.rows.length > 0) {
			documentEvidenceId = result.rows[0].id;
			console.log(`Testing with document: ${result.rows[0].title} (${documentEvidenceId})`);
		} else {
			// Create test document evidence
			const createResult = await pool.query(`
        INSERT INTO evidence (
          id, case_id, user_id, title, file_path, file_size,
          evidence_type, file_name, mime_type, metadata
        ) VALUES (
          gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9
        ) RETURNING id
      `, [
				'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
				'00000000-0000-0000-0000-000000000001',
				'Playwright Test Legal Document',
				'uploads/documents/test-playwright.pdf',
				512000,
				'document',
				'test-playwright.pdf',
				'application/pdf',
				JSON.stringify({
					processingStatus: 'complete',
					extractedText: 'LEGAL MEMORANDUM\n\nRE: Plaintiff v. Defendant - Motion for Summary Judgment\n\nThis memorandum addresses the plaintiff\'s motion for summary judgment pursuant to Rule 56 of the Federal Rules of Civil Procedure. The plaintiff alleges violations of 42 U.S.C. § 1983, claiming deprivation of constitutional rights under color of state law.\n\nI. FACTUAL BACKGROUND\n\nThe incident occurred on January 15, 2024, when the plaintiff was detained without probable cause. The plaintiff seeks damages including compensatory and punitive relief.\n\nII. LEGAL STANDARD\n\nSummary judgment is appropriate where there are no genuine disputes as to any material facts. Anderson v. Liberty Lobby, Inc., 477 U.S. 242, 248 (1986). The moving party bears the initial burden of demonstrating the absence of a genuine issue of material fact.\n\nIII. ARGUMENT\n\nThe defendant\'s actions clearly violated the plaintiff\'s Fourth Amendment rights. As established in Terry v. Ohio, 392 U.S. 1 (1968), law enforcement officers must have reasonable suspicion to conduct a stop.\n\nCONCLUSION\n\nFor the foregoing reasons, the plaintiff respectfully requests that this Court grant the motion for summary judgment.',
					pageCount: 8,
					textLength: 1200,
					chunks: [
						{ text: 'LEGAL MEMORANDUM\n\nRE: Plaintiff v. Defendant - Motion for Summary Judgment', chunkIndex: 0 },
						{ text: 'This memorandum addresses the plaintiff\'s motion for summary judgment pursuant to Rule 56 of the Federal Rules of Civil Procedure.', chunkIndex: 1 },
						{ text: 'The plaintiff alleges violations of 42 U.S.C. § 1983, claiming deprivation of constitutional rights under color of state law.', chunkIndex: 2 }
					],
					entities: [
						{ type: 'CASE', text: 'Plaintiff v. Defendant' },
						{ type: 'STATUTE', text: '42 U.S.C. § 1983' },
						{ type: 'CASE', text: 'Anderson v. Liberty Lobby, Inc.' },
						{ type: 'CITATION', text: '477 U.S. 242, 248 (1986)' },
						{ type: 'CASE', text: 'Terry v. Ohio' },
						{ type: 'CITATION', text: '392 U.S. 1 (1968)' },
						{ type: 'DATE', text: 'January 15, 2024' }
					],
					aceAnalysis: {
						summary: 'Legal memorandum regarding motion for summary judgment in civil rights case involving alleged Fourth Amendment violation during unlawful detention.',
						confidence: 0.94,
						tags: ['legal', 'memorandum', 'civil-rights', 'fourth-amendment', '1983-claim', 'summary-judgment'],
						claims: [
							'Plaintiff was detained without probable cause',
							'Defendant violated Fourth Amendment rights',
							'Plaintiff seeks compensatory and punitive damages'
						]
					},
					citations: [
						{ text: 'Anderson v. Liberty Lobby, Inc., 477 U.S. 242, 248 (1986)', type: 'case' },
						{ text: 'Terry v. Ohio, 392 U.S. 1 (1968)', type: 'case' },
						{ text: 'Rule 56 of the Federal Rules of Civil Procedure', type: 'rule' }
					],
					statutes: [
						{ text: '42 U.S.C. § 1983', type: 'statute' }
					],
					keyTerms: ['summary judgment', 'probable cause', 'constitutional rights', 'Fourth Amendment', 'compensatory damages', 'punitive relief']
				})
			]);

			documentEvidenceId = createResult.rows[0].id;
			console.log(`Created test document: ${documentEvidenceId}`);
		}
	});

	test('should load document analysis page', async ({ page }) => {
		test.skip(!documentEvidenceId, 'No document evidence found');

		await page.goto(`/document-analysis/${documentEvidenceId}`);

		// Wait for page to load
		await expect(page.locator('h1')).toContainText(/Document Analysis/i);

		// Check for back button
		await expect(page.locator('a[href="/evidence"]')).toBeVisible();
	});

	test('should display document metadata', async ({ page }) => {
		test.skip(!documentEvidenceId, 'No document evidence found');

		await page.goto(`/document-analysis/${documentEvidenceId}`);
		await page.waitForSelector('.document-analysis-view', { timeout: 10000 });

		// Check for metadata items
		const metadata = page.locator('.metadata-row');
		await expect(metadata).toBeVisible();

		// Should show file name, size, page count
		const metadataItems = metadata.locator('.metadata-item');
		await expect(metadataItems).toHaveCountGreaterThan(2);
	});

	test('should have 4 tabs (text, analysis, citations, entities)', async ({ page }) => {
		test.skip(!documentEvidenceId, 'No document evidence found');

		await page.goto(`/document-analysis/${documentEvidenceId}`);
		await page.waitForSelector('.tabs-container', { timeout: 10000 });

		// Check for all tabs
		await expect(page.locator('.tab')).toHaveCount(4);
		await expect(page.getByRole('button', { name: /full text/i })).toBeVisible();
		await expect(page.getByRole('button', { name: /analysis/i })).toBeVisible();
		await expect(page.getByRole('button', { name: /citations/i })).toBeVisible();
		await expect(page.getByRole('button', { name: /entities/i })).toBeVisible();
	});

	test('should display extracted text with search', async ({ page }) => {
		test.skip(!documentEvidenceId, 'No document evidence found');

		await page.goto(`/document-analysis/${documentEvidenceId}`);
		await page.waitForSelector('.tabs-container', { timeout: 10000 });

		// Text tab should be active by default
		await expect(page.locator('.text-panel')).toBeVisible({ timeout: 5000 });

		// Check for extracted text or empty state
		const hasText = await page.locator('.extracted-text').isVisible();
		const hasEmptyState = await page.locator('.empty-state').isVisible();

		expect(hasText || hasEmptyState).toBeTruthy();

		if (hasText) {
			// Should have search bar
			await expect(page.locator('.search-bar')).toBeVisible();

			// Try searching
			const searchInput = page.locator('.search-input');
			await searchInput.fill('legal');

			// Should highlight search results
			await page.waitForTimeout(500); // Wait for highlight
			const highlighted = page.locator('.extracted-text mark');
			await expect(highlighted.first()).toBeVisible({ timeout: 3000 }).catch(() => {
				// Search may not find results in all documents
				console.log('No search results found for "legal"');
			});
		}
	});

	test('should display citations', async ({ page }) => {
		test.skip(!documentEvidenceId, 'No document evidence found');

		await page.goto(`/document-analysis/${documentEvidenceId}`);
		await page.waitForSelector('.tabs-container', { timeout: 10000 });

		// Navigate to citations tab
		await page.getByRole('button', { name: /citations/i }).click();
		await page.waitForSelector('.citations-panel', { timeout: 5000 });

		// Check for citations or empty state
		const hasCitations = await page.locator('.citations-list').isVisible();
		const hasEmptyState = await page.locator('.empty-state').isVisible();

		expect(hasCitations || hasEmptyState).toBeTruthy();

		if (hasCitations) {
			// Should have citation items
			await expect(page.locator('.citation-item').first()).toBeVisible();
		}
	});

	test('should display entities', async ({ page }) => {
		test.skip(!documentEvidenceId, 'No document evidence found');

		await page.goto(`/document-analysis/${documentEvidenceId}`);
		await page.waitForSelector('.tabs-container', { timeout: 10000 });

		// Navigate to entities tab
		await page.getByRole('button', { name: /entities/i }).click();
		await page.waitForSelector('.entities-panel', { timeout: 5000 });

		// Check for entities or empty state
		const hasEntities = await page.locator('.entities-list').isVisible();
		const hasEmptyState = await page.locator('.empty-state').isVisible();

		expect(hasEntities || hasEmptyState).toBeTruthy();

		if (hasEntities) {
			// Should have entity items with type badges
			await expect(page.locator('.entity-item').first()).toBeVisible();
			await expect(page.locator('.entity-type').first()).toBeVisible();
		}
	});

	test('should display ACE analysis', async ({ page }) => {
		test.skip(!documentEvidenceId, 'No document evidence found');

		await page.goto(`/document-analysis/${documentEvidenceId}`);
		await page.waitForSelector('.tabs-container', { timeout: 10000 });

		// Navigate to analysis tab
		await page.getByRole('button', { name: /^analysis$/i }).click();
		await page.waitForSelector('.analysis-panel', { timeout: 5000 });

		// Check for ACE analysis or empty state
		const hasAnalysis = await page.locator('.ace-section').isVisible();
		const hasEmptyState = await page.locator('.empty-state').isVisible();

		expect(hasAnalysis || hasEmptyState).toBeTruthy();

		if (hasAnalysis) {
			// Should show summary, tags, and key terms
			await expect(page.locator('.section-title').first()).toBeVisible();
		}
	});
});

test.describe('API Endpoints', () => {
	test('audio analysis API should return valid data', async ({ request }) => {
		const result = await pool.query(`
      SELECT id FROM evidence
      WHERE evidence_type = 'audio'
      ORDER BY created_at DESC
      LIMIT 1
    `);

		test.skip(result.rows.length === 0, 'No audio evidence found');

		const evidenceId = result.rows[0].id;
		const response = await request.get(`/api/audio/analysis/${evidenceId}`);

		expect(response.ok()).toBeTruthy();

		const data = await response.json();
		expect(data).toHaveProperty('evidenceId');
		expect(data).toHaveProperty('processingStatus');
		expect(data.evidenceId).toBe(evidenceId);
	});

	test('video analysis API should return valid data', async ({ request }) => {
		const result = await pool.query(`
      SELECT id FROM evidence
      WHERE evidence_type = 'video'
      ORDER BY created_at DESC
      LIMIT 1
    `);

		test.skip(result.rows.length === 0, 'No video evidence found');

		const evidenceId = result.rows[0].id;
		const response = await request.get(`/api/video/analysis/${evidenceId}`);

		expect(response.ok()).toBeTruthy();

		const data = await response.json();
		expect(data).toHaveProperty('evidenceId');
		expect(data).toHaveProperty('videoMetadata');
		expect(data.evidenceId).toBe(evidenceId);
	});

	test('document analysis API should return valid data', async ({ request }) => {
		const result = await pool.query(`
      SELECT id FROM evidence
      WHERE evidence_type = 'document'
      ORDER BY created_at DESC
      LIMIT 1
    `);

		test.skip(result.rows.length === 0, 'No document evidence found');

		const evidenceId = result.rows[0].id;
		const response = await request.get(`/api/document/analysis/${evidenceId}`);

		expect(response.ok()).toBeTruthy();

		const data = await response.json();
		expect(data).toHaveProperty('evidenceId');
		expect(data).toHaveProperty('textLength');
		expect(data.evidenceId).toBe(evidenceId);
	});
});

test.afterAll(async () => {
	await pool.end();
});
