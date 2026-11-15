export function formatEvidenceSourceRevisionV1(sha256Hex: string): string {
	// Accepts raw hex (upload input) or the stored `sha256:` form (evidence.hash); both normalize to one revision.
	const digest = sha256Hex.replace(/^sha256:/i, '');
	if (!/^[a-f0-9]{64}$/i.test(digest)) {
		throw new Error('Evidence source revision must be a SHA-256 hex digest');
	}
	return `sha256:${digest.toLowerCase()}`;
}
