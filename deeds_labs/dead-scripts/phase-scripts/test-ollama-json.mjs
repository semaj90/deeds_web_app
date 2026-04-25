#!/usr/bin/env node
/**
 * Test Ollama JSON response parsing
 * Debugging Phase 89 JSON errors
 */

const OLLAMA_URL = 'http://localhost:11434';
const MODEL = 'gemma3-legal:latest';

async function testOllamaJSON() {
	console.log('🧪 Testing Ollama JSON Response...\n');

	try {
		const prompt = 'Explain TypeScript type errors in 2 sentences.';

		console.log(`📤 Sending request to ${OLLAMA_URL}/api/generate`);
		console.log(`   Model: ${MODEL}`);
		console.log(`   Prompt: ${prompt}\n`);

		const response = await fetch(`${OLLAMA_URL}/api/generate`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				model: MODEL,
				prompt: prompt,
				stream: false,
				options: {
					temperature: 0.3,
					num_predict: 100
				}
			})
		});

		console.log(`📥 Response Status: ${response.status} ${response.statusText}`);
		console.log(`   Content-Type: ${response.headers.get('content-type')}\n`);

		if (!response.ok) {
			const errorText = await response.text();
			console.error(`❌ HTTP Error: ${errorText}`);
			return;
		}

		// Get raw text first
		const rawText = await response.text();
		console.log('📄 Raw Response Text:');
		console.log('─'.repeat(60));
		console.log(rawText.slice(0, 500)); // First 500 chars
		console.log('─'.repeat(60));
		console.log();

		// Try to parse as JSON
		try {
			const data = JSON.parse(rawText);
			console.log('✅ JSON Parsed Successfully!\n');
			console.log('📊 Parsed Object Keys:', Object.keys(data));
			console.log();

			if (data.response) {
				console.log('🤖 AI Response:');
				console.log('─'.repeat(60));
				console.log(data.response);
				console.log('─'.repeat(60));
			}

			// Show full object structure
			console.log('\n📋 Full JSON Structure:');
			console.log(JSON.stringify(data, null, 2).slice(0, 1000));

		} catch (jsonError) {
			console.error('❌ JSON Parse Error:', jsonError.message);
			console.error('\n🔍 Debugging Info:');
			console.error(`   Raw text length: ${rawText.length} chars`);
			console.error(`   First char code: ${rawText.charCodeAt(0)}`);
			console.error(`   Last char code: ${rawText.charCodeAt(rawText.length - 1)}`);

			// Try to find JSON in response
			const jsonMatch = rawText.match(/{[\s\S]*}/);
			if (jsonMatch) {
				console.error('\n🔎 Found JSON pattern, attempting parse...');
				try {
					const extracted = JSON.parse(jsonMatch[0]);
					console.log('✅ Extracted JSON successfully:', extracted);
				} catch (e) {
					console.error('❌ Still failed:', e.message);
				}
			}
		}

	} catch (error) {
		console.error('❌ Test Failed:', error.message);
		console.error(error.stack);
	}
}

// Run test
testOllamaJSON();
