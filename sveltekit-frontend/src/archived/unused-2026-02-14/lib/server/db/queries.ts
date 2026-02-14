import { users } from '$lib/server/db/schema-postgres';
import type { User } from '$lib/types';
import { eq } from 'drizzle-orm';
import { db } from './unified-client.js';
import type { DrizzleTypes } from '$lib/types/enhanced-svelte5-types';

export async function getUserById(id: string): Promise<User | null> {
    try {
        const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
        return (result[0] as unknown as User) ?? null;
    } catch (error: unknown) {
        console.error('Error fetching user by ID: ', error);
        return null;
    }
}

export async function getUserByEmail(email: string): Promise<User | null> {
    try {
        // Casting users to any to access email if it's not strictly typed in schema yet
        const result = await db.select().from(users).where(eq((users as any).email, email)).limit(1);
        return (result[0] as unknown as User) ?? null;
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
        const result = await db
            .insert(users)
            .values({
                email: userData.email,
                passwordHash: userData.hashedPassword, // Mapped to Correct schema column
                firstName: userData.firstName,
                lastName: userData.lastName,
                role: userData?.role ?? 'prosecutor',
            } as any)
            .returning();
        return (result[0] as unknown as User) ?? null;
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
                updatedAt: new Date().toISOString()
            } as any)
            .where(eq(users.id, id))
            .returning();
        return (result[0] as unknown as User) ?? null;
    } catch (error: unknown) {
        console.error('Error updating user: ', error);
        return null;
    }
}
