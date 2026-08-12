#!/usr/bin/env node
/**
 * OpenCode ACP -> bash worker.
 *
 * Split of responsibility (per parent-atlas-workstation-todo.md ACP wiring):
 *   OpenCode agent   -> decides WHAT to run, emits a typed request
 *   ACP tool handler -> hands the request off (this script is what it calls)
 *   bash (WSL2)      -> actually executes the repo command
 *   this script      -> returns a structured receipt, never raw stdout soup
 *
 * conda/miniforge is environment setup, not task ownership: the RAPIDS env is
 * only activated when the request says it needs GPU libs (cugraph/cudf/cuvs),
 * activated once per bash -lc invocation — never re-activated mid-command.
 *
 * Usage: echo '<request-json>' | node opencode-bash-worker.mjs
 *   or:  node opencode-bash-worker.mjs '<request-json>'
 *
 * Request shape:
 *   {
 *     "task_id": "louvain-resolution-classify",
 *     "command": "npm run atlas:louvain:resolution:report",
 *     "cwd": "C:\\Users\\james\\Videos\\deeds-web-app",
 *     "env": { "ENGRAM_ONLY": "true" },
 *     "useRapidsEnv": false
 *   }
 *
 * Receipt shape (stdout, single JSON line):
 *   { taskId, status: 'SUCCEEDED' | 'FAILED', exitCode, stdout, stderr, durationMs }
 */

import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

function toWslPath(windowsPath) {
	const absolute = resolve(windowsPath).replace(/\\/g, '/');
	const match = /^([A-Za-z]):\/(.*)$/.exec(absolute);
	if (!match) throw new Error(`Cannot convert to WSL path: ${windowsPath}`);
	return `/mnt/${match[1].toLowerCase()}/${match[2]}`;
}

async function readStdin() {
	if (process.stdin.isTTY) return '';
	const chunks = [];
	for await (const chunk of process.stdin) chunks.push(chunk);
	return Buffer.concat(chunks).toString('utf8').trim();
}

function buildBashCommand(request) {
	const wslCwd = request.cwd ? toWslPath(request.cwd) : null;
	const parts = [];
	if (request.useRapidsEnv) {
		// Activated once, inside this single bash -lc invocation — not a
		// persistent shell state change. See ~/miniforge3/etc/profile.d/conda.sh.
		parts.push('source ~/miniforge3/etc/profile.d/conda.sh && conda activate atlas-rapids-cu13');
	}
	if (wslCwd) parts.push(`cd ${wslCwd}`);
	parts.push(request.command);
	return parts.join(' && ');
}

async function main() {
	const argRequest = process.argv[2];
	const raw = argRequest ?? (await readStdin());
	if (!raw) {
		console.error(JSON.stringify({ status: 'FAILED', error: 'No request provided (arg or stdin)' }));
		process.exitCode = 2;
		return;
	}

	let request;
	try {
		request = JSON.parse(raw);
	} catch (err) {
		console.error(JSON.stringify({ status: 'FAILED', error: `Invalid JSON request: ${err instanceof Error ? err.message : String(err)}` }));
		process.exitCode = 2;
		return;
	}

	if (!request.task_id || !request.command) {
		console.error(JSON.stringify({ status: 'FAILED', error: 'request.task_id and request.command are required' }));
		process.exitCode = 2;
		return;
	}

	const bashCommand = buildBashCommand(request);
	const t0 = Date.now();

	try {
		const stdout = execFileSync('wsl.exe', ['-d', 'Ubuntu', '--', 'bash', '-lc', bashCommand], {
			encoding: 'utf8',
			stdio: ['ignore', 'pipe', 'pipe'],
			maxBuffer: 64 * 1024 * 1024,
			env: { ...process.env, ...(request.env ?? {}) }
		});
		console.log(JSON.stringify({
			taskId: request.task_id,
			status: 'SUCCEEDED',
			exitCode: 0,
			stdout,
			stderr: '',
			durationMs: Date.now() - t0
		}));
	} catch (err) {
		const execErr = err;
		console.log(JSON.stringify({
			taskId: request.task_id,
			status: 'FAILED',
			exitCode: typeof execErr?.status === 'number' ? execErr.status : 1,
			stdout: execErr?.stdout?.toString?.('utf8') ?? '',
			stderr: execErr?.stderr?.toString?.('utf8') ?? (execErr instanceof Error ? execErr.message : String(execErr)),
			durationMs: Date.now() - t0
		}));
		process.exitCode = 1;
	}
}

main();
