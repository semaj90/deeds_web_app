import type { PageServerLoad, Actions } from './$types';
import { db, sql, eq, and, desc } from '$lib/server/db';
import { aiConversations, aiMessages } from '$lib/server/db/schema-unified';

export const load: PageServerLoad = async ({ locals, params }) => {
  const user = locals.user;
  if (!user?.id) return { conversation: null, messages: [] };

  const conversationId = params.id;

  const conversation = await db
    .select({
      id: aiConversations.id,
      title: aiConversations.title,
      model: aiConversations.model,
      createdAt: aiConversations.createdAt,
      messageCount: sql<number>`(
        SELECT COUNT(*) FROM ${aiMessages}
        WHERE ${aiMessages.conversationId} = ${aiConversations.id}
      )`,
    })
    .from(aiConversations)
    .where(and(eq(aiConversations.id, conversationId), eq(aiConversations.userId, user.id)))
    .limit(1);

  const messages = await db
    .select()
    .from(aiMessages)
    .where(eq(aiMessages.conversationId, conversationId))
    .orderBy(aiMessages.createdAt);

  return {
    conversation: conversation[0],
    messages,
  };
};

export const actions = {
  sendMessage: async ({ request, locals }) => {
    const data = await request.formData();
    const message = String(data.get('message') ?? '');
    const conversationId = String(data.get('conversationId') ?? '');

    const [userMessage] = await db
      .insert(aiMessages)
      .values({
        conversationId,
        role: 'user',
        content: message,
        createdAt: new Date(),
      })
      .returning();

    // TODO: Call AI service (Ollama, etc.)
    return { success: true, messageId: userMessage.id };
  },
} satisfies Actions;
