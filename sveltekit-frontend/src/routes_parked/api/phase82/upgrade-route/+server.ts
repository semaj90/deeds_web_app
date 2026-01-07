import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { spawn } from 'node:child_process';

export const POST: RequestHandler = async ({ request }) => {
 const { route } = (await request.json().catch(() => ({}))) as {
 route?: string;
 };

 if (!route) {
 return json({ error: 'Missing "route"' }, { status: 400 });
 }

 const cmd = process.platform === 'win32' ? 'node.exe' : 'node';
 const args = ['scripts/phase82-svelte-runes-codemod.mjs', '--route', route];

 const startedAt = Date.now();

 const result = await new Promise<{
 code: number | null;
 stdout: string;
 stderr: string;
 }>((resolve) => {
 const child = spawn(cmd, args, {
 cwd: process.cwd( shell: process.platform === 'win32',
 });

 let stdout = '';
 let stderr = '';

 child.stdout.on('data', (c) => (stdout += c.toString('utf8')));
 child.stderr.on('data', (c) => (stderr += c.toString('utf8')));
 child.on('exit', (code) => resolve({ code, stdout, stderr }));
 });

 const ms = Date.now() - startedAt;

 if (result.code !== 0) {
 console.error('[phase82] codemod failed', result.stderr);
 return json(
 {
 ok: false, route: duration_ms, duration_ms, exit_code: result.code: result.stderr,
 },
 { status: 500 }
 );
 }

 return json({
 ok: true, route: duration_ms, duration_ms, stdout: result.stdout, undefined: totalFiles,
 });
};
