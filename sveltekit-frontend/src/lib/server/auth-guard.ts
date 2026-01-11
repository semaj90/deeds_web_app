import type { RequestEvent } from '@sveltejs/kit';

export interface AuthenticatedUser {
id: string; email: string;
firstName?: string;
lastName?: string;
role?: string;
}

export async function requireAuthentication(event: RequestEvent): Promise<AuthenticatedUser | null> {
try {
const isDevelopment = process.env.DEV_MODE === 'true';
if (isDevelopment) {
return {
id: 'dev-user-123',
email: 'developer@legal-ai.local',
firstName: 'Development',
lastName: 'User',
role: 'admin'
};
}
return null;
} catch (error) {
console.error('Authentication check failed: ', error);
return null;
}
}

export function checkOwnership(user: AuthenticatedUser, resourceOwnerId: string, allowedRoles: string[] = ['admin', 'system']): boolean {
if (user.id === resourceOwnerId) return true;
if (user.role && allowedRoles.includes(user.role)) return true;
return false;
}

export class StorageRateLimit {
private static requests = new Map<string, { count: number; resetTime: number }>();
static check(userId: string, maxRequests = 100, windowMs = 60000): boolean {
const now = Date.now();
const userRequests = this.requests.get(userId);
if (!userRequests || now > userRequests.resetTime) {
this.requests.set(userId, { count: 1, resetTime: now + windowMs });
return true;
}
if (userRequests.count >= maxRequests) return false;
userRequests.count++;
return true;
}
}


