import { json } from '@sveltejs/kit';
import { z } from 'zod';
import { runAceScriptV1 } from '$lib/server/ace/ace-script-runner-v1.js';
import { requireUser } from '$lib/server/auth-utils.js';

const AceAskSchema = z.object({
  query: z.string().trim().min(1, 'Query cannot be empty').max(4096, 'Query exceeds 4096 character limit'),
  messages: z.array(z.unknown()).optional(),
  contextPackKey: z.string().optional(),
  model: z.string().optional(),
  stream: z.boolean().optional(),
});

export const POST = async (event) => {
  requireUser(event);
  const { request } = event;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = AceAskSchema.safeParse(body);
  if (!parsed.success) {
    return json(
      { error: 'Validation failed', details: parsed.error.format() },
      { status: 400 }
    );
  }

  const { query } = parsed.data;
  try {
    const { stdout } = await runAceScriptV1('ask-gemma4.mjs', query);
    return json({ result: stdout });
  } catch (err) {
    console.error('[api/ace/ask] Script execution error:', err instanceof Error ? err.message : String(err));
    return json(
      { error: 'Ask failed', details: 'Script execution failed or timed out' },
      { status: 500 }
    );
  }
};
