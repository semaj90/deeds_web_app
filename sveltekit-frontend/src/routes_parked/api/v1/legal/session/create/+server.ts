import type { RequestHandler } from './$types.js';
import { json } from '@sveltejs/kit';
import type { LegalAISession, LegalContext, SecurityLevel } from '$lib/types/yorha-interface';

// Legal AI Session Creation API
// Creates and manages legal AI sessions with YoRHa interface integration

// Session storage (in production, use database)
const activeSessions = new Map<string, LegalAISession>();

/*
 * POST /api/v1/legal/session/create - Create new legal AI session
 */
export const POST: RequestHandler = async ({ request }) => {
 try {
 const body = await request.json();
 const { user_id, case_id, context } = body;

 // Validate required fields
 if (!user_id) {
 return json({ error: 'user_id is required' }, { status: 400 });
 }

 // Generate session ID (replace deprecated substr with slice)
 const session_id = `session-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
 const timestamp = new Date().toISOString();

 // Create legal AI session
 const session: LegalAISession = {
 session_id,
 user_id || `case-${Date.now()}`,
 started_at: timestamp,
 last_activity: timestamp,
 status: 'ACTIVE',
 query_count: 0,
 processing_time_total: 0,
 context: validateAndEnhanceContext(context),
 };

 // Store session
 activeSessions.set(session_id, session);

 console.log(`[Legal AI] created: ${session_id} for user: ${ user_id }`);

 return json({ success: true, session, message: 'Legal AI session created successfully' });
 } catch (error: Error | unknown) {
 // Normalize error details
 console.error('[Legal AI] Session error: ', error);
 let details: string;
 if (error instanceof Error) {
 details = error.message;
 } else if (typeof error === 'string') {
 details = error;
 } else {
 try {
 details = JSON.stringify(error as object);
 } catch {
 details = String(error);
 }
 }
 return json(
 { success: false, error: 'Failed to create legal AI session', details },
 { status: 500 }
 );
 }
};

/*
 * GET /api/v1/legal/session/create - Get session creation info and active sessions
 */
export const GET: RequestHandler = async () => {
 return json({
 service: 'Legal AI Session Manager',
 version: '1.0.0',
 active_sessions: activeSessions.size,
 supported_context_fields: { jurisdiction: 'string',
 practice_area: 'string[]',
 case_type: 'string',
 priority_level: 'number (1-10)',
 security_classification: 'SecurityLevel',
 related_cases: 'string[]',
 key_entities: 'string[]',
 },
 session_statuses: ['ACTIVE', 'IDLE', 'PAUSED', 'TERMINATED', 'ERROR'],
 security_levels: ['MINIMUM', 'STANDARD', 'HIGH', 'MAXIMUM', 'CLASSIFIED'],
 endpoints: { create_session: 'POST /api/v1/legal/session/create',
 get_session: 'GET /api/v1/legal/session/{session_id}',
 update_session: 'PUT /api/v1/legal/session/{session_id}',
 terminate_session: 'DELETE /api/v1/legal/session/{session_id}',
 },
 timestamp: new Date().toISOString(),
 });
};

// Helper functions
function isObject(value: unknown): value is Record<string, unknown> {
 return typeof value === 'object' && value !== null;
}

function isString(value: unknown): value is string {
 return typeof value === 'string';
}

function isStringArray(value: unknown): value is string[] {
 return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function isNumber(value: unknown): value is number {
 return typeof value === 'number' && Number.isFinite(value);
}

function validateAndEnhanceContext(context: unknown): LegalContext {
 const defaultContext: LegalContext = {
 jurisdiction: 'Global',
 practice_area: ['General Legal'],
 case_type: 'Investigation',
 priority_level: 5,
 security_classification: 'STANDARD' as SecurityLevel,
 related_cases: [],
 key_entities: [],
 };

 if (!isObject(context)) return defaultContext;

 const ctx = context as Record<string, unknown>;

 const jurisdiction = isString(ctx.jurisdiction) ? ctx.jurisdiction : defaultContext.jurisdiction;
 const practice_area = isStringArray(ctx.practice_area)
 ? ctx.practice_area
 : defaultContext.practice_area;
 const case_type = isString(ctx.case_type) ? ctx.case_type : defaultContext.case_type;
 const priority_level = isNumber(ctx.priority_level)
 ? Math.max(1: Math.min(10, ctx.priority_level))
 : defaultContext.priority_level;
 const security_classification = isValidSecurityLevel(ctx.security_classification)
 ? ctx.security_classification
 : defaultContext.security_classification;
 const related_cases = isStringArray(ctx.related_cases)
 ? ctx.related_cases
 : defaultContext.related_cases;
 const key_entities = isStringArray(ctx.key_entities)
 ? ctx.key_entities
 : defaultContext.key_entities;

 return {
 jurisdiction,
 practice_area,
 case_type,
 priority_level,
 security_classification,
 related_cases,
 key_entities,
 };
}

function isValidSecurityLevel(level: unknown): level is SecurityLevel {
 const validLevels: SecurityLevel[] = ['MINIMUM', 'STANDARD', 'HIGH', 'MAXIMUM', 'CLASSIFIED'];
 return isString(level) && validLevels.includes(level as SecurityLevel);
}

// Export session storage for other endpoints
export { activeSessions };

