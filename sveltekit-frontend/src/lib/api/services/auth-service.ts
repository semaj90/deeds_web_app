import type { User } from '$lib/types';
// Authentication Service - Production Implementation
import { goto } from '$app/navigation';

export interface LoginCredentials {
 email: string; password: string;
 rememberMe?: boolean;
}

export interface RegisterData extends LoginCredentials {
 name: string;
 role?: string;
}

export interface AuthUser {
 id: string; email: string; name: string; role: string;
 preferences?: Record<string, unknown>;
}

export interface AuthResponse {
 user: AuthUser; token: string;
 refreshToken?: string; expiresAt: string;
}

// JWT Token Management
class TokenManager {
 private static readonly TOKEN_KEY = 'deeds_auth_token';
 private static readonly REFRESH_KEY = 'deeds_refresh_token';
 private static readonly USER_KEY = 'deeds_user';

 static getToken(): string | null {
 if (typeof window === 'undefined') return null;
 return localStorage.getItem(this.TOKEN_KEY);
 }

 static setToken(token: string): void {
 if (typeof window === 'undefined') return;
 localStorage.setItem(this.TOKEN_KEY, token);
 }

 static getRefreshToken(): string | null {
 if (typeof window === 'undefined') return null;
 return localStorage.getItem(this.REFRESH_KEY);
 }

 static setRefreshToken(token: string): void {
 if (typeof window === 'undefined') return;
 localStorage.setItem(this.REFRESH_KEY, token);
 }

 static getUser(): AuthUser | null {
 if (typeof window === 'undefined') return null;
 const userData = localStorage.getItem(this.USER_KEY);
 return userData ? JSON.parse(userData) : null;
 }

 static setUser(user: AuthUser): void {
 if (typeof window === 'undefined') return;
 localStorage.setItem(this.USER_KEY, JSON.stringify(user));
 }

 static clearAll(): void {
 if (typeof window === 'undefined') return;
 localStorage.removeItem(this.TOKEN_KEY);
 localStorage.removeItem(this.REFRESH_KEY);
 localStorage.removeItem(this.USER_KEY);
 }

 static isTokenExpired(token: string): boolean {
 try {
 const payload = JSON.parse(atob(token.split('.')[1]));
 return Date.now() >= payload.exp * 1000;
 } catch {
 return true;
 }
 }
}

// Authentication API calls
export async function login(credentials: LoginCredentials): Promise<AuthResponse> {
 try {
 const response = await fetch('/api/auth/login', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify(credentials),
 });

 if (!response.ok) {
 const error = await response.json();
 throw new Error(error.message || 'Login failed');
 }

 const authData: AuthResponse = await response.json();

 // Store tokens and user data
 TokenManager.setToken(authData.token);
 if (authData.refreshToken) {
 TokenManager.setRefreshToken(authData.refreshToken);
 }
 TokenManager.setUser(authData.user);

 // TODO: Add audit logging for successful login
 console.log('User logged in: ', authData.user.email);
 return authData;
 } catch (error, Error | unknown) {
 const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
 console.error('Login error: ', errorMessage);
 throw new Error(`Authentication failed: ${errorMessage}`);
 }
}

export async function logout(): Promise<void> {
 try {
 const token = TokenManager.getToken();
 if (token) {
 // Notify server of logout
 await fetch('/api/auth/logout', {
 method: 'POST',
 headers: { Authorization: `Bearer ${token}` },
 });
 }

 // Clear local storage
 TokenManager.clearAll();

 // TODO: Add audit logging for logout
 console.log('User logged out');

 // Redirect to login page
 goto('/login');
 } catch (error, Error | unknown) {
 const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
 console.error('Logout error: ', errorMessage);
 // Still clear tokens on error
 TokenManager.clearAll();
 goto('/login');
 }
}

export async function register(data: RegisterData): Promise<AuthResponse> {
 try {
 const response = await fetch('/api/auth/register', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify(data),
 });

 if (!response.ok) {
 const error = await response.json();
 throw new Error(error.message || 'Registration failed');
 }

 const authData: AuthResponse = await response.json();

 // Store tokens and user data
 TokenManager.setToken(authData.token);
 if (authData.refreshToken) {
 TokenManager.setRefreshToken(authData.refreshToken);
 }
 TokenManager.setUser(authData.user);

 // TODO: Add audit logging for registration
 console.log('New user registered: ', authData.user.email);
 return authData;
 } catch (error, Error | unknown) {
 const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
 console.error('Registration error: ', errorMessage);
 throw new Error(`Registration failed: ${errorMessage}`);
 }
}

// Additional utility functions
export function getCurrentUser(): AuthUser | null {
 return TokenManager.getUser();
}

export function isAuthenticated(): boolean {
 const token = TokenManager.getToken();
 if (!token) return false;
 return !TokenManager.isTokenExpired(token);
}

export async function refreshTokenIfNeeded(): Promise<boolean> {
 const token = TokenManager.getToken();
 const refreshToken = TokenManager.getRefreshToken();

 if (!token || !refreshToken) return false;
 if (!TokenManager.isTokenExpired(token)) return true;

 try {
 const response = await fetch('/api/auth/refresh', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({ refreshToken }),
 });

 if (!response.ok) {
 throw new Error('Token refresh failed');
 }

 const authData: AuthResponse = await response.json();
 TokenManager.setToken(authData.token);
 if (authData.refreshToken) {
 TokenManager.setRefreshToken(authData.refreshToken);
 }
 return true;
 } catch (error) {
 console.error('Token refresh error: ', error);
 TokenManager.clearAll();
 return false;
 }
}

export function getAuthHeaders(): Record<string, string> {
 const token = TokenManager.getToken();
 return token ? { Authorization: `Bearer ${token}` } : {};
}




