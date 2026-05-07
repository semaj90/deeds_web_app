// Canonical ACE cache key constants.
// Import from here — never copy-paste key patterns across files.

export const aceTopkKey = (
	queryHash: string,
	model = 'embeddinggemma',
	dim = 768
): string => `ace:topk:${queryHash}:${model}:${dim}`;

export const aceErrorFpKey = (errorHash: string): string => `ace:error:fp:${errorHash}`;

export const wikiPageKey = (slug: string): string => `wiki:page:${slug}`;
export const wikiGapKey = (gapId: string): string => `wiki:gap:${gapId}`;
export const wikiFileKey = (filePath: string): string => `wiki:file:${filePath}`;
export const wikiSymbolKey = (symbol: string): string => `wiki:symbol:${symbol}`;
export const wikiGapReportLatestKey = (): string => 'wiki:gap:report:latest';
