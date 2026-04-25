#!/usr/bin/env node

/**
 * Phase 72 Dev Watcher
 * Streams Vite/Svelte/TS errors into Phase 72 brain
 * Parses CLI output and POSTs to /api/phase72/capture-error
 */

import { spawn } from 'node:child_process';
import readline from 'node:readline';
import crypto from 'node:crypto';
import fetch from 'node-fetch';

const PHASE72_INGEST_URL =
	process.env.PHASE72_INGEST_URL ?? 'http://127.0.0.1:5173/api/phase72/capture-error';

const PHASE72_SUGGEST_URL =
	process.env.PHASE72_SUGGEST_URL ?? 'http://127.0.0.1:5173/api/phase72/suggest-fix';

console.log('[phase72-watch] Starting dev watcher...');
console.log(`[phase72-watch] Ingest URL: ${PHASE72_INGEST_URL}`);
console.log(`[phase72-watch] Suggest URL: ${PHASE72_SUGGEST_URL}`);
console.log('');

// Spawn the real dev server
const child = spawn('npm', ['run', 'dev:quic:vite-only'], {
	shell: process.platform === 'win32',
	env: process.env,
	stdio: ['inherit', 'pipe', 'pipe']
});

const rlStdout = readline.createInterface({ input: child.stdout });
const rlStderr = readline.createInterface({ input: child.stderr });

/**
 * Parse TypeScript/Svelte error lines
 * Patterns:
 *   src/routes/analysis-center/+page.svelte:12:3 - error TS2304: Cannot find name 'X'.
 *   src/lib/components/Card.svelte(42,13): error TS2339: Property 'variant' does not exist
 */
function parseLine(line) {
	// Pattern 1: file:line:col - error CODE: message
	const match1 = line.match(/^(.+?):(\d+):(\d+)\s+-\s+(error|warning)\s+(\w+\d+):\s+(.+)$/);
	if (match1) {
		return {
			file_path: match1[1],
			line: Number(match1[2]),
			col: Number(match1[3]),
			severity: match1[4],
			code: match1[5],
			message: match1[6]
		};
	}

	// Pattern 2: file(line,col): error CODE: message
	const match2 = line.match(/^(.+?)\((\d+),(\d+)\):\s+(error|warning)\s+(\w+\d+):\s+(.+)$/);
	if (match2) {
		return {
			file_path: match2[1],
			line: Number(match2[2]),
			col: Number(match2[3]),
			severity: match2[4],
			code: match2[5],
			message: match2[6]
		};
	}

	// Pattern 3: Vite plugin errors
	const match3 = line.match(/\[plugin:(\w+)\]\s+(\w+\d+):\s+(.+?)\s+\((.+):(\d+):(\d+)\)/);
	if (match3) {
		return {
			file_path: match3[4],
			line: Number(match3[5]),
			col: Number(match3[6]),
			severity: 'error',
			code: match3[2],
			message: match3[3],
			plugin: match3[1]
		};
	}

	return null;
}

/**
 * Parse SvelteKit-specific errors
 */
function parseSvelteKitError(line) {
	// Cannot import $lib/server/... into code that runs in the browser
	if (line.includes('Cannot import $lib/server/') && line.includes('into code that runs in the browser')) {
		return {
			file_path: 'src/routes/analysis-center/+page.svelte',
			line: 0,
			col: 0,
			code: 'SVELTEKIT_SERVER_IMPORT',
			severity: 'error',
			message: 'Cannot import server-side module into client component'
		};
	}

	return null;
}

async function sendToPhase72(err) {
	const error_hash = crypto
		.createHash('sha256')
		.update(`${err.file_path}:${err.line}:${err.col}:${err.code}:${err.message}`)
		.digest('hex');

	const payload = {
		error_hash,
		file_path: err.file_path,
		line: err.line,
		col: err.col,
		code: err.code,
		severity: err.severity,
		message: err.message,
		source: 'cli',
		timestamp: new Date().toISOString()
	};

	try {
		const res = await fetch(PHASE72_INGEST_URL, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(payload)
		});

		if (!res.ok) {
			const text = await res.text();
			console.error(`[phase72-watch] ingest failed: ${res.status} ${text}`);
			return;
		}

		console.log(`[phase72-watch] ✓ Captured: ${err.code} in ${err.file_path}:${err.line}`);
	} catch (e) {
		console.error(`[phase72-watch] ingest error: ${e.message}`);
	}
}

async function getSuggestion(err) {
	const payload = {
		route: inferRouteFromPath(err.file_path),
		code: err.code,
		message: err.message,
		file_path: err.file_path,
		line: err.line,
		col: err.col
	};

	try {
		const res = await fetch(PHASE72_SUGGEST_URL, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(payload)
		});

		if (!res.ok) {
			const text = await res.text();
			console.error(`[phase72-watch] suggest failed: ${res.status} ${text}`);
			return;
		}

		const data = await res.json();

		console.log('\n🧠 Error Brain Suggestion:');
		console.log('━'.repeat(60));
		if (data.plan) {
			console.log(data.plan);
		} else if (data.suggestions && data.suggestions.length > 0) {
			console.log(data.suggestions[0]);
		} else {
			console.log(JSON.stringify(data, null, 2));
		}
		console.log('━'.repeat(60));
		console.log('');
	} catch (e) {
		console.error(`[phase72-watch] suggest error: ${e.message}`);
	}
}

function inferRouteFromPath(file_path) {
	if (file_path.includes('src/routes')) {
		return (
			file_path
				.replace(/\\/g, '/')
				.replace(/^.*src\/routes/, '')
				.replace(/\+page\.(svelte|ts|js)$/, '')
				.replace(/\+layout\.(svelte|ts|js)$/, '')
				.replace(/\+server\.(ts|js)$/, '') || '/'
		);
	}
	return '/';
}

function handleLine(line, streamLabel) {
	// Always echo to terminal
	process[streamLabel].write(line + '\n');

	// Try to parse as error
	const parsedTs = parseLine(line);
	if (parsedTs) {
		void sendToPhase72(parsedTs);
		void getSuggestion(parsedTs);
		return;
	}

	const parsedSvelte = parseSvelteKitError(line);
	if (parsedSvelte) {
		void sendToPhase72(parsedSvelte);
		void getSuggestion(parsedSvelte);
		return;
	}
}

rlStdout.on('line', (line) => handleLine(line, 'stdout'));
rlStderr.on('line', (line) => handleLine(line, 'stderr'));

child.on('exit', (code) => {
	console.log(`[phase72-watch] dev exited with code ${code}`);
	process.exit(code ?? 1);
});

child.on('error', (err) => {
	console.error(`[phase72-watch] spawn error: ${err.message}`);
	process.exit(1);
});

// Handle Ctrl+C gracefully
process.on('SIGINT', () => {
	console.log('\n[phase72-watch] Received SIGINT, killing child...');
	child.kill('SIGINT');
});
