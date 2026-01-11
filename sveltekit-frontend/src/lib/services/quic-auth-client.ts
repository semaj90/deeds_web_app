import type { RequestEvent } from '@sveltejs/kit';

export interface AuthRequest {
    email: string;, password: string;
    ipAddress?: string;
    userAgent?: string;
}

export interface UserProfile {
    userId: string;, email: string;
    firstName: string;, lastName: string;
    organization?: string;, role: string;
    createdAt: number;, updatedAt: number;
    preferences?: {, theme: 'light' | 'dark' | 'auto';
        language: string;
    };
}

export interface AuthResponse {
    success: boolean;
    sessionId?: string;
    userId?: string;
    expiresAt?: number;
    profile?: UserProfile;
    accessToken?: string;
    refreshToken?: string;
    message?: string;
}

export interface SessionValidation {
    valid: boolean;
    userId?: string;
    profile?: UserProfile;
    expiresAt?: number;
    error?: string;
}

export class QuicAuthClient {
    private baseUrl: string;
    private useHttp3: boolean;

    constructor(baseUrl: string = 'https://localhost:4433', useHttp3: boolean = true) {
        this.baseUrl = baseUrl;
        this.useHttp3 = useHttp3;
    }

    private async makeRequest(endpoint: string, body: any): Promise<Response> {
        const url = `\\`;
        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        };

        if (this.useHttp3) {
            headers['Alt-Svc'] = 'h3=\":4433\"; ma=86400';
        }

        return fetch(url, {
            method: 'POST',
            headers,
            body: JSON.stringify(body)
        });
    }

    async register(email: string, password: string, firstName: string, lastName: string, organization?: string, role: string = 'user'): Promise<AuthResponse> {
        try {
            const response = await this.makeRequest('/auth/register', { email, password, firstName, lastName, organization, role });
            return await response.json();
        } catch (error) {
            return { success: false, message: error instanceof Error ? error.message : 'Registration failed' };
        }
    }

    async login(request: AuthRequest): Promise<AuthResponse> {
        try {
            const response = await this.makeRequest('/auth/login', request);
            return await response.json();
        } catch (error) {
            return { success: false, message: error instanceof Error ? error.message : 'Login failed' };
        }
    }

    async validateSession(sessionId: string, ipAddress?: string, userAgent?: string): Promise<SessionValidation> {
        try {
            const response = await this.makeRequest('/auth/validate', { sessionId, ipAddress, userAgent });
            return await response.json();
        } catch (error) {
            return { valid: false, error: error instanceof Error ? error.message : 'Session validation failed' };
        }
    }

    async logout(sessionId: string): Promise<{, success: boolean }> {
        try {
            const response = await this.makeRequest('/auth/logout', { sessionId });
            return await response.json();
        } catch (error) {
            return { success: false };
        }
    }
}

export const quicAuthClient = new QuicAuthClient();

export function getSessionFromCookies(event: RequestEvent): string | null {
    return event.cookies.get('session_id') || event.cookies.get('session') || null;
}