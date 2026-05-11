/**
 * PRODUCTION HARDENED SMOKE TEST
 * Verifies Phase 1D/E and Phase 2/3 agentic lanes.
 */
const BASE_URL = 'http://localhost:5173';

async function runTest(name, fn) {
	process.stdout.write(`--- ${name} --- `);
	try {
		await fn();
		console.log('\x1b[32mPASS\x1b[0m');
	} catch (err) {
		console.log('\x1b[31mFAIL\x1b[0m');
		console.error('  ', err.message);
		process.exit(1);
	}
}

async function main() {
	console.log('\n=== Production Hardened Smoke ===');
	console.log(`Server: ${BASE_URL}\n`);

	await runTest('Telemetry Stats', async () => {
		const res = await fetch(`${BASE_URL}/api/admin/inference-stats`);
		if (!res.ok) throw new Error(`HTTP ${res.status}`);
		const data = await res.json();
		if (!data.queriedAt) throw new Error('Missing queriedAt');
	});

	await runTest('Active Jobs Lane', async () => {
		const res = await fetch(`${BASE_URL}/api/admin/jobs`);
		if (!res.ok) throw new Error(`HTTP ${res.status}`);
		const data = await res.json();
		if (!Array.isArray(data.jobs)) throw new Error('Jobs should be an array');
	});

	await runTest('Inference Lane (VRAM/KV)', async () => {
		const res = await fetch(`${BASE_URL}/api/admin/inference-lane`);
		if (!res.ok) throw new Error(`HTTP ${res.status}`);
		const data = await res.json();
		if (typeof data.ctxMax !== 'number') throw new Error('Invalid ctxMax');
	});

	await runTest('Agentic Diagnostic API', async () => {
		// Just verify the endpoint is reachable (POST without body should fail nicely or 401/400)
		const res = await fetch(`${BASE_URL}/api/admin/diagnose`, { method: 'POST', body: '{}' });
		if (res.status !== 400 && res.status !== 401 && res.status !== 200) throw new Error(`Unexpected status ${res.status}`);
	});

	await runTest('Legal Strategy Pipeline', async () => {
		// Verify endpoint existence
		const res = await fetch(`${BASE_URL}/api/admin/legal-strategy`, { method: 'POST', body: '{}' });
		if (res.status !== 400 && res.status !== 401 && res.status !== 200) throw new Error(`Unexpected status ${res.status}`);
	});

	console.log('\n\x1b[32m=== All production gates green ===\x1b[0m\n');
}

main();
