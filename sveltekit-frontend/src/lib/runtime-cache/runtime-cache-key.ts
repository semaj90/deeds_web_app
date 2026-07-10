function stableJson(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(stableJson);
	if (value && typeof value === 'object') {
		return Object.keys(value as Record<string, unknown>)
			.sort()
			.reduce<Record<string, unknown>>((acc, key) => {
				acc[key] = stableJson((value as Record<string, unknown>)[key]);
				return acc;
			}, {});
	}
	return value;
}

async function sha256Hex(input: string): Promise<string> {
	const bytes = new TextEncoder().encode(input);
	const digest = await crypto.subtle.digest('SHA-256', bytes);
	const hash = new Uint8Array(digest);
	let hex = '';
	for (let i = 0; i < hash.length; i++) {
		hex += hash[i].toString(16).padStart(2, '0');
	}
	return hex;
}

export async function hashRuntimeCacheBody(body: unknown): Promise<string> {
	return sha256Hex(JSON.stringify(stableJson(body ?? null)));
}

export async function buildRuntimeCacheKey(request: Request): Promise<string> {
	const url = new URL(request.url);
	const method = request.method.toUpperCase();
	let key = `${method}:${url.pathname}`;

	if (method === 'GET' && url.search) {
		key += `?${url.search}`;
	}

	if (method !== 'GET' && method !== 'HEAD') {
		const raw = await request.clone().text().catch(() => '');
		let normalized: unknown = raw;
		try {
			normalized = raw ? JSON.parse(raw) : null;
		} catch {
			normalized = raw;
		}
		key += `:body:${(await hashRuntimeCacheBody(normalized)).slice(0, 24)}`;
	}

	return key;
}
