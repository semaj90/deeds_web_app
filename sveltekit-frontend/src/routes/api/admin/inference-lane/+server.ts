import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { ENV } from '$lib/server/env.server.js';

export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user && !ENV.DEV_BYPASS_AUTH) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	try {
		// 1. Fetch slots from llama-server
		const res = await fetch(`${ENV.TURBOQUANT_URL}/slots`).catch(() => null);
		const slots = res ? await res.json() : [];
		
		// 2. Fetch props/config
		const propsRes = await fetch(`${ENV.TURBOQUANT_URL}/props`).catch(() => null);
		const props = propsRes ? await propsRes.json() : {};

		const mainSlot = Array.isArray(slots) ? slots[0] : (slots.slots ? slots.slots[0] : null);

		return json({
			vramUsed: 5.8, // Static for now, or fetch via nvidia-smi if local script available
			ctxUsed: mainSlot?.n_past ?? 0,
			ctxMax: mainSlot?.n_ctx ?? 4096,
			strategy: 'RotorQuant Q8_0',
			flashAttn: true,
			model: props.default_generation_settings?.model || 'gemma4-rotorquant:latest'
		});
	} catch (err) {
		console.error('[Inference Lane API] Error:', err);
		return json({
			vramUsed: 0,
			ctxUsed: 0,
			ctxMax: 4096,
			status: 'offline'
		});
	}
};
