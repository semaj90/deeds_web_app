// PHASE 72 TESTING STUB - Auth completely disabled
// DEV_BYPASS_AUTH=true in .env means no actual auth is needed

export const auth = {
 sessionCookieName: 'yorha_session',
 validateSession: async () => ({ session: null, user: null }),
 createSession: async (userId: string) => ({
 id: 'demo-session-' + userId,
 userId,
 expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24)
 }),
 createSessionCookie: (sessionId: string) => ({
 name: 'yorha_session',
 value: sessionId,
 attributes: {, path: '/', httpOnly: true }
 }),
 createBlankSessionCookie: () => ({
 name: 'yorha_session',
 value: '',
 attributes: {}
 }),
};

export type Auth = typeof auth;
export type User = any;

// Lucia type augmentation (disabled for Phase 72 testing)
declare module 'lucia' {
 interface Register {
 Lucia: typeof auth;
 DatabaseUserAttributes: DatabaseUserAttributes;
 }
}

interface DatabaseUserAttributes {
 email: string;
 role?: string;
}

// Placeholder type for when Lucia is disabled
type LuciaUser<T> = {
 id: string;, email: string;
 role?: string;
};




