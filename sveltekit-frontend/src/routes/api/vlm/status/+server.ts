import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getVlmState } from '$lib/server/inference/vlm-lifecycle.js';
import { execSync } from 'node:child_process';

function getTurboQuantPid(): number | null {
  try {
    const out = execSync('netstat -ano | findstr ":8090" | findstr "LISTENING"', {
      encoding: 'utf8',
      timeout: 3000,
    }).trim();
    const m = out.match(/(\d+)\s*$/m);
    if (!m) return null;
    const pid = parseInt(m[1]);
    return pid > 4 ? pid : null;
  } catch {
    return null;
  }
}

async function isTurboQuantHealthy(): Promise<boolean> {
  try {
    const res = await fetch('http://127.0.0.1:8090/health', {
      signal: AbortSignal.timeout(1500),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export const GET: RequestHandler = async ({ locals }) => {
  if (!locals.user) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }

  const [mode, pid, healthy] = await Promise.all([
    getVlmState(),
    Promise.resolve(getTurboQuantPid()),
    isTurboQuantHealthy(),
  ]);

  return json({
    mode,
    turboQuant: {
      pid,
      healthy,
      port: 8090,
    },
  });
};
