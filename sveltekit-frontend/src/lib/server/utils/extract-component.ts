/**
 * Extract a short component identifier from a file path
 * Used by topology endpoints for node labeling
 */
export function extractComponent(filePath: string): string {
	const parts = filePath.split(/[/\\]/);

	if (parts.includes('routes')) {
		const idx = parts.indexOf('routes');
		return parts.slice(idx, idx + 2).join('/');
	}

	if (parts.includes('lib')) {
		const idx = parts.indexOf('lib');
		return parts.slice(idx, idx + 2).join('/');
	}

	return parts.slice(-2).join('/');
}
