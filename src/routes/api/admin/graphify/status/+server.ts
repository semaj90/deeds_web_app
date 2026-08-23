import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

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

export const GET: RequestHandler = async ({ locals }) => {
  // Auth guard
  if (!locals.user) {
    throw error(401, 'Unauthorized');
  }

  try {
    const config = await loadConfig();

    return json({
      workspace_id: config.workspace_id,
      schedule: config.schedule,
      stages: config.stages.map((s) => ({
        stageId: s.stageId,
        name: s.name,
        script: s.script,
        critical: s.critical,
        gate: s.gate,
      })),
      monitoring: config.monitoring,
      lastUpdated: config.lastUpdated,
    });
  } catch (err) {
    console.error('[Admin Graphify Status] Error:', err);
    return json(
      { stages: [], workspace_id: 'unknown', monitoring: {}, schedule: {}, lastUpdated: null },
      { status: 500 }
    );
  }
};
