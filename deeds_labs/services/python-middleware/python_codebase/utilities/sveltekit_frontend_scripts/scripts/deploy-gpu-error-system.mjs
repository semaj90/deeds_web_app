import { exec } from 'child_process';
import { promisify } from 'util';
import process from 'process';
const execAsync = promisify(exec);

const SERVICES = [
	{ name: 'frontend', url: 'http://localhost:5173/health', dockerName: 'frontend', critical: false },
	{ name: 'context7', url: 'http://localhost:8777/health', critical: true },
	{ name: 'ollama', url: 'http://localhost:11434/', dockerName: 'ollama', critical: true },
	{ name: 'gpu-orchestrator', url: 'http://localhost:8095/health', dockerName: 'gpu-orchestrator', critical: true },
];

function log(...args) {
	console.log('[deploy-gpu-error-system]', ...args);
}

async function commandExists(cmd) {
	try {
		await execAsync(cmd);
		return true;
	} catch {
		return false;
	}
}

async function checkNvidiaSmi() {
	try {
		const { stdout } = await execAsync('nvidia-smi -L');
		return { ok: true, output: stdout.trim() };
	} catch (err) {
		return { ok: false, error: (err && err.message) || String(err) };
	}
}

async function checkDocker() {
	try {
		const { stdout } = await execAsync('docker --version');
		return { ok: true, output: stdout.trim() };
	} catch (err) {
		return { ok: false, error: (err && err.message) || String(err) };
	}
}

async function fetchWithTimeout(url, timeoutMs = 3000) {
	const controller = new AbortController();
	const id = setTimeout(() => controller.abort(), timeoutMs);
	try {
		const res = await fetch(url, { signal: controller.signal });
		clearTimeout(id);
		return { ok: res.ok, status: res.status, text: await safeText(res) };
	} catch (err) {
		clearTimeout(id);
		return { ok: false, error: (err && err.message) || String(err) };
	}
}

async function safeText(res) {
	try {
		return await res.text();
	} catch {
		return '';
	}
}

async function restartDockerService(dockerName) {
	try {
		// Use docker compose if available; fallback to docker restart
		const useCompose = await commandExists('docker compose version').then(Boolean).catch(() => false);
		if (useCompose) {
			await execAsync(`docker compose restart ${dockerName}`);
		} else {
			await execAsync(`docker restart ${dockerName}`);
		}
		return { ok: true };
	} catch (err) {
		return { ok: false, error: (err && err.message) || String(err) };
	}
}

async function main() {
	const doRestart = process.argv.includes('--restart');

	log('Starting GPU & service diagnostic' + (doRestart ? ' (with restart enabled)' : ''));

	const gpuCheck = await checkNvidiaSmi();
	if (gpuCheck.ok) {
		log('GPU detected:', gpuCheck.output.split('\n')[0] ?? gpuCheck.output);
	} else {
		log('GPU check failed or no GPU present:', gpuCheck.error);
	}

	const dockerCheck = await checkDocker();
	if (!dockerCheck.ok) {
		log('Docker not available:', dockerCheck.error);
	} else {
		log('Docker available:', dockerCheck.output.split('\n')[0]);
	}

	const serviceResults = [];
	for (const svc of SERVICES) {
		log(`Checking ${svc.name} at ${svc.url} ...`);
		const res = await fetchWithTimeout(svc.url, 3500);
		const ok = !!res.ok && (res.status >= 200 && res.status < 400);
		serviceResults.push({ ...svc, ok, detail: res });
		log(`  -> ${svc.name} ${ok ? 'OK' : 'UNHEALTHY'}`, ok ? `status=${res.status}` : res.error ?? '');
	}

	// Attempt restarts if requested and docker is present
	const restartResults = [];
	if (doRestart && dockerCheck.ok) {
		for (const svc of serviceResults.filter(s => !s.ok && s.dockerName)) {
			log(`Attempting restart for docker service: ${svc.dockerName} ...`);
			const r = await restartDockerService(svc.dockerName);
			restartResults.push({ service: svc.name, dockerName: svc.dockerName, result: r });
			log(`  -> restart ${r.ok ? 'succeeded' : 'failed'}`, r.error ?? '');
		}
	} else if (doRestart && !dockerCheck.ok) {
		log('Restart requested but Docker not available; skipping restart attempts.');
	}

	// Summary & exit code
	const summary = {
		timestamp: new Date().toISOString(),
		gpu: gpuCheck,
		docker: dockerCheck,
		services: serviceResults.map(s => ({ name: s.name, ok: s.ok, url: s.url })),
		restartAttempts: restartResults,
	};

	console.log(JSON.stringify({ summary }, null, 2));

	const criticalDown = serviceResults.some(s => s.critical && !s.ok);
	if (criticalDown) {
		log('One or more critical services are down.');
		process.exit(2);
	}

	if (!dockerCheck.ok) {
		process.exit(3);
	}

	log('Diagnostics completed successfully.');
	process.exit(0);
}

main().catch(err => {
	console.error('[deploy-gpu-error-system] Unhandled error:', err);
	process.exit(99);
});