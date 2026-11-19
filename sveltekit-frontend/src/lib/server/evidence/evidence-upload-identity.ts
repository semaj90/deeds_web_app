/** Resolve an upload owner only from the authenticated request identity. */
export function resolveEvidenceUploaderId(userId: string | number | undefined | null): string | null {
	// Lucia can return the PostgreSQL integer user ID even when Locals declares a string.
	if (typeof userId === 'number') {
		return Number.isSafeInteger(userId) && userId > 0 ? String(userId) : null;
	}
	if (typeof userId !== 'string' || userId.trim().length === 0) return null;
	return userId;
}
