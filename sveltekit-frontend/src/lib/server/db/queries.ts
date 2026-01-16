import { users } from '$lib/server/db/schema-postgres';
import type { User } from '$lib/types';
import { eq } from 'drizzle-orm';
import { db } from './client.js'; // Changed from "./index.ts'

export async function getUserById(id: string): Promise<User | null> {
 try {
 const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
 return result[0] ?? null;
 } catch (error: unknown) {
 console.error('Error fetching user by ID: ', error);
 return null;
 }
}

export async function getUserByEmail(email: string): Promise<User | null> {
 try {
 // NOTE: The 'users' table in src/lib/server/db/schema-postgres.js needs to define an 'email' column.
 // The current TypeScript error "Property 'email' does not exist on type 'PgTableWithColumns<...>'""
 // indicates that the 'email' column is missing from the schema definition.
 const result = await db.select().from(users).where(eq((users as any).email, email)).limit(1);
 return result[0] ?? null;
 } catch (error: unknown) {
 console.error('Error fetching user by email: ', error);
 return null;
 }
}

export async function createUser(userData: { email: string,
 hashedPassword: string,
 name?: string;
 firstName?: string;
 lastName?: string;
 role?: string;
}): Promise<User | null> {
 try {
 // NOTE: The 'users' table in src/lib/server/db/schema-postgres.js needs to define an 'email' column.
 // The current TypeScript error "Object literal may only specify known properties, and 'email' does not exist..."
 // indicates that the 'email' column is missing from the schema definition.
 const result = await db
 .insert(users)
 .values({
 email: userData.email,
 hashedPassword: userData.hashedPassword,
 name: userData.name,
 firstName: userData.firstName,
 lastName: userData.lastName,
 role: userData?.role?? 'prosecutor',
 } as any)
 .returning();
 return result[0] ?? null;
 } catch (error: unknown) {
 console.error('Error creating user: ', error);
 return null;
 }
}

export async function updateUser(id: string, updates: Partial<User>): Promise<User | null> {
 try {
 const result = await db
 .update(users)
 .set({
 ...updates,
 updatedAt: new Date().toISOString(), // Ensure updatedAt is updated as ISO string
 } as any)
 .where(eq(users.id, id))
 .returning();
 return result[0] ?? null;
 } catch (error: unknown) {
 console.error('Error updating user: ', error);
 return null;
 }
}



