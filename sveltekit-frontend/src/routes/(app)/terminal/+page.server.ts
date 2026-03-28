import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db/client';
import { chatMessages } from '$lib/server/db/schema.js';
import { desc, like } from 'drizzle-orm';

const safe = <T>(p: Promise<T>, fb: T): Promise<T> =>
	Promise.race([p.catch(() => fb), new Promise<T>((r) => setTimeout(() => r(fb), 5000))]);

export const load: PageServerLoad = async ({ locals }) => {
	const user = locals.user;
	if (!user) return { user: null, recentChats: [] };

	// Get recent terminal chat IDs for this user (by chatId prefix convention)
	const prefix = `terminal-${user.id}`;
	const rows = await safe(
		db
			.selectDistinct({ chatId: chatMessages.chatId })
			.from(chatMessages)
			.where(like(chatMessages.chatId, `${prefix}%`))
			.orderBy(desc(chatMessages.timestamp))
			.limit(10),
		[]
	);

	return {
		user: { id: user.id, username: user.username, email: user.email },
		recentChats: rows.map((r) => r.chatId)
	};
};
