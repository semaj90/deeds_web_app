import { json } from '@sveltejs/kit';
import { AdminAiChatService } from '$lib/server/admin/ai-chat-service.js';
import { ENV } from '$lib/server/env.server.js';

export async function GET({ locals }) {
  if (!locals.user && !ENV.DEV_BYPASS_AUTH) return json({ sessions: [], error: 'Unauthorized' }, { status: 401 });

  try {
    const userId = locals.user?.id || 'dev-admin';
    const sessions = await AdminAiChatService.listSessions(userId);
    return json({ sessions: Array.isArray(sessions) ? sessions : [] });
  } catch (err) {
    console.warn('[/api/admin/ai-chat/sessions] Returning empty fallback:', err);
    return json({ sessions: [] });
  }
}
