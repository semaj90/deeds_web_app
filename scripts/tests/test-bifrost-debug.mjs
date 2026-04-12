/**
 * Debug Bifrost Response Format
 */

const BIFROST_URL = 'http://127.0.0.1:3040';

async function debugBifrost() {
	console.log('Testing Bifrost response format...\n');

	const res = await fetch(`${BIFROST_URL}/v1/chat/completions`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			model: 'ollama-local/gemma4-legal:latest',
			messages: [{ role: 'user', content: 'What is negligence? Answer in 10 words.' }],
			temperature: 0.7,
			max_tokens: 50,
			stream: false,
		}),
	});

	console.log('Status:', res.status, res.statusText);
	console.log('Headers:', Object.fromEntries(res.headers.entries()));
	console.log();

	const rawText = await res.text();
	console.log('Raw response (first 500 chars):');
	console.log(rawText.slice(0, 500));
	console.log();

	try {
		const data = JSON.parse(rawText);
		console.log('Parsed JSON structure:');
		console.log(JSON.stringify(data, null, 2).slice(0, 1000));
	} catch (e) {
		console.error('Failed to parse JSON:', e.message);
	}
}

debugBifrost().catch(console.error);
