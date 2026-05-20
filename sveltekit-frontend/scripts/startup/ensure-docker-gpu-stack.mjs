#!/usr/bin/env node

import { spawn, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..', '..');
const rootDir = path.resolve(projectRoot, '..');
const composeFile = path.join(rootDir, 'docker-compose.yml');

const AUDIT = process.argv.includes('--audit');
const DRY = process.argv.includes('--dry');

const SERVICES = [
	{ service: 'postgres', container: 'legal-ai-postgres' },
	{ service: 'redis', container: 'legal-ai-redis' },
	{ service: 'qdrant', container: 'legal-ai-qdrant' },
	{ service: 'seaweedfs-master', container: 'legal-ai-seaweed-master' },
	{ service: 'seaweedfs-volume', container: 'legal-ai-seaweed-volume' },
	{ service: 'seaweedfs-filer', container: 'legal-ai-seaweed-filer' },
	{ service: 'seaweedfs-s3', container: 'legal-ai-seaweed-s3' },
];

function log(message) {
	console.log(`[docker-gpu] ${message}`);
}

function warn(message) {
	console.warn(`[docker-gpu] ${message}`);
}

function runDocker(args, options = {}) {
	return spawnSync('docker', args, {
		cwd: rootDir,
		encoding: 'utf8',
		timeout: options.timeout ?? 15_000,
		...options,
	});
}

function dockerInfoHealthy() {
	try {
		const result = runDocker(['info'], { stdio: 'pipe', timeout: 5_000 });
		return result.status === 0;
	} catch {
		return false;
	}
}

function launchDockerDesktop() {
	if (process.platform !== 'win32') return false;

	const candidates = [
		process.env.DOCKER_DESKTOP_EXE,
		process.env.ProgramFiles
			? path.join(process.env.ProgramFiles, 'Docker', 'Docker', 'Docker Desktop.exe')
			: null,
		process.env['ProgramFiles(x86)']
			? path.join(process.env['ProgramFiles(x86)'], 'Docker', 'Docker', 'Docker Desktop.exe')
			: null,
		process.env.LOCALAPPDATA
			? path.join(process.env.LOCALAPPDATA, 'Programs', 'Docker', 'Docker', 'Docker Desktop.exe')
			: null,
	].filter((candidate) => typeof candidate === 'string' && candidate.length > 0);

	for (const candidate of candidates) {
		if (!existsSync(candidate)) continue;
		log(`Launching Docker Desktop from ${candidate}`);
		const child = spawn(candidate, [], {
			detached: true,
			stdio: 'ignore',
			windowsHide: true,
			env: process.env,
		});
		child.unref();
		return true;
	}

	warn('Docker Desktop.exe was not found in the standard Windows install locations.');
	return false;
}

async function ensureDockerDesktopReady(timeoutMs = 60_000) {
	if (dockerInfoHealthy()) return true;
	if (process.platform !== 'win32') return false;

	if (!launchDockerDesktop()) return false;

	const deadline = Date.now() + timeoutMs;
	while (Date.now() < deadline) {
		if (dockerInfoHealthy()) return true;
		await new Promise((resolve) => setTimeout(resolve, 2_000));
	}

	return false;
}

function inspectContainerState(container) {
	const result = runDocker(['inspect', '-f', '{{.State.Status}}', container], {
		stdio: 'pipe',
		timeout: 5_000,
	});

	if (result.status !== 0) return null;
	return result.stdout.trim() || 'unknown';
}

function startExistingContainers(existingContainers) {
	for (const { container } of existingContainers) {
		const state = inspectContainerState(container);
		if (state === 'running') {
			log(`${container} already running`);
			continue;
		}

		if (!state) {
			continue;
		}

		log(`Starting existing container ${container} (${state})`);
		if (DRY) continue;
		const result = spawnSync('docker', ['start', container], {
			cwd: rootDir,
			stdio: 'inherit',
			timeout: 30_000,
		});
		if (result.status !== 0) {
			throw new Error(`docker start ${container} failed`);
		}
	}
}

function composeMissingServices(missingServices) {
	if (missingServices.length === 0) return;

	const serviceNames = missingServices.map(({ service }) => service);
	log(`Creating missing services via docker compose: ${serviceNames.join(', ')}`);
	if (DRY) return;

	const dockerComposeArgs = ['compose', '-f', composeFile, '--profile', 'seaweedfs', 'up', '-d', ...serviceNames];
	let result = spawnSync('docker', dockerComposeArgs, {
		cwd: rootDir,
		stdio: 'inherit',
		env: process.env,
		timeout: 180_000,
	});

	if (result.error || result.status !== 0) {
		const fallback = spawnSync('docker-compose', ['-f', composeFile, '--profile', 'seaweedfs', 'up', '-d', ...serviceNames], {
			cwd: rootDir,
			stdio: 'inherit',
			env: process.env,
			timeout: 180_000,
		});
		result = fallback;
	}

	if (result.error) throw result.error;
	if (result.status !== 0) {
		throw new Error(`docker compose up -d failed for: ${serviceNames.join(', ')}`);
	}
}

function auditDockerGpuStack() {
	const desktopHealthy = dockerInfoHealthy();
	log(`docker info: ${desktopHealthy ? 'healthy' : 'unhealthy'}`);
	for (const entry of SERVICES) {
		const state = inspectContainerState(entry.container);
		const label = state ?? 'missing';
		console.log(`[docker-gpu] ${entry.container} (${entry.service}) -> ${label}`);
	}
}

async function ensureDockerGpuStack() {
	if (AUDIT) {
		auditDockerGpuStack();
		return;
	}

	if (!dockerInfoHealthy()) {
		log('Docker daemon is not healthy; attempting to launch Docker Desktop ...');
		const ready = await ensureDockerDesktopReady();
		if (!ready) {
			throw new Error('Docker Desktop did not become ready in time. Start Docker Desktop and re-run dev:gpu.');
		}
	}

	const running = [];
	const existingButStopped = [];
	const missing = [];

	for (const entry of SERVICES) {
		const state = inspectContainerState(entry.container);
		if (state === 'running') {
			running.push(entry);
			continue;
		}
		if (!state) {
			missing.push(entry);
			continue;
		}
		existingButStopped.push(entry);
	}

	if (running.length === SERVICES.length) {
		log('All required containers are already running; skipping compose.');
		return;
	}

	startExistingContainers(existingButStopped);
	composeMissingServices(missing);
	log('Docker GPU stack is ready.');
}

try {
	await ensureDockerGpuStack();
	process.exit(0);
} catch (error) {
	console.error(`[docker-gpu] ${error instanceof Error ? error.message : String(error)}`);
	process.exit(1);
}