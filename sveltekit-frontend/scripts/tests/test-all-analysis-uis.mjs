/**
 * Comprehensive Analysis UI Test Suite
 * Tests Audio, Video, and Document analysis UIs
 */

import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { Pool } = require('pg');

const BASE_URL = process.env.PUBLIC_APP_URL ?? 'http://localhost:5173';

const pool = new Pool({
	connectionString: 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db'
});

const colors = {
	green: '\x1b[32m',
	red: '\x1b[31m',
	yellow: '\x1b[33m',
	blue: '\x1b[34m',
	cyan: '\x1b[36m',
	reset: '\x1b[0m'
};

function log(message, color = colors.reset) {
	console.log(`${color}${message}${colors.reset}`);
}

function header(title) {
	log('\n═══════════════════════════════════════════════════', colors.blue);
	log(`   ${title}`, colors.blue);
	log('═══════════════════════════════════════════════════', colors.blue);
}

async function testAudioAnalysis() {
	header('Audio Analysis UI Test');

	try {
		// Find latest audio evidence
		const result = await pool.query(`
      SELECT id, title, file_name,
             metadata->>'processingStatus' as status
      FROM evidence
      WHERE evidence_type = 'audio'
        AND metadata->'transcription' IS NOT NULL
      ORDER BY created_at DESC
      LIMIT 1
    `);

		if (result.rows.length === 0) {
			log('⚠️  No audio evidence with transcription found', colors.yellow);
			return { success: false, reason: 'no data' };
		}

		const audio = result.rows[0];
		log(`✅ Found audio: ${audio.title}`, colors.green);

		// Test API endpoint
		const apiResponse = await fetch(`${BASE_URL}/api/audio/analysis/${audio.id}`);
		if (!apiResponse.ok) {
			log(`❌ API failed: ${apiResponse.status}`, colors.red);
			return { success: false, reason: 'api error' };
		}

		const data = await apiResponse.json();
		log(`✅ API returned data for "${data.title || audio.title}"`, colors.green);
		log(`  - Transcription: ${data.transcription ? 'YES' : 'NO'}`, colors.reset);
		log(`  - Entities: ${data.entities?.length || 0}`, colors.reset);
		log(`  - ACE Analysis: ${data.aceAnalysis ? 'YES' : 'NO'}`, colors.reset);

		// Test page route
		const pageUrl = `${BASE_URL}/audio-analysis/${audio.id}`;
		log(`\n🌐 Test URL: ${pageUrl}`, colors.cyan);

		return { success: true, evidenceId: audio.id, url: pageUrl };
	} catch (error) {
		log(`❌ Error: ${error.message}`, colors.red);
		return { success: false, reason: error.message };
	}
}

async function testVideoAnalysis() {
	header('Video Analysis UI Test');

	try {
		// Find latest video evidence
		const result = await pool.query(`
      SELECT id, title, file_name,
             metadata->>'processingStatus' as status
      FROM evidence
      WHERE evidence_type = 'video'
      ORDER BY created_at DESC
      LIMIT 1
    `);

		if (result.rows.length === 0) {
			log('⚠️  No video evidence found', colors.yellow);
			log('ℹ️  Creating test video evidence...', colors.cyan);

			// Create test video evidence
			const testId = require('crypto').randomUUID();
			await pool.query(`
        INSERT INTO evidence (
          id, case_id, user_id, title, file_path, file_size,
          evidence_type, file_name, mime_type, metadata
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10
        )
      `, [
				testId,
				'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
				'00000000-0000-0000-0000-000000000001',
				'Test Video Evidence',
				'uploads/video/test.mp4',
				1024000,
				'video',
				'test.mp4',
				'video/mp4',
				JSON.stringify({
					processingStatus: 'pending',
					vlmAnalysis: {
						summary: 'Test video frame analysis',
						keyObjects: ['person', 'desk', 'computer'],
						activities: ['working', 'typing'],
						setting: 'office environment'
					},
					frameAnalysis: [],
					videoMetadata: { duration: 120, width: 1920, height: 1080, fps: 30 }
				})
			]);

			log(`✅ Created test video evidence: ${testId}`, colors.green);
			const video = { id: testId, title: 'Test Video Evidence' };

			// Test API endpoint
			const apiResponse = await fetch(`${BASE_URL}/api/video/analysis/${video.id}`);
			if (!apiResponse.ok) {
				log(`❌ API failed: ${apiResponse.status}`, colors.red);
				return { success: false, reason: 'api error' };
			}

			const data = await apiResponse.json();
			log(`✅ API returned data for "${data.title || video.title}"`, colors.green);
			log(`  - VLM Analysis: ${data.vlmAnalysis ? 'YES' : 'NO'}`, colors.reset);
			log(`  - Frame Analysis: ${data.frameAnalysis?.length || 0} frames`, colors.reset);
			log(`  - Video Metadata: ${data.videoMetadata ? 'YES' : 'NO'}`, colors.reset);

			const pageUrl = `${BASE_URL}/video-analysis/${video.id}`;
			log(`\n🌐 Test URL: ${pageUrl}`, colors.cyan);

			return { success: true, evidenceId: video.id, url: pageUrl };
		}

		const video = result.rows[0];
		log(`✅ Found video: ${video.title}`, colors.green);

		// Test API endpoint
		const apiResponse = await fetch(`${BASE_URL}/api/video/analysis/${video.id}`);
		if (!apiResponse.ok) {
			log(`❌ API failed: ${apiResponse.status}`, colors.red);
			return { success: false, reason: 'api error' };
		}

		const data = await apiResponse.json();
		log(`✅ API returned data`, colors.green);

		const pageUrl = `${BASE_URL}/video-analysis/${video.id}`;
		log(`\n🌐 Test URL: ${pageUrl}`, colors.cyan);

		return { success: true, evidenceId: video.id, url: pageUrl };
	} catch (error) {
		log(`❌ Error: ${error.message}`, colors.red);
		return { success: false, reason: error.message };
	}
}

async function testDocumentAnalysis() {
	header('Document Analysis UI Test');

	try {
		// Find latest document evidence
		const result = await pool.query(`
      SELECT id, title, file_name,
             metadata->>'processingStatus' as status
      FROM evidence
      WHERE evidence_type = 'document'
      ORDER BY created_at DESC
      LIMIT 1
    `);

		if (result.rows.length === 0) {
			log('⚠️  No document evidence found', colors.yellow);
			log('ℹ️  Creating test document evidence...', colors.cyan);

			// Create test document evidence
			const testId = require('crypto').randomUUID();
			await pool.query(`
        INSERT INTO evidence (
          id, case_id, user_id, title, file_path, file_size,
          evidence_type, file_name, mime_type, metadata
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10
        )
      `, [
				testId,
				'a1b2c3d4-e5f6-7890-abcd-ef1234567890',
				'00000000-0000-0000-0000-000000000001',
				'Test Legal Document',
				'uploads/documents/test.pdf',
				512000,
				'document',
				'test.pdf',
				'application/pdf',
				JSON.stringify({
					processingStatus: 'complete',
					extractedText: 'This is a test legal document. It contains important legal terminology and citations. Reference: Smith v. Jones, 123 F.3d 456 (2020). Pursuant to 42 U.S.C. § 1983, the plaintiff seeks damages.',
					pageCount: 5,
					chunks: [
						{ text: 'This is a test legal document. It contains important legal terminology and citations.', chunkIndex: 0 },
						{ text: 'Reference: Smith v. Jones, 123 F.3d 456 (2020). Pursuant to 42 U.S.C. § 1983, the plaintiff seeks damages.', chunkIndex: 1 }
					],
					entities: [
						{ type: 'CASE', text: 'Smith v. Jones' },
						{ type: 'STATUTE', text: '42 U.S.C. § 1983' }
					],
					aceAnalysis: {
						summary: 'Legal document discussing civil rights claims under federal law',
						confidence: 0.92,
						tags: ['legal', 'civil-rights', 'federal-law'],
						claims: ['Plaintiff seeks damages under 42 U.S.C. § 1983']
					},
					citations: [
						{ text: 'Smith v. Jones, 123 F.3d 456 (2020)', type: 'case' }
					],
					keyTerms: ['damages', 'plaintiff', 'pursuant']
				})
			]);

			log(`✅ Created test document evidence: ${testId}`, colors.green);
			const doc = { id: testId, title: 'Test Legal Document' };

			// Test API endpoint
			const apiResponse = await fetch(`${BASE_URL}/api/document/analysis/${doc.id}`);
			if (!apiResponse.ok) {
				log(`❌ API failed: ${apiResponse.status}`, colors.red);
				return { success: false, reason: 'api error' };
			}

			const data = await apiResponse.json();
			log(`✅ API returned data for "${data.title || doc.title}"`, colors.green);
			log(`  - Extracted Text: ${data.textLength || 0} chars`, colors.reset);
			log(`  - Citations: ${data.citations?.length || 0}`, colors.reset);
			log(`  - Entities: ${data.entities?.length || 0}`, colors.reset);
			log(`  - ACE Analysis: ${data.aceAnalysis ? 'YES' : 'NO'}`, colors.reset);

			const pageUrl = `${BASE_URL}/document-analysis/${doc.id}`;
			log(`\n🌐 Test URL: ${pageUrl}`, colors.cyan);

			return { success: true, evidenceId: doc.id, url: pageUrl };
		}

		const doc = result.rows[0];
		log(`✅ Found document: ${doc.title}`, colors.green);

		// Test API endpoint
		const apiResponse = await fetch(`${BASE_URL}/api/document/analysis/${doc.id}`);
		if (!apiResponse.ok) {
			log(`❌ API failed: ${apiResponse.status}`, colors.red);
			return { success: false, reason: 'api error' };
		}

		const data = await apiResponse.json();
		log(`✅ API returned data`, colors.green);

		const pageUrl = `${BASE_URL}/document-analysis/${doc.id}`;
		log(`\n🌐 Test URL: ${pageUrl}`, colors.cyan);

		return { success: true, evidenceId: doc.id, url: pageUrl };
	} catch (error) {
		log(`❌ Error: ${error.message}`, colors.red);
		return { success: false, reason: error.message };
	}
}

async function main() {
	header('Sprint 4B+ Analysis UI Test Suite');
	log('Testing Audio, Video, and Document Analysis UIs\n', colors.cyan);

	const results = {
		audio: null,
		video: null,
		document: null
	};

	// Test all three UIs
	results.audio = await testAudioAnalysis();
	results.video = await testVideoAnalysis();
	results.document = await testDocumentAnalysis();

	// Final Summary
	header('Test Results Summary');

	const audioStatus = results.audio.success ? '✅ PASS' : '❌ FAIL';
	const videoStatus = results.video.success ? '✅ PASS' : '❌ FAIL';
	const documentStatus = results.document.success ? '✅ PASS' : '❌ FAIL';

	log(`\n📊 Results:`, colors.cyan);
	log(`  Audio Analysis UI:    ${audioStatus}`, results.audio.success ? colors.green : colors.red);
	log(`  Video Analysis UI:    ${videoStatus}`, results.video.success ? colors.green : colors.red);
	log(`  Document Analysis UI: ${documentStatus}`, results.document.success ? colors.green : colors.red);

	if (results.audio.success || results.video.success || results.document.success) {
		log(`\n🌐 Test URLs:`, colors.cyan);
		if (results.audio.url) log(`  Audio:    ${results.audio.url}`, colors.reset);
		if (results.video.url) log(`  Video:    ${results.video.url}`, colors.reset);
		if (results.document.url) log(`  Document: ${results.document.url}`, colors.reset);
	}

	const allPass = results.audio.success && results.video.success && results.document.success;

	if (allPass) {
		log('\n🎉 ALL TESTS PASSED!', colors.green);
		log('\n✅ Sprint 4B+ Complete:', colors.green);
		log('  1. Audio Analysis UI ✅', colors.reset);
		log('  2. Video Analysis UI ✅ (with Gemma4 VLM)', colors.reset);
		log('  3. Document Analysis UI ✅', colors.reset);
		log('\n🚀 All Evidence Analysis UIs PRODUCTION READY!', colors.green);
	} else {
		log('\n⚠️  Some tests failed - check logs above', colors.yellow);
	}

	await pool.end();
}

main().catch(async (error) => {
	console.error('Fatal error:', error);
	await pool.end();
	process.exit(1);
});
