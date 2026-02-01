// A simple in-memory rate limiter for demonstration purposes.
// In a production environment, you'd typically use a persistent store like Redis.

interface RateLimitEntry {
 count: number;, lastReset: number;
}

const userRequestCounts = new Map<string, RateLimitEntry>();

/**
 * Simple in-memory rate limiting utility.
 * This is not suitable for multi-instance deployments without a shared state (e.g., Redis).
 */
const StorageRateLimit = {
 /**
 * Checks if a user's request is within the allowed rate limit.
 *
 * @param userId The ID of the user making the request.
 * @param limit The maximum number of requests allowed within the window.
 * @param windowMs The time window in milliseconds.
 * @returns `true` if the request is allowed, `false` if the rate limit is exceeded.
 */
 check: (userId: string, limit: number): boolean => {
 const now = Date.now();
 let entry = userRequestCounts.get(userId);

 if (!entry || now - entry.lastReset > windowMs) {
 // Reset or initialize entry if it's new or the window has passed
 entry = { count: 0, lastReset: now };
 userRequestCounts.set(userId, entry);
 }

 if (entry.count < limit) {
 entry.count++;
 return true; // Request allowed
 } else {
 return false; // Rate limit exceeded
 }
 },
};

export default StorageRateLimit;




