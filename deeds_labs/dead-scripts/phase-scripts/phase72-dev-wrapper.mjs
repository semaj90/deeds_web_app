#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';

// endpoints
const DEV_BASE = process.env.DEV_BASE ?? 'http://127.0.0.1:5173';
const CAPTURE_URL =
	process.env.PHASE72_CAPTURE_URL ?? `${DEV_BASE}/api/phase72/capture-error`;
const SUGGEST_URL =
	process.env.PHASE72_SUGGEST_URL ?? `${DEV_BASE}/api/phase72/suggest-fix`;

// -------- helpers --------------------------------------------------

function guessRoute(filePath) {
	if (!filePath) return '/';
	const norm = filePath.replace(/\\/g, '/');
	const idx = norm.indexOf('src/routes');
	if (idx === -1) return '/';
	let seg = norm.slice(idx + 'src/routes'.length);
	seg = seg.replace(/\+page(\.server)?\.(svelte|ts|js)$/, '');
	seg = seg.replace(/\+layout(\.server)?\.(svelte|ts|js)$/, '');
	if (!seg.startsWith('/')) seg = '/' + seg;
	return seg || '/';
}

function hashError(e) {
	const h = createHash('sha256');
	h.update([e.file_path, e.line, e.col, e.code, e.message].join('|'));
	return h.digest('hex');
}

// e.g. "src/routes/foo/+page.svelte:12:3 - error TS2304: Cannot find name 'X'."
function parseTsLike(line) {
	const m = line.match(/^(.+?):(\d+):(\d+)\s+-\s+(error|warning)\s+(\w+\d+):\s+(.+)$/);
	if (!m) return null;
	const [, file_path, lineStr, colStr, severity, code, message] = m;
	return {
		file_path,
		line: Number(lineStr),
		col: Number(colStr),
		code,
		severity,
		message
	};
}

// specific "cannot import server module" pattern
function parseServerImport(line) {
	if (!line.includes('Cannot import')) return null;
	if (!line.includes('$lib/server')) return null;
	return {
		file_path: 'unknown',
		line: 0,
		col: 0,
		code: 'SVELTE_SERVER_IMPORT_IN_CLIENT',
		severity: 'error',
		message: line.trim()
	};
}

const seen = new Set();

async function sendToBrain(error) {
	const key = hashError(error);
	if (seen.has(key)) return;
	seen.add(key);

	const route = guessRoute(error.file_path);

	const payload = {
		route,
		file_path: error.file_path,
		line: error.line,
		col: error.col,
		code: error.code,
		severity: error.severity ?? 'error',
		message: error.message
	};

	// 1) store in DB
	try {
		await fetch(CAPTURE_URL, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(payload)
		});
	} catch (err) {
		console.error('[Phase72] capture-error failed:', err.message);
	}

	// 2) ask for suggestions
	try {
		const res = await fetch(SUGGEST_URL, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(payload)
		});
		if (!res.ok) {
			const text = await res.text();
			console.error('\n[Phase72] suggest-fix failed:', res.status, text, '\n');
			return;
		}
		const data = await res.json();

		console.log('\n🧠 Phase 72 Error Brain ───────────────────────────\n');
		if (data.plan) {
			console.log(data.plan);
		} else {
			console.log(JSON.stringify(data, null, 2));
		}
		console.log('\n────────────────────────────────────────────────────\n');
	} catch (err) {
		console.error('[Phase72] suggest-fix error:', err.message);
	}
}

function handleLine(line) {
	// always mirror dev output
	process.stdout.write(line + '\n');

	const ts = parseTsLike(line);
	if (ts) return void sendToBrain(ts);

	const imp = parseServerImport(line);
	if (imp) return void sendToBrain(imp);
}

// -------- main -----------------------------------------------------

const child = spawn('npm', ['run', 'dev:quic:raw'], {
	shell: process.platform === 'win32',
	env: process.env
});

let bufOut = '';
let bufErr = '';

for (const [stream, buffer] of [
	[child.stdout, 'out'],
	[child.stderr, 'err']
]) {
	stream.on('data', (chunk) => {
		if (buffer === 'out') bufOut += chunk.toString('utf8');
		else bufErr += chunk.toString('utf8');

		let buf = buffer === 'out' ? bufOut : bufErr;

		let idx;
		while ((idx = buf.indexOf('\n')) !== -1) {
			const line = buf.slice(0, idx).replace(/\r$/, '');
			buf = buf.slice(idx + 1);
			handleLine(line);
		}

		if (buffer === 'out') bufOut = buf;
		else bufErr = buf;
	});
}

child.on('exit', (code) => {
	console.log(`\n[Phase72] dev:quic:raw exited with code ${code}\n`);
	process.exit(code ?? 0);
});
