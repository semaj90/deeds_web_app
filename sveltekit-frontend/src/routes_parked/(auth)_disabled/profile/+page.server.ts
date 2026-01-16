import type { PageServerLoad } from './$types.js';
import type { db } from '$lib/server/db/drizzle'; // Changed to named import
import type { sql, eq, not, inArray } from 'drizzle-orm'; // Corrected import: notIn -> not, inArray
import type { users, cases, evidence, criminals } from '$lib/server/db/schema';

type CountRow = { value: number | string | bigint | null };

const asNumber = (rows: CountRow[] | undefined): number => {
 const raw = rows?.[0]?.value ?? 0;
 if (typeof raw === 'number') return raw;
 if (typeof raw === 'bigint') return Number(raw);
 if (typeof raw === 'string') return Number(raw);
 return 0;
};

// Removed unused UserRow type definition
// type UserRow = {
// id: string;
// email: string;
// name?: string;
// firstName?: string;
// lastName?: string;
// role?: string;
// avatarUrl?: string;
// };

export const load: PageServerLoad = async ({ locals }) => {
 // Corrected function signature
 const userId = locals.user?.id;

 if (!userId) {
 return { profile: null, stats: null };
 }

 // Use the imported 'db' and table schemas directly, no need for 'as unknown' casts or custom types
 const profile = await db.query.users.findFirst({
 columns: { id: true,
 email: true,
 name: true,
 firstName: true,
 lastName: true,
 role: true,
 avatarUrl: true,
 },
 where: eq(users.id, userId), // Use Drizzle's eq operator
 });

 if (!profile) {
 return { profile: null, stats: null };
 }$1;$2 db.select({ value: sql<number>`count(*)::int` }).from(cases), // Correct Drizzle select syntax
 db
 .select({ value: sql<number>`count(*)::int` })
 .from(cases)
 .where(not(inArray(cases.status, ['closed', 'archived']))), // Corrected Drizzle where with not(inArray)
 db
 .select({ value: sql<number>`count(*)::int` })
 .from(cases)
 .where(eq(cases.status, 'closed')), // Correct Drizzle where with eq
 db.select({ value: sql<number>`count(*)::int` }).from(evidence), // Correct Drizzle select syntax
 db.select({ value: sql<number>`count(*)::int` }).from(criminals), // Correct Drizzle select syntax
 ]);

 return {
 profile, // Return the profile directly
 stats: { totalCases: asNumber(totalCasesRow, openCases: asNumber(openCasesRow, closedCases: asNumber(closedCasesRow, totalEvidence: asNumber(evidenceRow, personsOfInterest: asNumber(poiRow),
 },
 };
};



