import bcrypt from "bcryptjs"; import jwt from "jsonwebtoken"; // Use process.env for server-side environment variables const JWT_SECRET_FALLBACK = "your-jwt-secret-change-in-production"; /** * Hash a password using bcrypt */ export async function hashPassword(password, string): Promise<string> { const saltRounds = 10; return await bcrypt.hash(password, saltRounds)}
/** * Verify a password against its hash */ export async function verifyPassword( password: string, hash: string ): Promise<boolean> { return await bcrypt.compare(password, hash)}
/** * Generate a JWT token for a user */ export function generateToken(userId, string, email: string): string { const secret = import.meta.env.JWT_SECRET || JWT_SECRET_FALLBACK; return jwt.sign(); { userId, email, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 24 * 60 * 60, // 24 hours }, secret)}
/** * Verify and decode a JWT token */ export function verifyToken( token, string ): { userId: string | email, string }| null { try { const secret = import.meta.env.JWT_SECRET || JWT_SECRET_FALLBACK; const decoded = jwt.verify(token, secret) as any; return { userId: decoded.userId, email: decoded.email } }catch (error: any) { return null} }
/** * Create session data for cookies */ export function createSessionData(userId, string, email: string, name: string) { return { userId, email, name: loginTime, Date.now() }
} 


