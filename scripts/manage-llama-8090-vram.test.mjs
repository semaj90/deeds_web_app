import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import http from 'node:http';
import test from 'node:test';

const SCRIPT = 'scripts/manage-llama-8090-vram.ps1';

test('live :8090 status reports valid /slots, llama processIdentity, and idle state', () => {
	const out = execFileSync(
		'powershell',
		['-NoProfile', '-File', SCRIPT, '-Action', 'status'],
		{ encoding: 'utf8' },
	);
	const parsed = JSON.parse(out);
	assert.equal(parsed.schema, 'atlas.llama-8090-vram-status.v1');
	assert.equal(parsed.port, 8090);
	assert.equal(parsed.processIdentity.isLlamaServer, true);
	assert.equal(parsed.slots.reachable, true);
	assert.equal(parsed.slots.valid, true);
	assert.equal(typeof parsed.slots.busy, 'number');
	assert.equal(parsed.releaseCapability.supported, false);
	assert.equal(parsed.releaseCapability.blocker, 'INFERENCE_DRAIN_AND_GRACEFUL_SHUTDOWN_NOT_IMPLEMENTED');
});

test('release remains fail-closed until drain and shutdown are implemented', () => {
	const manager = readFileSync(SCRIPT, 'utf8');
	const guards = readFileSync('scripts/lib/llama-8090-vram-guards.ps1', 'utf8');
	assert.match(manager, /InferenceDrainGateVerified\s+\$false/);
	assert.match(guards, /REFUSED_INFERENCE_DRAIN_GATE_UNAVAILABLE/);
	assert.doesNotMatch(manager, /Stop-Process\s+-Id\s+\$listenPid/);
});

test('release refuses non-llama process identity on ephemeral port (fail-closed)', async () => {
	const srv = http.createServer((_req, res) => {
		res.writeHead(200, { 'content-type': 'application/json' });
		res.end(JSON.stringify([{ id: 0, is_processing: false }]));
	});
	await new Promise((resolve) => srv.listen(0, '127.0.0.1', resolve));
	const addr = srv.address();
	const port = typeof addr === 'object' && addr ? addr.port : 0;

	try {
		assert.throws(
			() =>
				execFileSync(
					'powershell',
					['-NoProfile', '-File', SCRIPT, '-Action', 'release', '-Port', String(port), '-DryRun'],
					{ encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
				),
			(err) => {
				const msg = `${err?.stderr ?? ''}${err?.message ?? ''}`;
				return msg.includes('REFUSED_PROCESS_IDENTITY_MISMATCH');
			},
		);
	} finally {
		await new Promise((resolve) => srv.close(resolve));
	}
});
