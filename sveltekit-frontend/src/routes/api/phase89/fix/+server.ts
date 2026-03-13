/**
 * Phase 89: Fix Trigger API
 * Triggers agentic error fixing via Gemma3
 */

import { json } from '@sveltejs/kit';
import { spawn } from 'child_process';
import { createClient } from 'redis';
import { getRedisUrl } from '$lib/config/env.server.js';
import type { RequestHandler } from './$types';
import { z } from 'zod';

const fixTriggerSchema = z.object({
  file: z.string().max(1000).optional(),
  errorId: z.string().max(500).optional(),
}).refine((data) => data.file || data.errorId, {
  message: 'file or errorId required',
});

export const POST: RequestHandler = async ({ request }) => {
  try {
    const parsed = fixTriggerSchema.safeParse(await request.json());
    if (!parsed.success) {
      return json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' }, { status: 400 });
    }
    const { file, errorId } = parsed.data;

    // Store fix request in Redis for tracking
    const redis = createClient({
      url: getRedisUrl()
    });
    await redis.connect().catch(() => null);

    const requestId = 'fix_req_' + Date.now();

    if (redis.isOpen) {
      await redis.set('phase89:fix:' + requestId, JSON.stringify({
        file,
        errorId,
        status: 'pending',
        timestamp: Date.now()
      }), { EX: 3600 });
    }

    // Trigger the agentic fixer in background
    // This runs the phase89-gemma3-prompt.mjs script
    const fixProcess = spawn('node', [
      'scripts/phase89-gemma3-prompt.mjs',
      'fix',
      errorId || file
    ], {
      cwd: process.cwd(),
      detached: true,
      stdio: 'ignore'
    });

    fixProcess.unref(); // Don't wait for completion

    await redis.quit().catch(() => {});

    return json({
      success: true,
      requestId,
      message: 'Fix triggered for ' + (file || errorId),
      status: 'processing'
    });
  } catch (error: any) {
    console.error('Fix trigger error:', error);
    return json({
      success: false,
      error: error.message
    }, { status: 500 });
  }
};