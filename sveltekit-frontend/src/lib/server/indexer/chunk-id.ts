import { createHash } from 'crypto';

/**
 * Generates a stable, deterministic ID for a codebase chunk.
 * Format: chunk:{repoHash}:{filePathHash}:{contentHash}:{startLine}:{endLine}
 */
export function generateChunkId(params: {
	repoName: string;
	filePath: string;
	content: string;
	startLine: number;
	endLine: number;
}): string {
	const repoHash = createHash('md5').update(params.repoName).digest('hex').slice(0, 8);
	const pathHash = createHash('md5').update(params.filePath).digest('hex').slice(0, 8);
	const contentHash = createHash('md5').update(params.content).digest('hex').slice(0, 8);

	return `chunk:${repoHash}:${pathHash}:${contentHash}:${params.startLine}:${params.endLine}`;
}

export function generateFileId(filePath: string): string {
	return `file:${filePath.replace(/\\/g, '/')}`;
}

export function generateDirectoryId(dirPath: string): string {
	return `dir:${dirPath.replace(/\\/g, '/')}`;
}

export function generateSummaryId(targetId: string, summaryType: string): string {
	return `summary:${targetId}:${summaryType}`;
}

export function generateWikiId(type: string, subId: string): string {
	return `wiki:${type}:${subId}`;
}
