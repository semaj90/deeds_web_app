#!/usr/bin/env node
/**
 * Whisper CUDA vs CPU Benchmark — RTX 3060 Ti
 *
 * Measures transcription latency across:
 *   - whisper.cpp CLI with --device cuda  (GPU)
 *   - whisper.cpp CLI with --device cpu   (CPU)
 *   - whisper-server.exe HTTP API         (persistent GPU)
 *
 * Generates a synthetic WAV test file (configurable duration).
 * Calls the /api/whisper/transcribe endpoint with forced device override,
 * OR shells out to whisper.cpp directly for CLI comparison.
 *
 * Usage:
 *   node scripts/benchmark-whisper-cuda.mjs                   # 5s test audio
 *   node scripts/benchmark-whisper-cuda.mjs --duration 10     # 10s test audio
 *   node scripts/benchmark-whisper-cuda.mjs --file ./sample.wav  # real audio
 *   node scripts/benchmark-whisper-cuda.mjs --rounds 5        # 5 rounds each
 *
 * Requires: whisper.cpp (whisper-cli or main) in PATH or WHISPER_PATH env
 */

import { execSync, execFileSync } from 'child_process';
import { writeFileSync, readFileSync, existsSync, unlinkSync, mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

// ── CLI args ─────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
function getArg(name) {
	const idx = args.indexOf(`--${name}`);
	return idx >= 0 && idx + 1 < args.length ? args[idx + 1] : null;
}

const DURATION_SEC = parseInt(getArg('duration') ?? '5', 10);
const ROUNDS = parseInt(getArg('rounds') ?? '3', 10);
const CUSTOM_FILE = getArg('file');
const MODEL = getArg('model') ?? process.env.WHISPER_MODEL ?? 'base';
const WHISPER_BIN = process.env.WHISPER_PATH ?? 'whisper-cli';
const WHISPER_SERVER = process.env.WHISPER_SERVER_URL ?? 'http://127.0.0.1:8178';
const API_URL = process.env.API_URL ?? 'http://localhost:5173';

// ── WAV generator ────────────────────────────────────────────────────────

function generateTestWav(durationSec) {
	const sampleRate = 16000;
	const numChannels = 1;
	const bitsPerSample = 16;
	const numSamples = sampleRate * durationSec;
	const dataSize = numSamples * numChannels * (bitsPerSample / 8);

	const header = Buffer.alloc(44);
	header.write('RIFF', 0);
	header.writeUInt32LE(36 + dataSize, 4);
	header.write('WAVE', 8);
	header.write('fmt ', 12);
	header.writeUInt32LE(16, 16);
	header.writeUInt16LE(1, 20);
	header.writeUInt16LE(numChannels, 22);
	header.writeUInt32LE(sampleRate, 24);
	header.writeUInt32LE(sampleRate * numChannels * (bitsPerSample / 8), 28);
	header.writeUInt16LE(numChannels * (bitsPerSample / 8), 32);
	header.writeUInt16LE(bitsPerSample, 34);
	header.write('data', 36);
	header.writeUInt32LE(dataSize, 40);

	// Generate simple sine wave (440Hz A4) instead of silence for realistic workload
	const audioData = Buffer.alloc(dataSize);
	for (let i = 0; i < numSamples; i++) {
		const t = i / sampleRate;
		const sample = Math.sin(2 * Math.PI * 440 * t) * 16000;
		audioData.writeInt16LE(Math.round(sample), i * 2);
	}

	return Buffer.concat([header, audioData]);
}

// ── Benchmark helpers ────────────────────────────────────────────────────

function findWhisperBin() {
	// Try common names
	for (const name of [WHISPER_BIN, 'whisper-cli', 'main', 'whisper']) {
		try {
			execSync(`${name} --help`, { stdio: 'pipe', timeout: 5000 });
			return name;
		} catch { /* try next */ }
	}
	return null;
}

function benchmarkCLI(wavPath, device, whisperBin, model, rounds) {
	const results = [];
	for (let i = 0; i < rounds; i++) {
		const start = performance.now();
		try {
			execFileSync(whisperBin, [
				'-m', `models/ggml-${model}.bin`,
				'-f', wavPath,
				'--no-prints',
				...(device === 'cuda' ? ['--gpu-layers', '99'] : []),
			], {
				stdio: 'pipe',
				timeout: 120_000,
				cwd: process.cwd(),
			});
			results.push(performance.now() - start);
		} catch (err) {
			results.push(-1);
			console.error(`  Round ${i + 1} failed: ${err.message?.slice(0, 80)}`);
		}
	}
	return results;
}

async function benchmarkServer(wavPath, rounds) {
	const audioBytes = readFileSync(wavPath);
	const results = [];
	for (let i = 0; i < rounds; i++) {
		const boundary = '----Bench' + Math.random().toString(36).slice(2);
		const body = Buffer.concat([
			Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="bench.wav"\r\nContent-Type: audio/wav\r\n\r\n`),
			audioBytes,
			Buffer.from(`\r\n--${boundary}\r\nContent-Disposition: form-data; name="response_format"\r\n\r\nverbose_json\r\n--${boundary}--\r\n`),
		]);
		const start = performance.now();
		try {
			const res = await fetch(`${WHISPER_SERVER}/inference`, {
				method: 'POST',
				headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
				body,
				signal: AbortSignal.timeout(120_000),
			});
			if (res.ok) {
				await res.json(); // consume
				results.push(performance.now() - start);
			} else {
				results.push(-1);
				console.error(`  Round ${i + 1} server error: ${res.status}`);
			}
		} catch (err) {
			results.push(-1);
			console.error(`  Round ${i + 1} failed: ${err.message?.slice(0, 80)}`);
		}
	}
	return results;
}

async function benchmarkAPI(wavPath, rounds) {
	const audioBytes = readFileSync(wavPath);
	const results = [];
	for (let i = 0; i < rounds; i++) {
		const boundary = '----Bench' + Math.random().toString(36).slice(2);
		const body = Buffer.concat([
			Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="bench.wav"\r\nContent-Type: audio/wav\r\n\r\n`),
			audioBytes,
			Buffer.from(`\r\n--${boundary}--\r\n`),
		]);
		const start = performance.now();
		try {
			const res = await fetch(`${API_URL}/api/whisper/transcribe`, {
				method: 'POST',
				headers: { 'Content-Type': `multipart/form-data; boundary=${boundary}` },
				body,
				signal: AbortSignal.timeout(120_000),
			});
			if (res.ok) {
				await res.json();
				results.push(performance.now() - start);
			} else {
				results.push(-1);
				console.error(`  Round ${i + 1} API error: ${res.status}`);
			}
		} catch (err) {
			results.push(-1);
			console.error(`  Round ${i + 1} failed: ${err.message?.slice(0, 80)}`);
		}
	}
	return results;
}

// ── Stats ────────────────────────────────────────────────────────────────

function stats(times) {
	const valid = times.filter(t => t >= 0);
	if (valid.length === 0) return { min: -1, max: -1, avg: -1, median: -1, count: 0 };
	valid.sort((a, b) => a - b);
	const sum = valid.reduce((a, b) => a + b, 0);
	return {
		min: valid[0],
		max: valid[valid.length - 1],
		avg: sum / valid.length,
		median: valid[Math.floor(valid.length / 2)],
		count: valid.length,
	};
}

function fmtMs(ms) {
	return ms < 0 ? 'FAIL' : `${ms.toFixed(0)}ms`;
}

// ── Main ─────────────────────────────────────────────────────────────────

async function main() {
	console.log('╔══════════════════════════════════════════════════════════╗');
	console.log('║  Whisper CUDA vs CPU Benchmark — RTX 3060 Ti (8GB)     ║');
	console.log('╚══════════════════════════════════════════════════════════╝');
	console.log();
	console.log(`  Model:    ${MODEL}`);
	console.log(`  Rounds:   ${ROUNDS}`);
	console.log(`  Duration: ${DURATION_SEC}s test audio`);

	// Prepare test file
	let wavPath;
	const tmpDir = mkdtempSync(join(tmpdir(), 'whisper-bench-'));

	if (CUSTOM_FILE && existsSync(CUSTOM_FILE)) {
		wavPath = CUSTOM_FILE;
		console.log(`  File:     ${CUSTOM_FILE}`);
	} else {
		wavPath = join(tmpDir, 'test-tone.wav');
		const wav = generateTestWav(DURATION_SEC);
		writeFileSync(wavPath, wav);
		console.log(`  File:     ${wavPath} (${(wav.length / 1024).toFixed(1)} KB)`);
	}
	console.log();

	const benchmarks = {};

	// 1. CLI CPU
	const whisperBin = findWhisperBin();
	if (whisperBin) {
		console.log(`▸ CLI CPU (${whisperBin} --device cpu)...`);
		benchmarks['CLI CPU'] = benchmarkCLI(wavPath, 'cpu', whisperBin, MODEL, ROUNDS);

		// 2. CLI CUDA
		console.log(`▸ CLI CUDA (${whisperBin} --gpu-layers 99)...`);
		benchmarks['CLI CUDA'] = benchmarkCLI(wavPath, 'cuda', whisperBin, MODEL, ROUNDS);
	} else {
		console.log('⚠  whisper-cli not found in PATH — skipping CLI benchmarks');
		console.log(`   Set WHISPER_PATH env var or install whisper.cpp`);
	}

	// 3. Whisper HTTP server
	try {
		const healthRes = await fetch(`${WHISPER_SERVER}/health`, { signal: AbortSignal.timeout(3000) });
		if (healthRes.ok) {
			console.log(`▸ Server (${WHISPER_SERVER})...`);
			benchmarks['Server (persistent GPU)'] = await benchmarkServer(wavPath, ROUNDS);
		} else {
			console.log(`⚠  Whisper server not healthy at ${WHISPER_SERVER} — skipping`);
		}
	} catch {
		console.log(`⚠  Whisper server unavailable at ${WHISPER_SERVER} — skipping`);
	}

	// 4. SvelteKit API route (end-to-end)
	try {
		const pingRes = await fetch(`${API_URL}/api/health/ping`, { signal: AbortSignal.timeout(3000) });
		if (pingRes.ok) {
			console.log(`▸ API Route (${API_URL}/api/whisper/transcribe)...`);
			benchmarks['API Route (e2e)'] = await benchmarkAPI(wavPath, ROUNDS);
		} else {
			console.log(`⚠  SvelteKit dev server not running at ${API_URL} — skipping`);
		}
	} catch {
		console.log(`⚠  SvelteKit dev server unavailable at ${API_URL} — skipping`);
	}

	// Cleanup temp file
	if (!CUSTOM_FILE) {
		try { unlinkSync(wavPath); } catch { /* ignore */ }
	}

	// Results table
	console.log();
	console.log('┌──────────────────────────┬──────────┬──────────┬──────────┬──────────┬───────┐');
	console.log('│ Method                   │   Min    │   Avg    │  Median  │   Max    │ Runs  │');
	console.log('├──────────────────────────┼──────────┼──────────┼──────────┼──────────┼───────┤');

	const rows = [];
	for (const [label, times] of Object.entries(benchmarks)) {
		const s = stats(times);
		rows.push({ label, ...s });
		const pad = (str, len) => str.padEnd(len);
		console.log(
			`│ ${pad(label, 24)} │ ${fmtMs(s.min).padStart(8)} │ ${fmtMs(s.avg).padStart(8)} │ ${fmtMs(s.median).padStart(8)} │ ${fmtMs(s.max).padStart(8)} │ ${String(s.count).padStart(5)} │`
		);
	}

	console.log('└──────────────────────────┴──────────┴──────────┴──────────┴──────────┴───────┘');

	// Speedup comparison
	if (rows.length >= 2) {
		console.log();
		const cpuRow = rows.find(r => r.label.includes('CPU'));
		const cudaRow = rows.find(r => r.label.includes('CUDA') || r.label.includes('GPU') || r.label.includes('Server'));
		if (cpuRow && cudaRow && cpuRow.avg > 0 && cudaRow.avg > 0) {
			const speedup = cpuRow.avg / cudaRow.avg;
			console.log(`  GPU speedup: ${speedup.toFixed(1)}x faster than CPU (${fmtMs(cudaRow.avg)} vs ${fmtMs(cpuRow.avg)})`);
		}
	}

	// JSON output
	const outPath = join(tmpDir, 'whisper-benchmark-results.json');
	writeFileSync(outPath, JSON.stringify({
		timestamp: new Date().toISOString(),
		model: MODEL,
		durationSec: DURATION_SEC,
		rounds: ROUNDS,
		customFile: CUSTOM_FILE ?? null,
		results: Object.fromEntries(
			Object.entries(benchmarks).map(([label, times]) => [label, { times, ...stats(times) }])
		),
	}, null, 2));
	console.log();
	console.log(`  Results saved to: ${outPath}`);
}

main().catch(err => {
	console.error('Benchmark failed:', err.message);
	process.exit(1);
});
