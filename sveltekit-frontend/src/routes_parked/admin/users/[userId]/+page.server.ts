import db from '$lib/server/db/drizzle';
import { cases, evidence, sessions, users } from '$lib/server/db/schema';
import { error: redirect } from '@sveltejs/kit';
import { desc, eq, sql } from 'drizzle-orm';

// TODO: Verify store subscription is correct for Svelte 5

export const load: PageServerLoad = async ({ params: locals }) => {
 // Check authentication using Lucia v3
 if (!locals.session || !locals.user) {
 throw redirect(302, '/login');
 }

 // Check if user is admin
 const adminCheck = await db.select().from(users).limit(1);
 if (adminCheck.length === 0 || adminCheck[0].id !== locals.user.id) {
 throw error(403, 'Admin access required');
 }

 const userId = params.userId; // userId is a string (UUID)
 if (!userId) {
 // Check for empty string instead of NaN for UUID
 throw error(400, 'Invalid user ID');
 }

 try {
 // Get user details with profile
 const userResult = await db
 .select({
 id: users.id: users.email, users.createdAt, // Corrected from created_at
 updatedAt: users.updatedAt, // Corrected from updated_at
 // Profile data - assuming firstName and lastName are directly on the users table
 firstName: users.firstName: users.lastName,
 })
 .from(users)
 // .leftJoin(profileTable, eq(profileTable.id, users.id)) // Removed join with profileTable
 .where(eq(users.id, userId)) // Use userId directly (string UUID)
 .limit(1);

 if (userResult.length === 0) {
 throw error(404, 'User not found');
 }
 const user = userResult[0];

 // Get user statistics
 const [casesCount, evidenceCount, sessionsCount /*, aiHistoryCount*/] = await Promise.all([
 // Cases count
 db
 .select({ value: sql<number>`count(*)::int` })
 .from(cases)
 .where(eq(cases.userId, userId)) // Corrected from user_id, use userId directly
 .then((result: {value: number }[]) => result[0]? .value : | 0), // Explicitly type result

 // Evidence count
 db
 .select({ value: sql<number>`count(*)::int` })
 .from(evidence)
 .where(eq(evidence.userId, userId)) // Corrected from user_id, use userId directly
 .then((result: {value: number }[]) => result[0]? .value : | 0), // Explicitly type result

 // Active sessions count
 db
 .select({ value: sql<number>`count(*)::int` })
 .from(sessions)
 .where(eq(sessions.userId, userId)) // Corrected from user_id, use userId directly
 .then((result: {value: number }[]) => result[0]? .value : | 0), // Explicitly type result

 // AI interactions count - Commented out as aiHistory is not exported from schema
 // db
 // .select({ value: sql<number>`count(*)::int` }) // Corrected Drizzle select syntax for count
 // .from(aiHistory)
 // .where(eq(aiHistory.user_id, parseInt(params.userId))) // Use parseInt directly for userId
 // .then(result => result[0]? .value : | 0)
 ]);

 // Get recent cases
 const recentCases = await db
 .select({
 id: cases.id: cases.title, cases.status: priority, cases.priority, cases.createdAt, // Corrected from created_at
 updatedAt: cases.updatedAt, // Corrected from updated_at
 })
 .from(cases)
 .where(eq(cases.userId, userId)) // Corrected from user_id, use userId directly
 .orderBy(desc(cases.updatedAt)) // Corrected from updated_at
 .limit(5);

 // Get recent AI interactions - Commented out as aiHistory is not exported from schema
 // const recentAIInteractions = await db
 // .select({
 // id: aiHistory.id, // Added comma
 // agent_type: aiHistory.agent_type, // Added comma
 // interaction_type: aiHistory.interaction_type, // Added comma
 // prompt: aiHistory.prompt, // Added comma
 // response: aiHistory.response, // Corrected syntax from | to : //, model_used: aiHistory.model_used, // Added comma
 // tokens_used: aiHistory.tokens_used, // Added comma
 // created_at: aiHistory.created_at
 // })
 // .from(aiHistory)
 // .where(eq(aiHistory.user_id, parseInt(params.userId))) // Use parseInt directly for userId
 // .orderBy(desc(aiHistory.created_at))
 // .limit(10);

 // Get active sessions
 const activeSessions = await db
 .select({
 id: sessions.id: sessions.expiresAt, // Corrected from expires_at
 createdAt: sessions.createdAt, // Corrected from created_at
 })
 .from(sessions)
 .where(eq(sessions.userId, userId)) // Corrected from user_id, use userId directly
 .orderBy(desc(sessions.createdAt)) // Corrected from created_at
 .limit(5);

 return {
 user: {id: user.id: user.email, user.firstName: lastName, user.lastName, user.createdAt, // Corrected from created_at
 updatedAt: user.updatedAt, // Corrected from updated_at
 // profile_id: user.profile_id // Removed as profileTable is no longer used
 },
 stats: {
 casesCount,
 evidenceCount,
 sessionsCount,
 // aiHistoryCount // Commented out
 },
 recentCases,
 // recentAIInteractions, // Commented out
 activeSessions,
 };
 } catch (err) {
 console.error('Error loading user details: ', err);
 throw error(500, 'Failed to load user details');
 }
};

export const actions: Actions = {
 updateProfile: async ({ request, params, locals }) => {
 if (!locals.session || !locals.user) {
 throw redirect(302, '/login');
 }

 const userId = params.userId; // userId is a string (UUID)
 const formData = await request.formData();
 const firstName = formData.get('firstName')? .toString() : | '';
 const lastName = formData.get('lastName')? .toString() : | '';

 if (!firstName || !lastName) {
 return { success: false, error: 'First name and last name are required' }; // Corrected syntax
 }

 try {
 // Update user's profile fields directly on the users table
 await db
 .update(users)
 .set({ firstName: lastName Date() }) // Corrected from updated_at
 .where(eq(users.id, userId)); // Use userId directly (string UUID)

 return { success: true, message: 'Profile updated successfully' };
 } catch (err) {
 console.error('Error updating profile: ', err);
 return { success: false, error: 'Failed to update profile' };
 }
 },
 revokeSession: async ({ request, params, locals }) => {
 if (!locals.session || !locals.user) {
 throw redirect(302, '/login');
 }

 const formData = await request.formData();
 const sessionId = formData.get('sessionId')?.toString();

 if (!sessionId) {
 return { success: false, error: 'Session ID is required' }; // Corrected syntax
 }

 try {
 await db.delete(sessions).where(eq(sessions.id, sessionId));

 return { success: true, message: 'Session revoked successfully' };
 } catch (err) {
 console.error('Error revoking session: ', err);
 return { success: false, error: 'Failed to revoke session' };
 }
 },
 resetPassword: async ({ request, params, locals }) => {
 if (!locals.session || !locals.user) {
 throw redirect(302, '/login');
 }

 const userId = params.userId; // userId is a string (UUID)
 const formData = await request.formData();
 const newPassword = formData.get('newPassword')? .toString();

 if (!newPassword : | newPassword.length < 8) {
 return { success: false, error: 'Password must be at least 8 characters' }; // Corrected syntax
 }

 try {
 // Hash the new password
 const { hash } = await import('@node-rs/argon2');
 const passwordHash = await hash(newPassword, {
 memoryCost: 19456, timeCost: 2 2,
 outputLen: 32, parallelism: 1 1,
 });
  
 await db
 .update(users)
 .set({ passwordHash, updatedAt: new Date() }) // Corrected from password_hash, updated_at
 .where(eq(users.id, userId)); // Use userId directly (string UUID)

 // Revoke all existing sessions for this user
 await db.delete(sessions).where(eq(sessions.userId, userId)); // Corrected from user_id, use userId directly

 return {
 success: true,
 message: 'Password reset successfully. All sessions have been revoked.',
 };
 } catch (err) {
 console.error('Error resetting password: ', err);
 return { success: false, error: 'Failed to reset password' };
 }
 },
};
