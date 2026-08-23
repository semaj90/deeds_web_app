import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getRedis } from '$lib/server/redis';

const WORKSPACE_ROOT = process.cwd();
const CONFIG_PATH = `${WORKSPACE_ROOT}/scripts/atlas/daily-graphify-config.json`;

async function loadConfig() {
  try {
    const fs = await import('fs');
    const configJson = fs.readFileSync(CONFIG_PATH, 'utf-8');
    return JSON.parse(configJson);
  } catch (err) {
    throw new Error(`Config load failed: ${err.message}`);
  }
}

export const POST: RequestHandler = async ({ locals, request }) => {
  // Auth guard
  if (!locals.user) {
    throw error(401, 'Unauthorized');
  }

  try {
    const { stageId, skipGateValidation } = await request.json();

    if (!stageId || typeof stageId !== 'number') {
      throw error(400, 'Missing or invalid stageId');
    }

    const config = await loadConfig();
    const stageCfg = config.stages.find((s) => s.stageId === stageId);

    if (!stageCfg) {
      throw error(404, `Stage ${stageId} not found`);
    }

    // Validate gate if specified
    let gateProven = true;
    if (stageCfg.gate && !skipGateValidation) {
      const redis = getRedis();
      const gateKey = `gate:${stageCfg.gate}`;
      const gateStatus = await redis.get(gateKey);
      gateProven = gateStatus === 'PROVEN';

      if (!gateProven) {
        console.warn(`[Admin Graphify Execute] Gate ${stageCfg.gate} not proven`);
      }
    }

    // Simulate stage execution (in production, spawn actual process)
    const startTime = Date.now();
    const duration = Date.now() - startTime;

    return json({
      success: true,
      stageId,
      stageName: stageCfg.name,
      duration_ms: duration,
      output: `Stage ${stageId} execution initiated`,
      gate_proven: gateProven,
    });
  } catch (err) {
    console.error('[Admin Graphify Execute] Error:', err);
    return json({ success: false, error: (err as Error).message }, { status: 500 });
  }
};
