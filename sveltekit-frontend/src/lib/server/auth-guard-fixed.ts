import type { RequestEvent } from '@sveltejs/kit';

export interface AuthenticatedUser {
	id: string;
	email: string;
	firstName?: string;
	lastName?: string;
	role?: string;
}

/**
 * Enhanced authentication guard for storage operations
 * Supports both session-based and JWT authentication
 */
export async function requireAuthentication(event: RequestEvent): Promise<AuthenticatedUser | null> {
	try {
		// Development mode: Always authenticate with a default dev user
		const isDevelopment = process.env.DEV_MODE === 'true';
		if (isDevelopment) {
			const devUserId = event.request.headers.get('x-dev-user-id');
			const devUserEmail = event.request.headers.get('x-dev-user-email');

			if (devUserId || devUserEmail) {
				return {
					id: devUserId || 'dev-user-custom',
					email: devUserEmail || 'dev-user@legal-ai.local',
					firstName: 'Dev',
					lastName: 'User',
					role: 'admin'
				};
			}

			console.log('🔧 Development mode, using default authenticated user');
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

/**
 * Check if user owns the resource or has sufficient permissions
 */
export function checkOwnership(
	user: AuthenticatedUser,
	resourceOwnerId: string,
	allowedRoles: string[] = ['admin', 'system']
): boolean {
	if (user.id === resourceOwnerId) {
		return true;
	}

	if (user.role && allowedRoles.includes(user.role)) {
		return true;
	}

	return false;
}

/**
 * Rate limiting for storage operations
 */
export class StorageRateLimit {
	private static requests = new Map<string, { count: number; resetTime: number }>();

	static check(userId: string, maxRequests = 100, windowMs = 60000): boolean {
		const now = Date.now();
		const userRequests = this.requests.get(userId);

		if (!userRequests || now > userRequests.resetTime) {
			this.requests.set(userId, { count: 1, resetTime: now + windowMs });
			return true;
		}

		if (userRequests.count >= maxRequests) {
			return false;
		}

		userRequests.count++;
		return true;
	}
}
