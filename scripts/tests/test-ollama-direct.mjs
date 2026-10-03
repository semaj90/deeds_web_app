/**
 * Test llama-server Direct (bypass Bifrost; Ollama is embeddings-only)
 */

async function testOllama() {
	console.log('Testing llama-server directly at http://127.0.0.1:8090...\n');

	const start = Date.now();
	const res = await fetch(`${process.env.LLAMA_SERVER_URL ?? 'http://127.0.0.1:8090'}/v1/chat/completions`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			model: process.env.LLAMA_SERVER_MODEL ?? 'ornith-1.5-9b',
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
	console.log('Response:', data.choices?.[0]?.message?.content ?? 'NO CONTENT');
	console.log();
	console.log('Full structure:', JSON.stringify(data, null, 2).slice(0, 800));
}

testOllama().catch(console.error);
