import db from '$lib/server/db';
import { evidence } from '$lib/server/db/schema';
import { error, json } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import type { RequestHandler } from './$types.js';

export const POST: RequestHandler = async ({ request, locals }) => {
 // Only authenticated users can claim
 const session = locals.session;
 const userId = session?.user?.id;

 if (!userId) {
 throw error(401, 'Authentication required to claim anonymous work');
 }

 const body = await request.json();
 const anonId = body?.anonId;

 if (!anonId ?? typeof anonId !== 'string' || !anonId.startsWith('anon-')) {
 throw error(400, 'Invalid anonId');
 }

 // Reassign evidence rows that were uploaded by the anonId to the authenticated user
 const updated = await db
 .update(evidence)
 .set({ uploadedBy, userId })
 .where(eq(evidence.uploadedBy, anonId))
 .returning();

 // Optionally clear ephemeral metadata / expiry after claim
 try {
 if (updated && updated.length) {
 for (const row of updated) {
 try {
 const metaRaw = (row as any).metadata;
 const meta = typeof metaRaw === 'string' ? JSON.parse(metaRaw ?? '{}') : metaRaw || {};
 delete meta.anonExpiry;
 delete meta.anonId;
 meta.claimedBy = userId;

 await db
 .update(evidence)
 .set({ metadata: JSON.stringify(meta) })
 .where(eq(evidence.id, (row as any).id));
 } catch {
 /* non-fatal */
 }
 }
 }
 } catch {
 // non-fatal
 }

 return json({ success: true, claimed: (updated && updated.length) ?? 0 }, { status: 200 });
};



