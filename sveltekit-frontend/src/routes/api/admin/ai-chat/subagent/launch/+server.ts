import { json } from '@sveltejs/kit';
import { SubagentOrchestrator } from '$lib/server/admin/subagent-orchestrator.js';
import { ENV } from '$lib/server/env.server.js';
import { z } from 'zod';

const SubagentLaunchSchema = z.object({
  skillName: z.string().min(1),
  mission: z.string().min(1),
  input: z.any().optional(),
});

/**
 * Launch an autonomous subagent mission.
 */
export async function POST({ request, locals }) {
  if (!locals.user && !ENV.DEV_BYPASS_AUTH) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }

  const raw = await request.json();
  const parsed = SubagentLaunchSchema.safeParse(raw);
  if (!parsed.success) {
    return json({ error: 'Invalid payload: ' + parsed.error.issues[0]?.message }, { status: 400 });
  }

  const { skillName, mission, input } = parsed.data;

  const userId = locals.user?.id || 'dev-admin';

  try {
    const result = await SubagentOrchestrator.runMission(userId, {
      skillName,
      mission,
      input
    });

    return json(result);
  } catch (err: any) {
    console.error('[SubagentLaunchAPI] Error:', err);
    return json({ error: err.message }, { status: 500 });
  }
}
