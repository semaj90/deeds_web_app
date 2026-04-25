#!/usr/bin/env node

/**
 * Quick test of Gemini 3 with Google Search grounding
 *
 * Usage:
 *   node test-gemini-search.mjs
 */

import dotenv from 'dotenv';
dotenv.config();

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = process.env.GEMINI_MODEL || 'gemini-2.0-flash-exp-1206';
const ENABLE_SEARCH = process.env.GEMINI_ENABLE_SEARCH === 'true';

console.log('🧪 Testing Gemini 3 with Google Search Grounding\n');
console.log('Configuration:');
console.log(`  Model: ${GEMINI_MODEL}`);
console.log(`  Search: ${ENABLE_SEARCH ? '✅ Enabled' : '❌ Disabled'}`);
console.log(`  API Key: ${GEMINI_API_KEY ? '✅ Set' : '❌ Not set'}\n`);

if (!GEMINI_API_KEY) {
	console.error('❌ GEMINI_API_KEY not set in .env');
	console.log('\nTo fix:');
	console.log('  1. Get your API key from https://aistudio.google.com/app/apikey');
	console.log('  2. Add to .env: GEMINI_API_KEY=your-key-here');
	console.log('  3. Set GEMINI_ENABLE_SEARCH=true to enable web search\n');
	process.exit(1);
}

async function testGemini() {
	const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

	const requestBody = {
		contents: [{
			parts: [{ text: 'What are the new features in TypeScript 5.6? List 3 key changes.' }]
		}],
		generationConfig: {
			temperature: 0.3,
			maxOutputTokens: 1024
		}
	};

	// Enable Google Search grounding
	if (ENABLE_SEARCH) {
		requestBody.tools = [{ googleSearch: {} }];
		console.log('🔍 Google Search grounding enabled\n');
	}

	console.log('📤 Sending request to Gemini...\n');

	try {
		const response = await fetch(url, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(requestBody)
		});

		if (!response.ok) {
			const errorText = await response.text();
			throw new Error(`API Error: ${response.status} - ${errorText}`);
		}

		const data = await response.json();

		// Extract content
		const candidate = data.candidates?.[0];
		const content = candidate?.content?.parts?.map(p => p.text || '').join('\n') || '';

		console.log('✅ Response:\n');
		console.log(content);
		console.log('\n');

		// Check for search grounding metadata
		const groundingMetadata = candidate?.groundingMetadata;

		if (groundingMetadata) {
			console.log('🔍 Google Search was used!\n');

			if (groundingMetadata.searchEntryPoint) {
				console.log('Search queries:');
				console.log(groundingMetadata.searchEntryPoint.renderedContent || 'N/A');
				console.log('');
			}

			if (groundingMetadata.groundingChunks) {
				console.log('📚 Sources cited:');
				groundingMetadata.groundingChunks.forEach((chunk, i) => {
					if (chunk.web) {
						console.log(`  ${i + 1}. ${chunk.web.title || chunk.web.uri}`);
						console.log(`     ${chunk.web.uri}`);
					}
				});
				console.log('');
			}
		} else if (ENABLE_SEARCH) {
			console.log('ℹ️  No search grounding metadata found (Gemini may not have needed to search)\n');
		}

		console.log('✅ Test completed successfully!\n');

	} catch (error) {
		console.error('❌ Test failed:', error.message);
		console.error('\nFull error:', error);
		process.exit(1);
	}
}

testGemini();
