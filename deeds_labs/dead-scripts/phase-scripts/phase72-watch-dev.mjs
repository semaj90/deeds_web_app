#!/usr/bin/env node

/**
 * Phase 72 Dev Watcher
 * Spawns npm run dev:quic, watches stderr/stdout
 * Captures errors and sends to Phase 72 brain
 */

import { spawn } from 'node:child_process';
import readline from 'node:readline';

const DEV_URL = 'http://localhost:5173';
const CAPTURE_URL = `${DEV_URL}/api/phase72/capture-error`;
const SUGGEST_URL = `${DEV_URL}/api/phase72/suggest-fix`;

// --- helpers ---------------------------------------------------------

function guessRoute(filePath) {
	// src/routes/analysis-center/+page.svelte  -> /analysis-center
	const m = filePath.match(
		/src[\\/](routes[\\/].+?)(?:\+page|\+layout|\+server)?\.(svelte|ts|js)/
	);
	if (!m) return '/';
	let seg = m[1].replace(/^routes[\\/]/, '');
	seg = seg.replace(/\\/g, '/');
	if (!seg.startsWith('/')) seg = '/' + seg;
	return seg;
}

async function sendToBrain(payload) {
	// capture in DB
	await fetch(CAPTURE_URL, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(payload)
	}).catch((err) => {
		console.error('[Phase72] capture-error failed:', err.message);
	});

	// ask for fix suggestions
	try {
		const res = await fetch(SUGGEST_URL, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(payload)
		});

		if (!res.ok) {
			console.error('[Phase72] suggest-fix HTTP', res.status);
			return;
		}

		const data = await res.json();

		console.log('\n───────── Phase72 Suggest-Fix ─────────');
		if (data.plan) console.log(data.plan);
		if (Array.isArray(data.suggestions) && data.suggestions.length) {
			console.log('\nSuggestions:');
			for (const s of data.suggestions) console.log(' •', s);
		}
		if (Array.isArray(data.related_routes) && data.related_routes.length) {
			console.log('\nRelated routes:', data.related_routes.join(', '));
		}
		console.log('────────────────────────────────────────\n');
	} catch (err) {
		console.error('[Phase72] suggest-fix error:', err.message);
	}
}

function parseErrorBlock(lines) {
	const text = lines.join('\n');

	// Only care about meaningful dev/HMR errors
	if (
		!text.includes('Cannot import') &&
		!text.includes('✘') &&
		!text.toLowerCase().includes('error')
	) {
		return null;
	}

	// Try to grab file:line:col
	const locMatch =
		text.match(
			/(?:at |in )?(?<file>[^:(\s]+\.svelte):(?<line>\d+):(?<col>\d+)/
		) ||
		text.match(/(?<file>src[^\s:]+):(?<line>\d+):(?<col>\d+)/);

	const file_path = locMatch?.groups?.file ?? 'unknown';
	const line = Number(locMatch?.groups?.line ?? 1);
	const col = Number(locMatch?.groups?.col ?? 1);

	// Message: take the "Cannot import…" line if present, else the first line
	const msgLine =
		lines.find((l) => l.includes('Cannot import')) ??
		lines.find((l) => l.includes('ERROR')) ??
		lines[0];

	let code = 'VITE_ERROR';

	if (msgLine?.includes('Cannot import') && msgLine?.includes('$lib/server')) {
		code = 'VITE_SERVER_IMPORT_IN_CLIENT';
	}

	const route = file_path === 'unknown' ? '/' : guessRoute(file_path);

	return {
		route,
		file_path,
		line,
		col,
		code,
		severity: 'error',
		message: msgLine?.trim() ?? 'Unknown dev error'
	};
}

// --- spawn dev:quic and watch stderr --------------------------------

const dev = spawn('npm', ['run', 'dev:quic'], {
	shell: true,
	env: process.env,
	stdio: ['inherit', 'pipe', 'pipe'] // we want both stdout & stderr
});

console.log('[Phase72] Watching dev:quic output…');

const rlErr = readline.createInterface({ input: dev.stderr });
const rlOut = readline.createInterface({ input: dev.stdout });

let buffer = [];

function flushBuffer() {
	if (!buffer.length) return;
	const parsed = parseErrorBlock(buffer);
	buffer = [];
	if (!parsed) return;
	void sendToBrain(parsed);
}

for (const rl of [rlErr, rlOut]) {
	rl.on('line', (line) => {
		// Always show original dev output
		console.log(line);

		// collect potential error blocks
		if (!line.trim()) {
			flushBuffer();
		} else {
			buffer.push(line);
		}
	});
}

dev.on('exit', (code) => {
	flushBuffer();
	console.log('[Phase72] dev:quic exited with code', code);
	process.exit(code ?? 0);
});
