const postgresTarget = {
	protocol: 'postgres:',
	hostname: '127.0.0.1',
	port: '55441',
	database: 'evidence_e2e_disposable',
	username: 'scratch',
	password: 'scratch',
} as const;

const storageTarget = {
	hostname: '127.0.0.1',
	port: '55442',
} as const;

function parsePostgresTarget(value: string | undefined): URL | null {
	if (!value) return null;
	try {
		return new URL(value);
	} catch {
		return null;
	}
}

function isDedicatedPostgresTarget(value: string | undefined): boolean {
	const parsed = parsePostgresTarget(value);
	return Boolean(
		parsed &&
		parsed.protocol === postgresTarget.protocol &&
		parsed.hostname === postgresTarget.hostname &&
		parsed.port === postgresTarget.port &&
		parsed.pathname === `/${postgresTarget.database}` &&
		parsed.username === postgresTarget.username &&
		parsed.password === postgresTarget.password,
	);
}

function parseStorageTarget(value: string | undefined, port?: string): URL | null {
	if (!value) return null;
	try {
		const parsed = new URL(value.includes('://') ? value : `http://${value}:${port ?? ''}`);
		if (!parsed.port && port) parsed.port = port;
		return parsed;
	} catch {
		return null;
	}
}

function isDedicatedStorageTarget(value: string | undefined): boolean {
	const parsed = parseStorageTarget(value);
	return Boolean(
		parsed &&
		parsed.protocol === 'http:' &&
		!parsed.username &&
		!parsed.password &&
		!parsed.search &&
		!parsed.hash &&
		parsed.hostname === storageTarget.hostname &&
		parsed.port === storageTarget.port &&
		(parsed.pathname === '/' || parsed.pathname === ''),
	);
}

export function isSafeEvidenceUploadE2ESetup(input: {
	e2eDatabaseUrl?: string;
	applicationDatabaseUrl: string;
	e2eStorageEndpoint?: string;
	applicationStorageEndpoint?: string;
	applicationStoragePort?: string;
}): boolean {
	if (!isDedicatedPostgresTarget(input.e2eDatabaseUrl)) return false;
	if (!isDedicatedPostgresTarget(input.applicationDatabaseUrl)) return false;
	if (!isDedicatedStorageTarget(input.e2eStorageEndpoint)) return false;

	const actualStorage = parseStorageTarget(input.applicationStorageEndpoint, input.applicationStoragePort);
	const e2eStorage = parseStorageTarget(input.e2eStorageEndpoint);
	return Boolean(
		actualStorage &&
		e2eStorage &&
		actualStorage.protocol === e2eStorage.protocol &&
		actualStorage.hostname === e2eStorage.hostname &&
		actualStorage.port === e2eStorage.port &&
		(actualStorage.pathname === '/' || actualStorage.pathname === ''),
	);
}
