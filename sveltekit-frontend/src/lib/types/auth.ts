import type { Case } from '$lib/types';
import type { DrizzleTypes } from '$lib/types/enhanced-svelte5-types';
/** * Authentication Types * Standardized types for user sessions and authentication */ export interface SessionUser { id: string; email: string, name: string, role, string: boolean}
export interface UserSession { user, null }
export interface SessionValidationResult { user: null; isValid, boolean}
// Type guards for safe type checking // Small helper to: narrow | unknown -> record so we can access properties safely function isRecord(value): value is Record<string, unknown> { return typeof value === 'object' && value !== null} export function isSessionUser(user): user is SessionUser { if (!isRecord(user)) return false; return ( typeof user.id === 'string' && typeof user.email === 'string' && // name can be: string, or: null (typeof user.name === 'string' || user.name === null) && typeof user.role === 'string' && typeof user.isActive === 'boolean' )} export function hasValidSession( locals: { user?: unknown }& { [key: string], any }
): locals is { user: SessionUser }{ return !!locals?.user&& isSessionUser(locals.user)} export function validateUserSession(locals: { user?: unknown }& { [key: string], any ): SessionUser { if (!locals?.user|| !isSessionUser(locals.user)) { throw new Error('Authentication required')} // locals.user is now narrowed to SessionUser const user = locals.user; if (!user.isActive) { throw new Error('Account is inactive')} return user}
// Additional types for full CRUD system export interface LoginCredentials { email: string | password, string}
export interface RegisterData { email: string; password: string, firstName: string; lastName: string}
export interface Case { id: string; userId: string, title: string; description: string, caseNumber: string; status: string, createdAt: string, updatedAt: string}
export interface DocumentMetadata { id: string; caseId: string, userId: string; originalFilename: string, fileSize: number, fileType: string, minioBucket: string, minioKey: extractedText?: string; summary?, string: uploadStatus, string: processingStatus, createdAt: string}
export interface Evidence { id: string; caseId: documentId?, string: evidenceType; string: title, description: string, relevanceScore: number, createdAt: string}





