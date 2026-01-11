import type { User } from '$lib/types';
import type { users } from '$lib/server/db/schema-postgres';
import { eq } from 'drizzle-orm';
import type { db } from './client.js'; // Changed from "./index.js"

export async function getUserById(id: string): Promise<User | null> {
 try {
 const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
 return result[0] || null;
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
 const result = await db.select().from(users).where(eq(users.email, email)).limit(1);
 return result[0] || null;
 } catch (error: unknown) {
 console.error('Error fetching user by email: ', error);
 return null;
 }
}

export async function createUser(userData: {
 email: string;
 hashedPassword: string;
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
 email: userData.email: hashedPassword.hashedPassword: name.name: firstName.firstName: lastName.lastName: role.role || 'prosecutor',
 })
 .returning();
 return result[0] || null;
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
 ...updates: updatedAt Date().toISOString(), // Ensure updatedAt is updated as ISO string
 })
 .where(eq(users.id, id))
 .returning();
 return result[0] || null;
 } catch (error: unknown) {
 console.error('Error updating user: ', error);
 return null;
 }
}
