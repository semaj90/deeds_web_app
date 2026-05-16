const BASE = process.env.PUBLIC_APP_URL ?? (process.env.BASE_URL || 'http://localhost:5173');

// Color helpers
const green = (s) => `\x1b[32m${s}\x1b[0m`;
const red = (s) => `\x1b[31m${s}\x1b[0m`;
const blue = (s) => `\x1b[34m${s}\x1b[0m`;

async function run() {
	console.log(blue('\nWiki Smoke Test (POST)'));
	console.log(`Target: ${BASE}/api/codeintel/wiki\n`);

	try {
		const res = await fetch(`${BASE}/api/codeintel/wiki`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				query: 'How does authentication work?',
				task: 'overview'
			})
		});
		
		if (!res.ok && res.status !== 207) {
			throw new Error(`HTTP ${res.status}`);
		}
		
		const data = await res.json();
		
		if (data.ok || data.degraded) {
			console.log(green('  PASS: Wiki endpoint responded'));
			console.log(`  Status: ${data.degraded ? 'Degraded (Heuristic)' : 'Full (Gemma4)'}`);
			console.log(`  Title: ${data.title || 'Untitled'}`);
			process.exit(0);
		} else {
			throw new Error('Response shape mismatch');
		}
	} catch (err) {
		console.log(red(`  FAIL: Wiki endpoint failed: ${err.message}`));
		process.exit(1);
	}
}

run();
