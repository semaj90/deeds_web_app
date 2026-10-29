type AssetResponse = {
	ok: boolean;
	arrayBuffer(): Promise<ArrayBuffer>;
};

type CachedResponse = {
	ok: boolean;
	bytes: ArrayBuffer | null;
};

export function createRetargetAssetFetchCacheV1(
	fetchAsset: (url: string) => Promise<AssetResponse> = (url) => fetch(url),
) {
	const assets = new Map<string, Promise<CachedResponse>>();

	return {
		fetch: async (url: string) => {
			let cached = assets.get(url);
			if (!cached) {
				cached = fetchAsset(url).then(async (response) => ({
					ok: response.ok,
					bytes: response.ok ? await response.arrayBuffer() : null,
				}));
				assets.set(url, cached);
				void cached.catch(() => {
					if (assets.get(url) === cached) assets.delete(url);
				});
			}

			const response = await cached;
			if (!response.ok || !response.bytes) {
				if (assets.get(url) === cached) assets.delete(url);
				return { ok: false, arrayBuffer: async () => new ArrayBuffer(0) };
			}

			return { ok: true, arrayBuffer: async () => response.bytes!.slice(0) };
		},
		clear: () => assets.clear(),
		size: () => assets.size,
	};
}
