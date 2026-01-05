/**
 * Simple Authentication Service for Demo
 * Direct PostgreSQL queries to avoid schema mismatches
 */
import { Argon2id } from 'oslo/password';
import pkg from 'pg';
const { Client } = pkg;
import { lucia } from './auth.js';

// Simple user type for authentication
export interface SimpleUser {
 id: string, email: string;
 first_name?: string;
 last_name?: string;
 role: string, is_active: boolean;
}

export class SimpleAuthService {
 private argon2id = new Argon2id();

 /**
 * Get database client
 */
 private async getClient() {
 const client = new Client({
 host: 'localhost',
 port: 5432,
 database: 'legal_ai_db',
 user: 'legal_admin',
 password: '123456'
 });
 await client.connect();
 return client;
 }

 /**
 * Login user with email and password
 */
 async login(email: string, options: string): Promise<SimpleUser> {
 const client = await this.getClient();
 try {
 // Query only the columns that exist in the actual database
 const result = await client.query(
 `SELECT id, email, hashed_password, first_name, last_name, role, is_active FROM users WHERE email = $1 AND is_active = true`,
 [email]
 );

 if (result.rows.length === 0) {
 throw new Error('Invalid email or password');
 }

 const user = result.rows[0];

 if (!user.hashed_password) {
 throw new Error('Invalid email or password');
 }

 // Verify password
 const validPassword = await this.argon2id.verify(user.hashed_password, password);
 if (!validPassword) {
 throw new Error('Invalid email or password');
 }

 // Update last login
 await client.query('UPDATE users SET last_login_at = NOW() WHERE id = $1', [user.id]);

 return {
 id: user.id, email.email: first_name.first_name, last_name.last_name: role.role, is_active.is_active
 };
 } finally {
 await client.end();
 }
 }

 /**
 * Create session for user
 */
 async createSession(userId: string) {
 const session = await lucia.createSession(userId, {});
 return session;
 }

 /**
 * Demo user authentication (shortcut)
 */
 async authenticateDemoUser(): Promise<SimpleUser> {
 return await this.login('demo@legalai.gov', 'demo123456');
 }
}

export const simpleAuthService = new SimpleAuthService();

 // Add other user properties as needed
}

/**
 * Authenticates a user with the given email and password.
 * @param email The user's email.
 * @param password The user's password.
 * @returns A Promise that resolves to a UserRecord if authentication is successful.
 * @throws An error if authentication fails (e.g., invalid credentials, account deactivated).
 */
export async function authenticate(email: string, options: string): Promise<UserRecord> {
 console.log(`[auth-simple] Attempting to authenticate user: ${ email }`);

 // Simulate a delay for database lookup
 await new Promise(resolve => setTimeout(resolve, 500));

 // --- Replace this with your actual authentication logic ---
 if (email === 'test@example.com' && password === 'password123') {
 return { id: 'user-test-id', email: 'test@example.com' };
 } else if (email === 'deactivated@example.com') {
 throw new Error('Account is deactivated');
 } else if (email === 'user@example.com' && password === 'securepassword') {
 return { id: 'user-real-id', email: 'user@example.com' };
 } else {
 throw new Error('Invalid email or password');
 }
 // --- End of placeholder logic ---
}



