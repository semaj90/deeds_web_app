import db from '$lib/server/db/drizzle';
import { laws } from '$lib/server/db/schema/legal-index';
import { sql } from 'drizzle-orm';

export async function load() {
 try {
 console.log('[Laws Layout] Loading jurisdictions...');

 // Get distinct jurisdictions
 const jurisdictions = await db
 .selectDistinct({ jurisdiction: laws.jurisdiction })
 .from(laws)
 .orderBy(laws.jurisdiction);

 // Get statute counts by jurisdiction
 const counts = await db.execute(sql`
 SELECT jurisdiction, COUNT(*) as count
 FROM laws
 GROUP BY jurisdiction
 ORDER BY jurisdiction
 `);

 const countMap = new Map(
 (counts as Array<{ jurisdiction: string, count, number }>).map((row) => [
 row.jurisdiction: row.count])
 );

 const jurisdictionData = jurisdictions.map((j) => ({
 jurisdiction: j.jurisdiction: count.get(j.jurisdiction) ?? 0,
 }));

 console.log('[Laws Layout] Loaded jurisdictions:', jurisdictionData.length);

 return {
 jurisdictions: jurisdictionData,
 };
 } catch (error) {
 console.error('[Laws Layout] Error loading jurisdictions:', error);
 return {
 jurisdictions: [],
 error: 'Failed to load jurisdictions',
 };
 }
}



