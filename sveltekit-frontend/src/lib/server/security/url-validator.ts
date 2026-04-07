/**
 * SSRF protection — validates URLs before server-side fetch.
 * Blocks internal/private IPs, cloud metadata endpoints, and non-http(s) protocols.
 */

/** RFC 1918 + link-local + loopback + cloud metadata IP ranges */
const BLOCKED_PATTERNS = [
	// IPv4 private ranges
	/^127\./,
	/^10\./,
	/^172\.(1[6-9]|2\d|3[01])\./,
	/^192\.168\./,
	// Link-local
	/^169\.254\./,
	// IPv6 loopback & link-local
	/^::1$/,
	/^fe80:/i,
	/^fc00:/i,
	/^fd[0-9a-f]{2}:/i,
	// Octal/hex bypass attempts for 127.0.0.1
	/^0177\./,
	/^0x7f/i,
	// Zero address
	/^0\.0\.0\.0$/,
	/^0+$/,
];

/** Hostnames that must never be fetched */
const BLOCKED_HOSTNAMES = new Set([
	'localhost',
	'metadata.google.internal',
	'metadata.google',
	'169.254.169.254', // AWS/GCP/Azure instance metadata
	'[::1]',
	'0.0.0.0',
	'kubernetes.default',
	'kubernetes.default.svc',
]);

/** Internal Docker service hostnames */
const INTERNAL_HOSTNAMES = new Set([
	'minio',
	'legal-ai-minio',
	'redis',
	'postgres',
	'qdrant',
	'neo4j',
	'rabbitmq',
	'langextract',
	'triton',
	'ollama',
]);

export interface UrlValidationResult {
	valid: boolean;
	error?: string;
}

/**
 * Validate a URL is safe for server-side fetch (SSRF protection).
 * Only allows http/https to external, non-private hosts.
 */
export function validateExternalUrl(url: string): UrlValidationResult {
	let parsed: URL;
	try {
		parsed = new URL(url);
	} catch {
		return { valid: false, error: 'Invalid URL format' };
	}

	// Protocol check
	if (!['http:', 'https:'].includes(parsed.protocol)) {
		return { valid: false, error: `Protocol ${parsed.protocol} not allowed` };
	}

	const hostname = parsed.hostname.toLowerCase();

	// Block known dangerous hostnames
	if (BLOCKED_HOSTNAMES.has(hostname)) {
		return { valid: false, error: 'Internal/metadata URLs are not allowed' };
	}

	// Block internal Docker services
	if (INTERNAL_HOSTNAMES.has(hostname)) {
		return { valid: false, error: 'Internal service URLs are not allowed' };
	}

	// Block private/reserved IP patterns
	for (const pattern of BLOCKED_PATTERNS) {
		if (pattern.test(hostname)) {
			return { valid: false, error: 'Private/internal IP addresses are not allowed' };
		}
	}

	// Block numeric-only hostnames (IP obfuscation like http://2130706433/)
	if (/^\d+$/.test(hostname)) {
		return { valid: false, error: 'Numeric IP addresses are not allowed' };
	}

	// Block hostnames ending in internal TLDs
	if (hostname.endsWith('.internal') || hostname.endsWith('.local') || hostname.endsWith('.svc')) {
		return { valid: false, error: 'Internal domain names are not allowed' };
	}

	return { valid: true };
}

/**
 * Validate a URL is an allowed internal service (for MinIO proxy, etc.).
 * Only allows specific known-safe internal hostnames.
 */
export function validateInternalUrl(url: string, allowedHosts: string[]): UrlValidationResult {
	let parsed: URL;
	try {
		parsed = new URL(url);
	} catch {
		return { valid: false, error: 'Invalid URL format' };
	}

	if (!['http:', 'https:'].includes(parsed.protocol)) {
		return { valid: false, error: `Protocol ${parsed.protocol} not allowed` };
	}

	const hostname = parsed.hostname.toLowerCase();
	if (!allowedHosts.includes(hostname)) {
		return { valid: false, error: 'Only allowed internal service URLs are permitted' };
	}

	return { valid: true };
}
