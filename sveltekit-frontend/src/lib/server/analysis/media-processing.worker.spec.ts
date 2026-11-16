// @vitest-environment node
// Live check of the ASR worker wiring: calls the real transcribeAudio against the
// persistent worker on ASR_WORKER_URL (default 127.0.0.1:8093). Skipped unless the
// worker is reachable so CI without the worker stays green.
import { describe, it, expect, beforeAll } from 'vitest';

const WORKER = process.env.ASR_WORKER_URL?.trim() || 'http://127.0.0.1:8093';
const SAMPLE = 'C:\\Users\\james\\Music\\Rick and Morty - You Were A Scary Fucking Kid (uncensored).mp3';

let workerUp = false;
beforeAll(async () => {
	try {
		const r = await fetch(`${WORKER}/health`, { signal: AbortSignal.timeout(3000) });
		workerUp = r.ok;
	} catch {
		workerUp = false;
	}
});

describe('transcribeAudio via ASR worker', () => {
	it('returns timestamped chunks from the worker', async () => {
		if (!workerUp) return; // worker not running: nothing to prove here
		const { transcribeAudio } = await import('./media-processing.js');
		const result = await transcribeAudio(SAMPLE, 'worker-spec');
		expect(result.language).toBe('en');
		expect(result.chunks.length).toBeGreaterThan(0);
		expect(result.chunks[0].end).toBeGreaterThan(result.chunks[0].start);
		expect(result.text.length).toBeGreaterThan(0);
	}, 120_000);

	it('rejects a path outside the worker allowlist without falling back', async () => {
		if (!workerUp) return;
		const { transcribeAudio } = await import('./media-processing.js');
		await expect(transcribeAudio('C:\\Windows\\win.ini', 'worker-spec')).rejects.toThrow(
			/TRANSCRIPTION_REJECTED/
		);
	}, 60_000);
});
