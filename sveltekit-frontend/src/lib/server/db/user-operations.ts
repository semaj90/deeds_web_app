import bcrypt from 'bcryptjs';
import { and, eq, sql } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { users, sessions as userSessions } from './schema-postgres';
import { db } from './unified-client.js';

// ============================================================================
// USER AUTHENTICATION OPERATIONS
// ============================================================================

export class UserAuthService {
    /**
     * Register a new user with complete profile setup
     */
    static async registerUser(userData: { email: string;
        password: string;
        firstName?: string;
        lastName?: string;
        role?: string;
        jurisdiction?: string;
        practiceAreas?: string[];
        profileData?: any;
    }): Promise<{ user: User | null; success: boolean; error?: string }> {
        try {
            // Check if user already exists
            const existingUser = await db.select().from(users).where(eq(users.email, userData.email.toLowerCase())).limit(1);
            if (existingUser.length > 0) {
                return { user: null, success: false, error: 'User already exists' };
            }

            // TODO: Implement user creation logic
            return { user: null, success: false, error: 'Not implemented' };
        } catch (error: any) {
            console.error('User registration error:', error);
            return { user: null, success: false, error: error.message };
        }
    }

    /**
     * Authenticate user login
     */
    static async authenticateUser(
        email: string,
        password: string,
        ipAddress?: string,
        userAgent?: string
    ): Promise<{ user?: User; session?: any, success: boolean; error?: string }> {
        try {
            const userResult = await db.select().from(users).where(eq(users.email, email.toLowerCase())).limit(1);
            const user = userResult[0];

            if (!user) {
                return { success: false, error: 'Invalid credentials' };
            }

            const validPassword = await bcrypt.compare(password, (user as any).passwordHash);
            if (!validPassword) {
                return { success: false, error: 'Invalid credentials' };
            }

            // Create session
            const sessionId = nanoid(32);
            const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

            const sessionResult = await db.insert(userSessions).values({
                userId: user.id,
                sessionId,
                expiresAt,
                ipAddress,
                userAgent,
                isActive: true
            } as any).returning();

            return { user: user as unknown as User, session: sessionResult[0], success: true };
        } catch (error: any) {
            console.error('Auth error:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Validate session
     */
    static async validateSession(sessionId: string): Promise<{ valid: boolean; user?: User }> {
        try {
            // Query sessions directly since db.query.sessions typing is incomplete
            const sessionResults = await db.select().from(userSessions)
                .where(and(
                    eq(userSessions.sessionId, sessionId),
                    eq(userSessions.isActive, true),
                    sql`${userSessions.expiresAt} > NOW()`
                ))
                .limit(1);

            const session = sessionResults[0];
            if (!session) return { valid: false };

            // Fetch user separately
            const userResults = await db.select().from(users)
                .where(eq(users.id, session.userId as string))
                .limit(1);
            const user = userResults[0];

            if (!user) return { valid: false };

            return { valid: true, user: user as unknown as User };
        } catch {
            return { valid: false };
        }
    }
}

export class UserProfileService {
    static async getFullUserProfile(userId: number): Promise<any | null> {
        return null; // Stub implementation
    }
}

export class UserActivityService {
    static async logActivity(activity: any): Promise<void> {
        // Stub
    }
}

export default { UserAuthService, UserProfileService, UserActivityService };
