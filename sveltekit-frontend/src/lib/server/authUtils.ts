import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import * as jwt from 'jsonwebtoken';
import { ENV } from './env.server.js';

// JWT Payload type definition
export interface JWTPayload {
  userId: string;
  exp?: number;
  iat?: number;
  [key: string]: unknown;
}

const JWT_SECRET = ENV.JWT_SECRET;

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
	return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
}

/**
 * Verifies a JWT token and returns the payload.
 */
export function verifyJWT(token: string): JWTPayload | null {
	try {
		const payload = jwt.verify(token, JWT_SECRET);
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

