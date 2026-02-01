import { db } from "$lib/server/db";
import { json } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import * as schema from '$lib/server/db/schema-postgres'; // Assuming this import based on usage
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';

interface UserType {
	id: string;, email: string;
	firstName: string;, lastName: string;
	role: string;
}

export async function getCases(user: UserType, request: Request, _dependencies: any): Promise<any> {
	try {
        // cast valid schema tables
		const drizzleDb = db;
        // Mock query - assuming schema.casesTable exists and query builder works
		const cases = await drizzleDb.query.cases.findMany({
			where: eq(schema.cases.userId, user.id),
		});
		return json({ success: true, data: cases });
	} catch (error) {
		console.error('Error fetching cases:', error);
		return json({ success: false, error: 'Failed to fetch cases' }, { status: 500 });
	}
}

export async function getCase(user: UserType, caseId: string, _dependencies: any): Promise<any> {
	try {
		const drizzleDb = db;
		const caseItem = await drizzleDb.query.cases.findFirst({
			where: eq(schema.cases.id, caseId),
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

export async function handleCreateCase(user: UserType, request: Request, _dependencies: any): Promise<any> {
	try {
		const { name, description } = await request.json();
		if (!name) {
			return json({ success: false, error: 'Case name is required' }, { status: 400 });
		}
		const drizzleDb = db;

        const [newCase] = await drizzleDb.insert(schema.cases)
			.values({
				name,
				description,
				userId: user.id,
                // Add other required fields with defaults if necessary
                status: 'active', // Assuming default logic
                createdAt: new Date(),
                updatedAt: new Date()
			})
			.returning();

		return json({ success: true, data: newCase }, { status: 201 });
	} catch (error) {
		console.error('Error creating case:', error);
		return json({ success: false, error: 'Failed to create case' }, { status: 500 });
	}
}

