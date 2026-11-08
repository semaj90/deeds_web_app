/** Resolve an upload owner only from the authenticated request identity. */
export function resolveEvidenceUploaderId(userId: string | undefined | null): string | null {
	if (typeof userId !== 'string' || userId.trim().length === 0) return null;
	return userId;
}
