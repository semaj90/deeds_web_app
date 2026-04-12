/**
 * Test Ollama Direct (bypass Bifrost)
 */

async function testOllama() {
	console.log('Testing Ollama directly at http://localhost:11434...\n');

	const start = Date.now();
	const res = await fetch('http://localhost:11434/api/chat', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			model: 'gemma4-legal:latest',
			messages: [{ role: 'user', content: 'What is negligence? Answer in 10 words.' }],
			stream: false,
		}),
	});

	const latency = Date.now() - start;
	console.log('Status:', res.status);
	console.log('Latency:', latency + 'ms');
	console.log();

	if (!res.ok) {
		const text = await res.text();
		console.error('Error:', text.slice(0, 500));
		return;
	}

	const data = await res.json();
	console.log('Response:', data.message?.content ?? 'NO CONTENT');
	console.log();
	console.log('Full structure:', JSON.stringify(data, null, 2).slice(0, 800));
}

testOllama().catch(console.error);
