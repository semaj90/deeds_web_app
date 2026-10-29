export function formatEvidenceSourceRevisionV1(sha256Hex: string): string {
	if (!/^[a-f0-9]{64}$/i.test(sha256Hex)) {
		throw new Error('Evidence source revision must be a SHA-256 hex digest');
	}
	return `sha256:${sha256Hex.toLowerCase()}`;
}
