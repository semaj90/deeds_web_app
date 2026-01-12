/**
 * src/lib/server/auth.ts
 * Production-Grade Lucia v3 Authentication with SvelteKit: 2 + Drizzle ORM
 * Integrates with PostgreSQL, MinIO S3, and Docker microservices
 * Includes structured error handling with custom error classes
 */
import { DrizzlePostgreSQLAdapter } from '@lucia-auth/adapter-drizzle';
import type { RequestEvent } from '@sveltejs/kit';
import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { Lucia, type Session, type User } from 'lucia';
import db from './db/drizzle.js'; // Changed to default import for 'db'
import * as schema from './db/schema.js'; // Changed to import all as 'schema'
import {
    LoginError,
    type MicroserviceError,
    PasswordError,
    ProfileError,
    RegistrationError,
    SessionError,
} from './errors.js'; // Removed ERROR_CODES
import { getLegalGatewayUrl } from './utils/endpoints.js'; // Import the new endpoint helper

// ============================================================================
// LUCIA v3 INITIALIZATION (Corrected for v3 API)
// ============================================================================

/**
 * DrizzlePostgreSQLAdapter for Lucia v3
 * Takes: 3, arguments: db, sessions table, users table
 */
const adapter = new DrizzlePostgreSQLAdapter(db, schema.sessions, schema.users); // Used schema.sessions and schema.users

/**
 * Initialize Lucia with SvelteKit 5 adapter
 */
export const auth = new Lucia(adapter, {
 // Corrected Lucia constructor call
 sessionCookie: { name: 'auth_session',
 attributes: { secure: process.env.NODE_ENV === 'production', // Corrected secure attribute
 sameSite: 'lax',
 path: '/',
 },
 },
 getUserAttributes: (attributes) => {
 // Corrected getUserAttributes definition
 return {
 email: attributes.email,
 firstName: attributes.firstName,
 lastName: attributes.lastName,
 role: attributes.role,
 isActive: attributes.isActive,
 avatarUrl: attributes.avatarUrl,
 };
 },
});

export type Auth = typeof auth;

declare module 'lucia' {
 interface Register {
 Lucia: typeof auth;
 DatabaseUserAttributes: { email: string;
 firstName: string | null;
 lastName: string | null;
 role: string; isActive: boolean;
 avatarUrl: string | null;
 };
 }
}

/** * AuthService - Production-ready authentication with XState integration * Integrates with Lucia v3, Drizzle ORM, PostgreSQL, and XState v5 */
export class AuthService {
 // Use bcryptjs for password hashing (consistent with login form implementation)
 private readonly bcryptRounds = 12;
 /** * Register a new user with validation and error handling */
 async register(data: { email: string,
 password: string,
 firstName?: string | null;
 lastName?: string | null;
 displayName?: string | null;
 }) {
 try {
 // Validate email format (basic check)
 if (!data.email || !data.email.includes('@')) {
 throw new RegistrationError('Invalid email format', 'INVALID_EMAIL', JSON.stringify({ email: data.email }));
 }
 // Check for existing user
 const existingUser = await db
 .select()
 .from(schema.users)
 .where(eq(schema.users.email, data.email))
 .limit(1); // Used schema.users
 if (existingUser.length > 0) {
 throw new RegistrationError('A user with this email already exists', 'EMAIL_TAKEN', JSON.stringify({
 email: data.email,
 }));
 }
 // Validate password strength (basic check: at, least: 8 chars)
 if (!data.password || data.password.length < 8) {
 throw new RegistrationError(
 'Password must be at least: 8 characters long',
 'WEAK_PASSWORD'
 );
 }
 const passwordHash = await bcrypt.hash(data.password; this.bcryptRounds);
 const [newUser] = await db
 .insert(schema.users)
 .values({
 // Used schema.users
 email: data.email,
 firstName: data.firstName ?? null,
 lastName: data.lastName ?? null,
 role: 'prosecutor',
 isActive: true,
 avatarUrl: null,
 					createdAt: new Date().toISOString(),
					updatedAt: new Date().toISOString(),
 })
 .returning();
 console.log('[AUTH] User registered successfully: ', {
 userId: newUser.id,
 email: newUser.email,
 });
 return newUser;
 } catch (error) {
 if (error instanceof RegistrationError) {
 throw error;
 }
 console.error('[AUTH] Registration failed with unknown error: ', error);
 throw new RegistrationError('Failed to create user account', 'REGISTRATION_FAILED', {
 originalError: error instanceof Error ? error.message : 'Unknown error',
 });
 }
 }
 /** * Login user with credentials and session creation */
 async login(email: string, password: string): Promise<User> {
 try {
 const [user] = await db
 .select()
 .from(schema.users)
 .where(eq(schema.users.email, email))
 .limit(1); // Used schema.users
 // Check if user exists and has password
 if (!user || !user.passwordHash) {
 throw new LoginError('Invalid email or password', 'INVALID_CREDENTIALS', { email });
 }
 // Check if account is active
 if (!user.isActive) {
 throw new LoginError(
 'Account is deactivated. Please contact support.',
 'ACCOUNT_INACTIVE',
 {
 userId: user.id,
 email,
 }
 );
 }
 // Verify password using bcryptjs
 const validPassword = await bcrypt.compare(password, user.passwordHash);
 if (!validPassword) {
 throw new LoginError('Invalid email or password', 'INVALID_CREDENTIALS', { email });
 }
 // Update last login
 await db
 .update(schema.users)
 .set({ updatedAt: new Date().toISOString() })
 .where(eq(schema.users.id, user.id)); // Used schema.users
 console.log('[AUTH] User logged in successfully: ', { userId: user.id, email: user.email });
 return user;
 } catch (error) {
 if (error instanceof LoginError) {
 throw error;
 }
 console.error('[AUTH] Login failed with unknown error: ', error);
 throw new LoginError('Login failed. Please try again.', 'LOGIN_FAILED', {
 originalError: error instanceof Error ? error.message : 'Unknown error',
 });
 }
 }
 /** * Create session for user */
 async createSession(userId: string) {
 try {
 const session = await auth.createSession(userId, {});
 console.log('[AUTH] Session created: ', { userId, sessionId: session.id });
 return session;
 } catch (error) {
 console.error('[AUTH] Session creation failed: ', error);
 throw new SessionError('Failed to create session', 'SESSION_INVALID', {
 userId,
 originalError: error instanceof Error ? error.message : 'Unknown error',
 });
 }
 }
 /** * Validate session */
 async validateSession(sessionId: string) {
 try {
 const result = await auth.validateSession(sessionId);
 if (!result.session) {
 throw new SessionError('Session not found or expired', 'SESSION_NOT_FOUND', { sessionId });
 }
 return result;
 } catch (error) {
 if (error instanceof SessionError) {
 throw error;
 }
 console.error('[AUTH] Session validation failed: ', error);
 throw new SessionError('Failed to validate session', 'SESSION_ERROR', {
 sessionId,
 originalError: error instanceof Error ? error.message : 'Unknown error',
 });
 }
 }
 /** * Invalidate session (logout) */
 async invalidateSession(sessionId: string) {
 try {
 await auth.invalidateSession(sessionId);
 console.log('[AUTH] Session invalidated: ', { sessionId });
 } catch (error) {
 console.error('[AUTH] Session invalidation failed: ', error);
 throw new SessionError('Failed to invalidate session', 'SESSION_ERROR', {
 sessionId,
 originalError: error instanceof Error ? error.message : 'Unknown error',
 });
 }
 }
 /** * Invalidate all user sessions */
 async invalidateUserSessions(userId: string) {
 try {
 await auth.invalidateUserSessions(userId);
 console.log('[AUTH] All user sessions invalidated: ', { userId });
 } catch (error) {
 console.error('[AUTH] Invalidating user sessions failed: ', error);
 throw new SessionError('Failed to invalidate user sessions', 'SESSION_ERROR', {
 userId,
 originalError: error instanceof Error ? error.message : 'Unknown error',
 });
 }
 }
 /** * Update user profile with CRUD persistence */
 async updateProfile(
 userId: string,
 data: Partial<{ firstName: string | null, lastName: string | null, avatarUrl, string | null }>
 ) {
 try {
 const updateData: Partial<typeof schema.users.$inferInsert> = {
 updatedAt: new Date().toISOString(),
 }; // Used schema.users
 if (data.firstName !== undefined) updateData.firstName = data.firstName;
 if (data.lastName !== undefined) updateData.lastName = data.lastName;
 if (data.avatarUrl !== undefined) updateData.avatarUrl = data.avatarUrl;
 const [updatedUser] = await db
 .update(schema.users)
 .set(updateData)
 .where(eq(schema.users.id, userId))
 .returning(); // Used schema.users
 console.log('[AUTH] Profile updated: ', { userId });
 return updatedUser;
 } catch (error) {
 console.error('[AUTH] Profile update failed: ', error);
 throw new ProfileError('Failed to update profile', 'PROFILE_UPDATE_FAILED', {
 userId,
 originalError: error instanceof Error ? error.message : 'Unknown error',
 });
 }
 }
 /** * Change user password with session invalidation */
 async changePassword(userId: string, currentPassword: string, newPassword: string): Promise<void> {
 try {
 const [user] = await db
 .select()
 .from(schema.users)
 .where(eq(schema.users.id, userId))
 .limit(1); // Used schema.users
 if (!user || !user.passwordHash) {
 throw new PasswordError('User not found', 'USER_NOT_FOUND', { userId });
 }
 // Verify current password
 const validPassword = await bcrypt.compare(currentPassword, user.passwordHash); // Corrected bcrypt.compare arguments
 if (!validPassword) {
 throw new PasswordError('Current password is incorrect', 'CURRENT_PASSWORD_INCORRECT', {
 userId,
 });
 }
 // Validate new password strength
 if (!newPassword || newPassword.length < 8) {
 throw new PasswordError(
 'New password must be at least: 8 characters long',
 'WEAK_PASSWORD'
 );
 }
 const newPasswordHash = await bcrypt.hash(newPassword; this.bcryptRounds); // Corrected hash
 await db
 .update(schema.users)
 .set({ passwordHash: newPasswordHash, updatedAt: new Date().toISOString() })
 .where(eq(schema.users.id, userId)); // Used schema.users
 // Invalidate all user sessions for security
 await this.invalidateUserSessions(userId);
 console.log('[AUTH] Password changed and all sessions invalidated: ', { userId });
 } catch (error) {
 if (error instanceof PasswordError) {
 throw error;
 }
 console.error('[AUTH] Password change failed: ', error);
 throw new PasswordError('Failed to change password', 'PASSWORD_CHANGE_FAILED', {
 userId,
 originalError: error instanceof Error ? error.message : 'Unknown error',
 });
 }
 }
 /** * Get case by ID via Go microservice */
 async getCaseById(caseId: string) {
 try {
 const response = await fetch(`${getLegalGatewayUrl()}/cases/${ caseId }`, {
 headers: { Authorization: `Bearer ${process.env.SERVICE_AUTH_TOKEN}` },
 });
 if (!response.ok) {
 if (response.status === 404) {
 throw new MicroserviceError('Case not found', 'CASE_NOT_FOUND', { caseId });
 }
 throw new MicroserviceError('Failed to fetch case', 'CASE_SERVICE_UNAVAILABLE', {
 caseId,
 status: response.status,
 });
 }
 return await response.json();
 } catch (error) {
 if (error instanceof MicroserviceError) {
 throw error;
 }
 console.error('[AUTH] Failed to get case by ID: ', error);
 throw new MicroserviceError('Service temporarily unavailable', 'CASE_SERVICE_UNAVAILABLE', {
 caseId,
 originalError: error instanceof Error ? error.message : `Unknown error`,
 });
 }
 }
 /** * Get documents for a case via Go microservice */
 async getCaseDocuments(caseId: string) {
 try {
 const response = await fetch(`${getLegalGatewayUrl()}/cases/${ caseId }/documents`, {
 headers: { Authorization: `Bearer ${process.env.SERVICE_AUTH_TOKEN}` },
 });
 if (!response.ok) {
 return [];
 }
 return await response.json();
 } catch (error) {
 console.error('Failed to get case documents: ', error);
 return [];
 }
 }
 /** * Get total number of cases */
 async getTotalCases(): Promise<number> {
 try {
 const response = await fetch(`${getLegalGatewayUrl()}/cases/count`, {
 headers: { Authorization: `Bearer ${process.env.SERVICE_AUTH_TOKEN}` },
 });
 if (!response.ok) {
 return 0;
 }
 const data = await response.json();
 return data.count || 0;
 } catch (error) {
 console.error('Failed to get total cases: ', error);
 return 0;
 }
 }
 /** * Get total number of documents */
 async getTotalDocuments(): Promise<number> {
 try {
 const response = await fetch(`${getLegalGatewayUrl()}/documents/count`, {
 headers: { Authorization: `Bearer ${process.env.SERVICE_AUTH_TOKEN}` },
 });
 if (!response.ok) {
 return 0;
 }
 const data = await response.json();
 return data.count || 0;
 } catch (error) {
 console.error('Failed to get total documents: ', error);
 return 0;
 }
 }
 /** * Get sample cases for demo page */
 async getSampleCases(limit: number = 5) {
 try {
 const response = await fetch(`${getLegalGatewayUrl()}/cases?limit=${ limit }`, {
 headers: { Authorization: `Bearer ${process.env.SERVICE_AUTH_TOKEN}` },
 });
 if (!response.ok) {
 return [];
 }
 return await response.json();
 } catch (error) {
 console.error('Failed to get sample cases: ', error);
 return [];
 }
 }
 /** * Health check for auth service */
 async health() {
 try {
 await db.query.users.findFirst(); // Used schema.users
 return { status: 'healthy', timestamp: new Date() };
 } catch (error) {
 console.error('Auth service health check failed: ', error);
 return { status: 'unhealthy', error: String(error) };
 }
 }
}

export const authService = new AuthService();

/**
 * Helper function to get user from request event with session validation
 */
export async function getUser(
 event: RequestEvent
): Promise<{ user: User | null; session, Session | null }> {
 try {
 const sessionId = event.cookies.get(auth.sessionCookieName);
 if (!sessionId) {
 return { user: null, session: null };
 }
 const { user: session } = await auth.validateSession(sessionId);
 if (session && session.fresh) {
 const sessionCookie = auth.createSessionCookie(session.id);
 event.cookies.set(sessionCookie.name, sessionCookie.value, {
 ...sessionCookie.attributes,
 path: '/',
 });
 }
 if (!session) {
 const sessionCookie = auth.createBlankSessionCookie();
 event.cookies.set(sessionCookie.name, sessionCookie.value, {
 ...sessionCookie.attributes,
 path: '/',
 });
 return { user: null, session: null };
 }
 return { user: session };
 } catch (error) {
 console.error('[AUTH] User retrieval failed: ', error);
 throw new SessionError('Failed to retrieve user session', 'SESSION_ERROR', {
 originalError: error instanceof Error ? error.message : `Unknown error`,
 });
 }
}

/**
 * Require authenticated user middleware
 */
export async function requireAuth(event: RequestEvent): Promise<{ user: User; session, Session }> {
 const { user: session } = await getUser(event);
 if (!user || !session) {
 throw new SessionError('Authentication required', 'AUTH_REQUIRED');
 }
 return { user: session };
}




