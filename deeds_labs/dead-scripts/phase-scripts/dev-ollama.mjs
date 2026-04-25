#!/usr/bin/env node

/**
 * dev-ollama.mjs
 * Ollama service starter for dev:quic mode
 */

import { spawn } from 'child_process';
import { setTimeout } from 'timers/promises';

const args = process.argv.slice(2);
const isQuicMode = args.includes('--quic');

console.log(`[Ollama] Starting Ollama service${isQuicMode ? ' (QUIC mode)' : ''}...`);

// Check if Ollama is already running
async function checkOllama() {
	try {
		const response = await fetch('http://localhost:11434/api/tags');
		if (response.ok) {
			console.log('[Ollama] ✅ Ollama already running');
			return true;
		}
	} catch {
		return false;
	}
	return false;
}

async function main() {
	const isRunning = await checkOllama();

	if (!isRunning) {
		console.log('[Ollama] Starting Ollama server...');

		// Start Ollama serve in background
		const ollamaProcess = spawn('ollama', ['serve'], {
			detached: true,
			stdio: 'ignore'
		});

		ollamaProcess.unref();

		// Wait for Ollama to be ready
		console.log('[Ollama] Waiting for Ollama to be ready...');
		let retries = 30;
		while (retries > 0) {
			await setTimeout(1000);
			if (await checkOllama()) {
				console.log('[Ollama] ✅ Ollama is ready');
				break;
			}
			retries--;
		}

		if (retries === 0) {
			console.error('[Ollama] ❌ Failed to start Ollama');
			process.exit(1);
		}
	}

	console.log('[Ollama] Service ready for connections');
}

main().catch(err => {
	console.error('[Ollama] Error:', err);
	process.exit(1);
});
