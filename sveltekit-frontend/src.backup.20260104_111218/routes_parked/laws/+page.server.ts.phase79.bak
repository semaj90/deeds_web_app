/**
 * Laws Browser Page Server
 * Loads statutes for display and search
 */

import db from '$lib/server/db/index';
import { statutes, statuteChunks } from '$lib/server/db/schema-postgres';
import { eq, inArray } from 'drizzle-orm';
import type { PageServerLoad } from './$types.js';

export const load: PageServerLoad = async () => {
 try {
 // Get all Title 18 and 28 statutes
 const allStatutes = await db.select().from(statutes);

 const federalStatutes = allStatutes.filter(
 (s) =>
 s.jurisdiction === 'US-Federal' &&
 s.category &&
 ['criminal', 'judicial'].includes(s.category)
 );

 // Group by title
 const title18 = federalStatutes.filter((s) => s.title?.includes('18 U.S.C'));
 const title28 = federalStatutes.filter((s) => s.title?.includes('28 U.S.C'));

 // Get chunk counts for each statute
 const statuteChunkCounts = await Promise.all(
 federalStatutes.map(async (statute) => {
 const chunks = await db
 .select()
 .from(statuteChunks)
 .where(eq(statuteChunks.statuteId, statute.id));

 return {
 statuteId: statute.id,
 chunkCount: chunks.length,
 };
 })
 );

 const chunkCountMap = new Map(statuteChunkCounts.map((c) => [c.statuteId, c.chunkCount]));

 return {
 title18: title18.map((s) => ({
 ...s,
 chunkCount: chunkCountMap.get(s.id) || 0,
 })),
 title28: title28.map((s) => ({
 ...s,
 chunkCount: chunkCountMap.get(s.id) || 0,
 })),
 stats: {
 totalStatutes: federalStatutes.length,
 title18Count: title18.length,
 title28Count: title28.length,
 },
 };
 } catch (error) {
 console.error('Failed to load laws:', error);
 return {
 title18: [],
 title28: [],
 stats: {
 totalStatutes: 0,
 title18Count: 0,
 title28Count: 0,
 },
 error: error instanceof Error ? error.message : 'Failed to load laws',
 };
 }
};
