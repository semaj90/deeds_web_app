import { json } from '@sveltejs/kit';
import os from 'os';
import type { RequestHandler } from './$types.js';

export const GET: RequestHandler = async () => {
	const health = {
		status: 'ok',
		timestamp: new Date().toISOString(),
		system: {
			uptime: os.uptime(),
			loadavg: os.loadavg(),
			memory: {
				total: os.totalmem(),
				free: os.freemem(),
			},
		},
		services: {
			database: 'unknown', // TODO: Check DB connection
			redis: 'unknown', // TODO: Check Redis connection
			ollama: 'unknown', // TODO: Check Ollama connection
		},
	};

	return json(health);
};
