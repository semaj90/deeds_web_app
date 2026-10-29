export function resolveDatabaseUrl(databaseUrl?: string | null, postgresUrl?: string | null): string {
	const configuredUrl = databaseUrl?.trim() || postgresUrl?.trim();
	if (!configuredUrl) throw new Error('DATABASE_URL_REQUIRED');

	let parsed: URL;
	try {
		parsed = new URL(configuredUrl);
	} catch {
		throw new Error('DATABASE_URL_INVALID');
	}
	if (parsed.protocol !== 'postgres:' && parsed.protocol !== 'postgresql:') {
		throw new Error('DATABASE_URL_INVALID');
	}

	return configuredUrl;
}
