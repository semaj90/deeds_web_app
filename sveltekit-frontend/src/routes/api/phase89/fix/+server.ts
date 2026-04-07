/**
 * Phase 89: Fix Trigger API
 * Triggers agentic error fixing via Gemma3
 */

import { json } from '@sveltejs/kit';
import { spawn } from 'child_process';
import path from 'path';
import { getRedis } from '$lib/server/redis.js';
import type { RequestHandler } from './$types';
import { z } from 'zod';

const fixTriggerSchema = z.object({
  file: z.string().max(1000).optional(),
  errorId: z.string().max(500).optional(),
}).refine((data) => data.file || data.errorId, {
  message: 'file or errorId required',
});

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const parsed = fixTriggerSchema.safeParse(await request.json());
    if (!parsed.success) {
      return json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' }, { status: 400 });
    }
    const { file, errorId } = parsed.data;

    // Validate file path stays within project
    if (file) {
      const resolved = path.resolve(process.cwd(), file);
      if (!resolved.startsWith(process.cwd())) {
        return json({ error: 'Invalid file path' }, { status: 400 });
      }
    }

    // Store fix request in Redis for tracking
    const redis = getRedis();

    const requestId = 'fix_req_' + Date.now();

    if (redis.status === 'ready') {
      await redis.set(
        'phase89:fix:' + requestId,
        JSON.stringify({
          file,
          errorId,
          status: 'pending',
          timestamp: Date.now(),
        }),
        'EX',
        3600
      );
    }

    // Trigger the agentic fixer in background
    // This runs the phase89-gemma3-prompt.mjs script
    const fixProcess = spawn(
      'node',
      ['scripts/phase89-gemma3-prompt.mjs', 'fix', errorId || file],
      {
        cwd: process.cwd(),
        detached: true,
        stdio: 'ignore',
      }
    );

    fixProcess.unref(); // Don't wait for completion

    return json({
      success: true,
      requestId,
      message: 'Fix triggered for ' + (file || errorId),
      status: 'processing',
    });
  } catch (error) {
    console.error('Fix trigger error:', error);
    return json({
      success: false,
      error: 'Fix operation failed'
    }, { status: 500 });
  }
};