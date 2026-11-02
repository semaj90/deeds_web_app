import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { ENV } from '$lib/server/env.server.js';
import { LLM_MODEL_ID } from '$lib/server/llm/runtime-contract.js';

export const GET: RequestHandler = async ({ locals }) => {
	if (locals.user?.role !== 'admin' && !ENV.DEV_BYPASS_AUTH) {
		return json({
			status: 'unauthorized', vramUsed: null, ctxUsed: 0, ctxMax: 0, strategy: null,
			flashAttn: null, model: null, slotsIdle: null, slotCount: 0, activeSlots: 0,
		}, { status: locals.user ? 403 : 401, headers: { 'Cache-Control': 'no-store' } });
	}

	try {
		const [slotsResponse, propsResponse] = await Promise.all([
			fetch(`${ENV.TURBOQUANT_URL}/slots`, { signal: AbortSignal.timeout(2500) }),
			fetch(`${ENV.TURBOQUANT_URL}/props`, { signal: AbortSignal.timeout(2500) }),
		]);
		if (!slotsResponse.ok || !propsResponse.ok) throw new Error('Inference status endpoint unavailable');

		const [slotPayload, props] = await Promise.all([slotsResponse.json(), propsResponse.json()]);
		const slots = Array.isArray(slotPayload) ? slotPayload : Array.isArray(slotPayload?.slots) ? slotPayload.slots : [];
		const knownSlotStates = slots.filter((slot: { is_processing?: unknown }) => typeof slot.is_processing === 'boolean');
		const activeSlots = knownSlotStates.filter((slot: { is_processing: boolean }) => slot.is_processing).length;
		const slotsIdle = slots.length > 0 && knownSlotStates.length === slots.length && activeSlots === 0;
		const mainSlot = slots[0];

		return json({
			status: 'online',
			vramUsed: null,
			ctxUsed: mainSlot?.n_past ?? 0,
			ctxMax: mainSlot?.n_ctx ?? 0,
			strategy: null,
			flashAttn: null,
			model: props.default_generation_settings?.model || LLM_MODEL_ID,
			slotsIdle,
			slotCount: slots.length,
			activeSlots,
		}, { headers: { 'Cache-Control': 'no-store' } });
	} catch (err) {
		console.error('[Inference Lane API] Error:', err);
		return json({
			status: 'offline',
			vramUsed: null,
			ctxUsed: 0,
			ctxMax: 0,
			strategy: null,
			flashAttn: null,
			model: null,
			slotsIdle: null,
			slotCount: 0,
			activeSlots: 0,
		}, { headers: { 'Cache-Control': 'no-store' } });
	}
};
