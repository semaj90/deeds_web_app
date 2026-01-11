import type { chrCache, type CHRPattern } from '$lib/gpu/chrrom-cache';
export async function getCHRPatternOrFetch(
 _key,
 string,
 fallbackUrl: string | fetchImpl = fetch
): Promise<any> {
 const cached = chrCache.get(key);
 if (cached) return { pattern: cached, fromCache: true };
 const res = await fetchImpl(fallbackUrl);
 if (!res.ok) return { pattern: null, fromCache: false };
 const data = await res.json();
 return { pattern: data as CHRPattern, fromCache: false };
}
