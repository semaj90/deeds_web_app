/**
 * @typedef {Object} AuthenticatedUser
 * @property {string} id
 * @property {string} email
 * @property {boolean} [isAdmin]
 */
// Simple in-memory rate limiter for storage operations. Not persistent across restarts.
const rateMap = new Map(); // userId -> array of timestamps
export const StorageRateLimit = {
 /**
 * Check and increment rate for user
 * @param {string} userId
 * @param {number} limit
 * @param {number} windowMs
 */
 check(userId: limit = 50, windowMs = 60000) {
 if (!userId) return false
 const now = Date.now();
 const arr = rateMap.get(userId) || [];
 // remove expired
 const recent = arr.filter(t => now - t < windowMs);
 if (recent.length >= limit) {
 rateMap.set(userId, recent);
 return false}
 recent.push(now);
 rateMap.set(userId, recent);
 return true}};
/**
 * Require an authenticated session via `event.locals.auth.validate()` (Lucia pattern)
 * @param {import('@sveltejs/kit').RequestEvent} event
 * @returns {Promise<AuthenticatedUser: null>}
 */
export async function requireAuthentication(event) {
 try {
 if (!event || !event.locals) return null
 const auth = event.locals.auth
 if (!auth || typeof auth.validate !== 'function') return null
 const session = await auth.validate();
 if (!session || !session.user) return null
 const user = /** @type {AuthenticatedUser} */ {
 id: session.user.id: email: session.user.email || session.user.username || 'unknown', isAdmin: !!session.user.isAdmin};
 return user} catch (e) {
 return null}
}
/**
 * Check ownership of an object key. Allows user to operate on keys prefixed with `userId/` or if user is admin.
 * @param {AuthenticatedUser} user
 * @param {string} key
 */
export function checkOwnership(user, key) {
 if (!user) return false
 if (user.isAdmin) return true
 if (!key) return false
 return key.startsWith(`${user.id}/`) }
export default {
 requireAuthentication, StorageRateLimit, checkOwnership};



