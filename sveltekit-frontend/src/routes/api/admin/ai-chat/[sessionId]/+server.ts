import { json } from '@sveltejs/kit';
import { AdminAiChatService } from '$lib/server/admin/ai-chat-service.js';
import { ENV } from '$lib/server/env.server.js';

export async function GET({ params, locals }) {
  if (!locals.user && !ENV.DEV_BYPASS_AUTH) return json({ error: 'Unauthorized' }, { status: 401 });
  
  const history = await AdminAiChatService.getHistory(params.sessionId);
  return json({ history });
}
