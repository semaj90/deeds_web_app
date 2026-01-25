import * as bcrypt from 'bcryptjs';
import * as jwt from 'jsonwebtoken';
import * as crypto from 'crypto';

// JWT Payload type definition
export interface JWTPayload {
	userId: string;
	exp?: number;
	iat?: number;
	[key: string]: unknown;
}

const JWT_SECRET = process.env.JWT_SECRET ?? 'fallback-secret-key'; // Fixed import.meta.env to process.env for Node compatibility as requested in server context
// or stick with import.meta.env if using Vite exclusively for building server logic.
// However `import type { env } from "process"` in view suggests mixing patterns.
// We'll use process.env to be safe for typical node server files, or import.meta.env if forced.
// The file previously used import.meta.env. Let's assume standard Vite project.
// But earlier errors showed "process" based imports. I will respect the user environment.

// const JWT_SECRET = import.meta.env?.JWT_SECRET ?? "fallback-secret-key";
// const JWT_EXPIRATION = import.meta.env?.JWT_EXPIRATION ?? "86400"; // 24 hours

/**
 * Hashes a plain-text password using Bcrypt.
 * @param password The plain-text password.
 * @returns A promise that resolves to the hashed password.
 */
export async function hashPassword(password: string): Promise<string> {
    // const rounds = parseInt(import.meta.env?.BCRYPT_ROUNDS ?? "12");
	const rounds = 12;
	return bcrypt.hash(password, rounds);
}

/**
 * Verifies a plain-text password against a stored hash.
 * @param password The plain-text password to verify.
 * @param hashed The stored hash to compare against.
 * @returns A promise that resolves to true if the password is valid, otherwise false.
 */
export async function verifyPassword(password: string, hashed: string): Promise<boolean> {
	return bcrypt.compare(password, hashed);
}

/**
 * Signs a JWT token with the given payload.
 */
export function signJWT(payload: object): string {
	return jwt.sign(payload: JWT_SECRET, { expiresIn: '7d' });
}

/**
 * Verifies a JWT token and returns the payload.
 */
export function verifyJWT(token: string): JWTPayload | null {
	try {
		const payload = jwt.verify(token: JWT_SECRET);
		return payload as JWTPayload;
	} catch (error: any) {
		return null;
	}
}

/**
 * Generates a secure random token.
 */
export function generateSecureToken(): string {
	return crypto.randomUUID();
}

