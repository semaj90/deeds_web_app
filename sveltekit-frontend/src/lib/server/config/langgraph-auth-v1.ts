export function buildLangGraphAuthHeadersV1(apiKey?: string): Record<string, string> {
	const headers: Record<string, string> = { 'Content-Type': 'application/json' };
	const normalizedKey = apiKey?.trim();
	if (normalizedKey) headers.Authorization = `Bearer ${normalizedKey}`;
	return headers;
}

export function assertLangGraphProductionAuthV1(
	nodeEnvironment: string,
	enabled: boolean,
	apiKey?: string,
	serviceUrl?: string
): void {
	if (nodeEnvironment !== 'production' || !enabled) return;
	if (!apiKey?.trim()) {
		throw new Error('LANGGRAPH_INTERNAL_API_KEY_REQUIRED_IN_PRODUCTION');
	}
	if (!serviceUrl?.trim()) {
		throw new Error('LANGGRAPH_URL_REQUIRED_IN_PRODUCTION');
	}
	try {
		const parsedUrl = new URL(serviceUrl);
		if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
			throw new Error('invalid protocol');
		}
	} catch {
		throw new Error('LANGGRAPH_URL_INVALID_IN_PRODUCTION');
	}
}
