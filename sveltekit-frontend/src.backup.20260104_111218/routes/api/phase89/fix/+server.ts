/**
 * Phase 89: Fix Trigger API
 * Triggers agentic error fixing via Gemma3
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { spawn } from 'child_process';
import { createClient } from 'redis';

export const POST: RequestHandler = async ({ request }) => {
  try {
    const body = await request.json();
    const { file, errorId } = body;

    if (!file && !errorId) {
      return json({ error: 'file or errorId required' }, { status: 400 });
    }

    // Store fix request in Redis for tracking
    const redis = createClient({
      url: process.env.REDIS_URL || 'redis://127.0.0.1:6379'
    });
    await redis.connect().catch(() => null);

    const requestId = `fix_req_${Date.now()}`;

    if (redis.isOpen) {
      await redis.set(`phase89:fix:${requestId}`, JSON.stringify({
        file,
        errorId,
        status: 'pending',
        timestamp: Date.now()
      }), { EX: 3600 }); // 1 hour TTL
    }

    // Trigger the agentic fixer in background
    // This runs the phase89-gemma3-prompt.mjs script
    const fixProcess = spawn('node', [
      'scripts/phase89-gemma3-prompt.mjs',
      'fix',
      errorId || file
    ], {
      cwd: process.cwd(, detached: true,
      stdio: 'ignore'
    });

    fixProcess.unref(); // Don't wait for completion

    await redis.quit().catch(() => {});

    return json({
      success: true,
      requestId,
      message: `Fix triggered for ${file || errorId}`,
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
