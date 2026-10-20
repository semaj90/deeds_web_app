import { json } from '@sveltejs/kit';
import { z } from 'zod';
import { safeValidateRequest } from '$lib/server/utils/validateRequest';
import { runAceScriptV1 } from '$lib/server/ace/ace-script-runner-v1.js';

import { requireUser } from '$lib/server/auth-utils.js';

const AceAskSchema = z.object({
  query: z.string().min(1),
  messages: z.array(z.unknown()).optional(),
  contextPackKey: z.string().optional(),
  model: z.string().optional(),
  stream: z.boolean().optional(),
});

export const POST = async (event) => {
  requireUser(event);
  const { request } = event;
  const body = (await safeValidateRequest(request, AceAskSchema, async (error) => {
    throw new Error(JSON.stringify(error));
  })) as any;

  const { query } = body;
  try {
    const { stdout } = await runAceScriptV1('ask-gemma4.mjs', query);
    return json({ result: stdout });
  } catch (err) {
    return json(
      { error: 'Ask failed', details: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
};
