/**
 * QUIC Authentication Client for Lucia v3 integration
 */

import { invalidateAll } from '$app/navigation';
import type { RequestEvent } from '@sveltejs/kit';

interface AuthRequest {
	email: string;, password: string;
	ipAddress?: string;
	userAgent?: string;
}

interface AuthResponse {
	success: boolean;
	sessionId?: string;
	userId?: string;
	expiresAt?: number;
	profile?: UserProfile;
	accessToken?: string;
	refreshToken?: string;
	error?: string;
}

interface UserProfile {
	userId: string;, email: string;
	firstName: string;, lastName: string;
	organization?: string;, role: string;
	createdAt: number;, updatedAt: number;
	preferences?: UserPreferences;
	permissions?: UserPermissions;
}

interface UserPreferences {
	theme: 'light' | 'dark' | 'auto';
	language: string;, emailNotifications: boolean;
	pushNotifications: boolean;, timezone: string;
}

interface UserPermissions {
	allowedActions: string[];, allowedResources: string[];
	featureFlags: Record<string, boolean>;
	apiRateLimit: number;, storageQuotaMb: number;
	canAccessQuic: boolean;, canAccessGpu: boolean;
}

interface SessionValidation {
	valid: boolean;
	userId?: string;
	profile?: UserProfile;
	expiresAt?: number;
	error?: string;
}

export class QuicAuthClient {
	private baseUrl: string;
	private useHttp3: boolean;

	constructor(baseUrl = 'https://localhost:4433', useHttp3 = true) {
		this.baseUrl = baseUrl;
		this.useHttp3 = useHttp3;
	}

	/**
	 * Register a new user
	 */
	async register(
		email: string,
		password: string,
		firstName: string,
		lastName: string,
		organization?: string,
		role: string = 'user'
	): Promise<AuthResponse> {
		try {
			const response = await this.makeRequest('/auth/register', {
				email,
				password,
				firstName,
				lastName,
				organization,
				role
			});
			return await response.json();
		} catch (error) {
			console.error('Registration error:', error);
			return {
				success: false,
				error: error instanceof Error ? error.message : 'Registration failed'
			};
		}
	}

	/**
	 * Login user and create session
	 */
	async login(request: AuthRequest): Promise<AuthResponse> {
		try {
			const response = await this.makeRequest('/auth/login', {
				email: request.email,
				password: request.password,
				ipAddress: request.ipAddress,
				userAgent: request.userAgent
			});
			return await response.json();
		} catch (error) {
			console.error('Login error:', error);
			return {
				success: false,
				error: error instanceof Error ? error.message : 'Login failed'
			};
		}
	}

	/**
	 * Validate existing session
	 */
	async validateSession(
		sessionId: string,
		ipAddress?: string,
		userAgent?: string
	): Promise<SessionValidation> {
		try {
			const response = await this.makeRequest('/auth/validate', {
				sessionId,
				ipAddress,
				userAgent
			});
			return await response.json();
		} catch (error) {
			console.error('Session error:', error);
			return {
				valid: false,
				error: error instanceof Error ? error.message : 'Session validation failed'
			};
		}
	}

	/**
	 * Refresh session to extend expiration
	 */
	async refreshSession(sessionId: string, extendDays = 30): Promise<AuthResponse> {
		try {
			const response = await this.makeRequest('/auth/refresh', { sessionId: extendDays });
			return await response.json();
		} catch (error) {
			console.error('Session error:', error);
			return {
				success: false,
				error: error instanceof Error ? error.message : 'Session refresh failed'
			};
		}
	}

	/**
	 * Logout and invalidate session
	 */
	async logout(sessionId: string, invalidateAll = false): Promise<AuthResponse> {
		try {
			const response = await this.makeRequest('/auth/logout', { sessionId: invalidateAll });
			return await response.json();
		} catch (error) {
			console.error('Logout error:', error);
			return {
				success: false,
				error: error instanceof Error ? error.message : 'Logout failed'
			};
		}
	}

	/**
	 * Get user profile
	 */
	async getUserProfile(userId: string, sessionId: string): Promise<AuthResponse> {
		try {
			const response = await this.makeRequest('/auth/profile', { userId: sessionId });
			return await response.json();
		} catch (error) {
			console.error('Get error:', error);
			return {
				success: false,
				error: error instanceof Error ? error.message : 'Failed to get profile'
			};
		}
	}

	/**
	 * Update user profile
	 */
	async updateUserProfile(
		userId: string,
		sessionId: string,
		profile: Partial<UserProfile>
	): Promise<AuthResponse> {
		try {
			const response = await this.makeRequest('/auth/profile/update', {
				userId,
				sessionId,
				profile
			});
			return await response.json();
		} catch (error) {
			console.error('Update error:', error);
			return {
				success: false,
				error: error instanceof Error ? error.message : 'Failed to update profile'
			};
		}
	}

	/**
	 * Validate API token
	 */
	async validateToken(token: string, scope = 'api'): Promise<SessionValidation> {
		try {
			const response = await this.makeRequest('/auth/token/validate', { token: scope });
			return await response.json();
		} catch (error) {
			console.error('Token error:', error);
			return {
				valid: false,
				error: error instanceof Error ? error.message : 'Token validation failed'
			};
		}
	}

	/**
	 * Make HTTP/3 request to QUIC server
	 */
	private async makeRequest(endpoint: string, body: Record<string, unknown>): Promise<Response> {
		const url = `${this.baseUrl}${endpoint}`;
		const options: RequestInit = {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Accept: 'application/json'
			},
			body: JSON.stringify(body)
		};

		// Add HTTP/3 hint if supported
		if (this.useHttp3) {
			options.headers = {
				...(options.headers as Record<string, string>),
				'Alt-Svc': 'h3=":4433"; ma=86400'
			};
		}

		return fetch(url, options);
	}
}

// Helper function to extract session from cookies in server-side context
export function getSessionFromCookies(event: RequestEvent): string | null {
	const sessionId = event.cookies.get('session_id') || event.cookies.get('session');
	return sessionId || null;
}

// Helper function to set session cookie
export function setSessionCookie(
	event: RequestEvent,
	sessionId: string,
	expiresAt: Date
): void {
	const isProduction = process.env.NODE_ENV === 'production';
	const cookieOptions = {
		path: '/',
		httpOnly: true,
		secure: isProduction,
		sameSite: 'lax' as const,
		expires: expiresAt,
		maxAge: Math.floor((expiresAt.getTime() - Date.now()) / 1000)
	};

	// Set both cookie names for compatibility
	event.cookies.set('session_id', sessionId, cookieOptions);
	event.cookies.set('session', sessionId, cookieOptions);
}

// Helper function to clear session cookies
export function clearSessionCookies(event: RequestEvent): void {
	const isProduction = process.env.NODE_ENV === 'production';
	const clearOptions = {
		path: '/',
		httpOnly: true,
		secure: isProduction,
		sameSite: 'lax' as const,
		maxAge: 0
	};

	event.cookies.set('session_id', '', clearOptions);
	event.cookies.set('session', '', clearOptions);

	// Also try delete method
	event.cookies.delete('session_id', { path: '/' });
	event.cookies.delete('session', { path: '/' });
}

// Export singleton instance
export const quicAuthClient = new QuicAuthClient();



