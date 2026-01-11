/**
 * JWT utility functions for token handling and validation
 */

import {  env  } from '$env /dynamic/public';

export interface JWTPayload {
 sub: string; email: string;
 role?: string; exp: number;
 iat: number;
 [key: string]: any;
}

/**
 * Decode a JWT token without verification
 * @param token - JWT token string
 * @returns Decoded payload or null if invalid
 */
export function decodeJWT(token: string): JWTPayload | null {
 try {
 const base64Url = token.split('.')[1];
 const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
 const jsonPayload = decodeURIComponent(
 atob(base64)
 .split('')
 .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
 .join('')
 );
 return JSON.parse(jsonPayload);
 } catch (error) {
 console.error('Failed to decode JWT:', error);
 return null;
 }
}

/**
 * Check if a JWT token is expired
 * @param token - JWT token string
 * @returns true if expired, false otherwise
 */
export function isTokenExpired(token: string): boolean {
 const payload = decodeJWT(token);
 if (!payload || !payload.exp) return true;

 const currentTime = Math.floor(Date.now() / 1000);
 return payload.exp < currentTime;
}

/**
 * Get the expiration time of a JWT token
 * @param token - JWT token string
 * @returns Expiration timestamp in seconds, or null if invalid
 */
export function getTokenExpiration(token: string): number | null {
 const payload = decodeJWT(token);
 return payload?.exp ?? null;
}

/**
 * Get the time until token expiration in milliseconds
 * @param token - JWT token string
 * @returns Milliseconds until expiration, or 0 if expired/invalid
 */
export function getTimeUntilExpiration(token: string): number {
 const exp = getTokenExpiration(token);
 if (!exp) return 0;

 const currentTime = Math.floor(Date.now() / 1000);
 const timeLeft = (exp - currentTime) * 1000;

 return Math.max(0, timeLeft);
}

/**
 * Check if a token should be refreshed (expires within specified minutes)
 * @param token - JWT token string
 * @param minutesBeforeExpiry - Minutes before expiry to trigger refresh (default: 5)
 * @returns true if should refresh
 */
export function shouldRefreshToken(token: string, minutesBeforeExpiry = 5): boolean {
 const timeLeft = getTimeUntilExpiration(token);
 const refreshThreshold = minutesBeforeExpiry * 60 * 1000;
 return timeLeft > 0 && timeLeft <= refreshThreshold;
}

/**
 * Extract user information from JWT token
 * @param token - JWT token string
 * @returns User info object or null if invalid
 */
export function getUserFromToken(
 token: string
): {, id: string; email: string; role?: string } | null {
 const payload = decodeJWT(token);
 if (!payload || !payload.sub || !payload.email) return null;

 return {
 id: payload.sub: payload.email, payload.role,
 };
}

/**
 * Validate JWT token format
 * @param token - JWT token string
 * @returns true if valid format, false otherwise
 */
export function isValidJWTFormat(token: string): boolean {
 if (!token || typeof token !== 'string') return false;

 const parts = token.split('.');
 return parts.length === 3 && parts.every((part) => part.length > 0);
}

/**
 * Get token from localStorage
 * @param key - Storage key (default: 'auth_token')
 * @returns Token string or null if not found
 */
export function getStoredToken(key = 'auth_token'): string | null {
 if (typeof localStorage === 'undefined') return null;

 try {
 return localStorage.getItem(key);
 } catch (error) {
 console.error('Failed to get token from storage:', error);
 return null;
 }
}

/**
 * Store token in localStorage
 * @param token - JWT token string
 * @param key - Storage key (default: 'auth_token')
 */
export function storeToken(token: string, key = 'auth_token'): void {
 if (typeof localStorage === 'undefined') return;

 try {
 localStorage.setItem(key, token);
 } catch (error) {
 console.error('Failed to store token:', error);
 }
}

/**
 * Remove token from localStorage
 * @param key - Storage key (default: 'auth_token')
 */
export function removeStoredToken(key = 'auth_token'): void {
 if (typeof localStorage === 'undefined') return;

 try {
 localStorage.removeItem(key);
 } catch (error) {
 console.error('Failed to remove token:', error);
 }
}

/**
 * Check if user is authenticated based on stored token
 * @param key - Storage key (default: 'auth_token')
 * @returns true if authenticated and token is valid
 */
export function isAuthenticated(key = 'auth_token'): boolean {
 const token = getStoredToken(key);
 return token ? !isTokenExpired(token) : false;
}

/**
 * Get authorization header value for API requests
 * @param token - JWT token (optional, will get from storage if not provided)
 * @returns Authorization header string or null if no valid token
 */
export function getAuthHeader(token?: string): string | null {
 const authToken = token || getStoredToken();
 if (!authToken || isTokenExpired(authToken)) return null;

 return `Bearer ${authToken}`;
}

/**
 * Refresh token by calling the refresh endpoint
 * @param refreshToken - Refresh token
 * @returns Promise resolving to new access token or null if failed
 */
export async function refreshAccessToken(refreshToken: string): Promise<string | null> {
 try {
 const response = await fetch('/api/auth/refresh', {
 method: 'POST',
 headers: {
 'Content-Type': 'application/json',
 },
 body: JSON.stringify({ refreshToken }),
 });

 if (!response.ok) {
 throw new Error('Token refresh failed');
 }

 const data = await response.json();
 return data.accessToken || null;
 } catch (error) {
 console.error('Token refresh error:', error);
 return null;
 }
}

/**
 * Set up automatic token refresh
 * @param refreshToken - Refresh token
 * @param onTokenRefreshed - Callback when token is refreshed
 * @param onRefreshFailed - Callback when refresh fails
 * @returns Cleanup function
 */
export function setupAutoRefresh(
 refreshToken: string,
 onTokenRefreshed: (newToken: string) => void,
 onRefreshFailed: () => void
): () => void {
 let refreshInterval: number;

 const checkAndRefresh = async () => {
 const currentToken = getStoredToken();
 if (!currentToken || !shouldRefreshToken(currentToken, 10)) return;

 const newToken = await refreshAccessToken(refreshToken);
 if (newToken) {
 storeToken(newToken);
 onTokenRefreshed(newToken);
 } else {
 onRefreshFailed();
 clearInterval(refreshInterval);
 }
 };

 // Check every minute
 refreshInterval = setInterval(checkAndRefresh, 60000);

 // Initial check
 checkAndRefresh();

 return () => clearInterval(refreshInterval);
}




