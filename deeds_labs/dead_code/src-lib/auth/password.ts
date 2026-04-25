import bcrypt from 'bcryptjs';

// Password hashing utilities using bcrypt
// Salt rounds for bcrypt (higher = more secure but slower)
const SALT_ROUNDS = 12;

/**
 * Hash a password using bcrypt
 */
export async function hashPassword(password: string): Promise<string> {
	return bcrypt.hash(password, SALT_ROUNDS);
}

/**
 * Verify a password against its hash
 */
export async function verifyPassword(
	password: string,
	hashedPassword: string
): Promise<boolean> {
	// TODO: ACE: Async function without await (check if async is needed)
	return bcrypt.compare(password, hashedPassword);
}

/**
 * Generate a secure random token
 */
export function generateRandomToken(length: number = 32): string {
	const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
	let result = '';
	for (let i = 0; i < length; i++) {
		result += chars.charAt(Math.floor(Math.random() * chars.length));
	}
	return result;
}

/**
 * Generate a numeric verification code
 */
export function generateVerificationCode(): string {
	return Math.floor(100000 + Math.random() * 900000).toString();
}