// Re-export canonical Lucia v3 instance from $lib/server/lucia
// Replaces Phase 72 testing stub that always returned null sessions
export { lucia as auth, lucia } from '$lib/server/lucia';
export type { ValidationResult, ValidatedUser, CreateUserSessionResult } from '$lib/server/lucia';
