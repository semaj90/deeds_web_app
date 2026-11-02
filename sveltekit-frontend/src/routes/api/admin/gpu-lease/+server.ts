import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
  GpuLeaseTargetSchemaV1,
  getGpuArbiterState,
  getInferenceSlotStatusV1,
  switchGpuLeaseTarget
} from '$lib/server/inference/gpu-arbiter-v1.js';
import { z } from 'zod';

const SwitchLeaseRequestSchema = z.object({
  target: GpuLeaseTargetSchemaV1
});

export const GET: RequestHandler = async ({ locals }) => {
  if (locals.user?.role !== 'admin') {
    return json({
      success: false,
      state: null,
      slots: { idle: false, slotCount: 0, activeSlots: 0, reason: 'service_unavailable' },
      error: 'Admin access required',
    }, { status: locals.user ? 403 : 401, headers: { 'Cache-Control': 'no-store' } });
  }
  try {
    const [state, slots] = await Promise.all([getGpuArbiterState(), getInferenceSlotStatusV1()]);
    return json({
      success: true,
      state,
      slots,
      error: null
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('Failed to get GPU arbiter state:', error);
    return json(
      {
        success: false,
        state: null,
        slots: { idle: false, slotCount: 0, activeSlots: 0, reason: 'service_unavailable' },
        error: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500, headers: { 'Cache-Control': 'no-store' } }
    );
  }
};

export const POST: RequestHandler = async ({ request, locals }) => {
  if (locals.user?.role !== 'admin') {
    return json({ success: false, error: 'Admin access required' }, { status: locals.user ? 403 : 401 });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ success: false, error: 'Malformed JSON payload' }, { status: 400 });
  }

  const parsed = SwitchLeaseRequestSchema.safeParse(body);
  if (!parsed.success) {
    return json(
      {
        success: false,
        error: parsed.error.issues[0]?.message ?? 'Invalid request payload'
      },
      { status: 400 }
    );
  }

  try {
    const slots = await getInferenceSlotStatusV1();
    if (!slots.idle) {
      return json({
        success: false,
        error: 'GPU target changes require a verified idle inference slot',
        code: 'GPU_LEASE_REQUIRES_IDLE_SLOTS',
        slots,
      }, { status: 409, headers: { 'Cache-Control': 'no-store' } });
    }
    const updatedState = await switchGpuLeaseTarget(parsed.data.target);
    return json({
      success: true,
      state: updatedState,
      slots,
      error: null
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('Failed to switch GPU lease target:', error);
    return json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Lease transition failed'
      },
      { status: 500 }
    );
  }
};
