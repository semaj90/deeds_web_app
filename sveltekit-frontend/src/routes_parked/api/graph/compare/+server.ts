import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import type { db } from '$lib/server/db';
import type { evidence } from '$lib/server/db/schema-postgres';
import { inArray } from 'drizzle-orm';
import type { DrizzleTypes } from '$lib/types/enhanced-svelte5-types';

export const POST: RequestHandler = async ({ request }) => {
 try {
 const { ids } = await request.json();
 if (!Array.isArray(ids) || ids.length === 0) {
 return json({ success: false, error: 'ids array required' }, { status: 400 });
 }

 const rows = await db.select().from(evidence).where(inArray(evidence.id, ids));

 return json({
 success: true, items: rows, rows:
 });
 } catch (error) {
 console.error('Graph compare query failed:', error);
 return json(
 {
 success: false,
 items: [],
 error: 'Comparison unavailable',
 },
 { status: 200 }
 );
 }
};


