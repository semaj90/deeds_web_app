/** Replace persisted board thumbnail URLs with the current case-authorized map. */
export function replaceEvidenceThumbnailUrls<T extends { evidenceId?: unknown; thumbnailUrl?: unknown }>(
	nodes: readonly T[],
	thumbnails: Readonly<Record<string, string>>
): T[] {
	return nodes.map((node) => {
		if (typeof node.evidenceId !== 'string') return { ...node };
		const { thumbnailUrl: _staleThumbnail, ...rest } = node;
		const authorizedThumbnail = thumbnails[node.evidenceId];
		return authorizedThumbnail ? { ...rest, thumbnailUrl: authorizedThumbnail } as T : rest as T;
	});
}
