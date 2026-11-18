/** Resolve a viewer target only from the authorized, server-loaded case evidence list. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function findCaseEvidenceTargetV1<T extends { id?: string }>(
	items: readonly T[],
	requestedId: unknown
): T | null {
	if (typeof requestedId !== 'string' || !UUID_RE.test(requestedId)) return null;
	return items.find((item) => item.id === requestedId) ?? null;
}
