import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import type { RequestHandler } from './$types';
import { ENV } from '$lib/server/env.server.js';

const isLoopback = (host: string) => ['localhost', '127.0.0.1', '::1'].includes(host.replace(/^\[|\]$/g, '').toLowerCase());

export const GET: RequestHandler = async ({ locals, url }) => {
	const localDevBypass = process.env.NODE_ENV === 'development' && ENV.DEV_BYPASS_AUTH && isLoopback(url.hostname);
	if (locals.user?.role !== 'admin' || (locals.session?.id === 'dev-bypass-session' && !localDevBypass)) {
		return new Response('Admin authentication required', { status: 403, headers: { 'cache-control': 'no-store' } });
	}
	const cwd = process.cwd();
	const candidates = [
		'docs/reports/domain-calibration-gold-v2-review-sheet-v2.html',
		'docs/reports/domain-calibration-gold-v2-review-sheet-v1.html',
	];
	let targetPath: string | null = null;
	for (const rel of candidates) {
		const root = [cwd, path.resolve(cwd, '..'), path.resolve(cwd, '../..')]
			.find((candidate) => existsSync(path.join(candidate, rel)));
		if (root) {
			targetPath = path.join(root, rel);
			break;
		}
	}
	if (!targetPath) return new Response('Review sheet is not built on this server', { status: 503, headers: { 'cache-control': 'no-store' } });
	try {
		const html = await readFile(targetPath);
		return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' } });
	} catch {
		return new Response('Review sheet is not built on this server', { status: 503, headers: { 'cache-control': 'no-store' } });
	}
};
