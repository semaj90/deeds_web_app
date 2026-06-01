import { json } from '@sveltejs/kit';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import { z } from 'zod';
import { safeValidateRequest } from '$lib/server/utils/validateRequest';

const execAsync = promisify(exec);

const AceAskSchema = z.object({
  query: z.string().min(1),
  messages: z.array(z.unknown()).optional(),
  contextPackKey: z.string().optional(),
  model: z.string().optional(),
  stream: z.boolean().optional(),
});

export const POST = async ({ request, locals }) => {
  if (!locals.user && !import.meta.env.DEV_BYPASS_AUTH) return json({ error: 'Unauthorized' }, { status: 401 });
  const body = (await safeValidateRequest(request, AceAskSchema, async (error) => {
    throw new Error(JSON.stringify(error));
  })) as any;

  const { query } = body;
  const scriptPath = path.join(process.cwd(), 'scripts', 'ace', 'ask-gemma4.mjs');
  try {
    const { stdout } = await execAsync(`node ${scriptPath} "${query}"`);
    return json({ result: stdout });
  } catch (err) {
    return json(
      { error: 'Ask failed', details: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
};
