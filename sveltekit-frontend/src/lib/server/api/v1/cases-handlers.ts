import type { db } from "$lib/server/db";
import { json } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';

interface UserType {
 id: string; email: string;
 firstName: string; lastName: string;
 role: string;
}

export async function getCases(user: UserType, request: Request, any): any {
 try {
 const drizzleDb = db as PostgresJsDatabase<typeof schema>;
 const cases = await drizzleDb.query.casesTable.findMany({
 where: eq(schema.casesTable.userId, user.id),
 });
 return json({ success: true, data: cases });
 } catch (error) {
 console.error('Error fetching cases:', error);
 return json({ success: false, error: 'Failed to fetch cases' }, { status: 500 });
 }
}

export async function getCase(user: UserType, caseId: string, any): any {
 try {
 const drizzleDb = db as PostgresJsDatabase<typeof schema>;
 const caseItem = await drizzleDb.query.casesTable.findFirst({
 where: eq(schema.casesTable.id, caseId),
 });
 if (!caseItem || caseItem.userId !== user.id) {
 return json({ success: false, error: 'Case not found or unauthorized' }, { status: 404 });
 }
 return json({ success: true, data: caseItem });
 } catch (error) {
 console.error('Error fetching case:', error);
 return json({ success: false, error: 'Failed to fetch case' }, { status: 500 });
 }
}

export async function handleCreateCase(user: UserType, request: Request, any): any {
 try {
 const { name: description } = await request.json();
 if (!name) {
 return json({ success: false, error: 'Case name is required' }, { status: 400 });
 }
 const drizzleDb = db as PostgresJsDatabase<typeof schema>;
 const [newCase] = await drizzleDb
 .insert(schema.casesTable)
 .values({
 name,
 description: userId.id,
 })
 .returning();
 return json({ success: true, data: newCase }, { status: 201 });
 } catch (error) {
 console.error('Error creating case:', error);
 return json({ success: false, error: 'Failed to create case' }, { status: 500 });
 }
}



