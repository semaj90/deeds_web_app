export interface BrowserGpuAdapterLike {
	features: Iterable<string> & { has(feature: string): boolean };
	limits: Readonly<Record<string, number>>;
}

export interface BrowserGpuProviderLike {
	requestAdapter(options?: { powerPreference?: 'low-power' | 'high-performance' }): Promise<BrowserGpuAdapterLike | null>;
}

export type BrowserGpuPreflightResult =
	| { status: 'SUPPORTED'; availableFeatures: string[]; limits: Readonly<Record<string, number>> }
	| { status: 'UNSUPPORTED'; reasons: string[]; availableFeatures: string[] }
	| { status: 'UNAVAILABLE'; reason: 'WEBGPU_NOT_PRESENT' | 'ADAPTER_QUERY_FAILED' };

export async function preflightBrowserGpu(input: {
	provider: BrowserGpuProviderLike | null | undefined;
	requiredFeatures?: readonly string[];
	requiredLimits?: Readonly<Record<string, number>>;
	powerPreference?: 'low-power' | 'high-performance';
}): Promise<BrowserGpuPreflightResult> {
	if (!input.provider) return { status: 'UNAVAILABLE', reason: 'WEBGPU_NOT_PRESENT' };

	let adapter: BrowserGpuAdapterLike | null;
	try {
		adapter = await input.provider.requestAdapter(
			input.powerPreference ? { powerPreference: input.powerPreference } : undefined
		);
	} catch {
		return { status: 'UNAVAILABLE', reason: 'ADAPTER_QUERY_FAILED' };
	}
	if (!adapter) return { status: 'UNSUPPORTED', reasons: ['NO_COMPATIBLE_ADAPTER'], availableFeatures: [] };

	const availableFeatures = [...adapter.features].sort();
	const reasons = (input.requiredFeatures ?? [])
		.filter((feature) => !adapter.features.has(feature))
		.map((feature) => `MISSING_FEATURE:${feature}`);
	for (const [limit, required] of Object.entries(input.requiredLimits ?? {}).sort(([left], [right]) => left.localeCompare(right))) {
		const available = adapter.limits[limit];
		if (!Number.isFinite(required) || required < 0) {
			reasons.push(`INVALID_REQUIRED_LIMIT:${limit}`);
		} else if (!Number.isFinite(available) || available < required) {
			reasons.push(`INSUFFICIENT_LIMIT:${limit}`);
		}
	}

	if (reasons.length > 0) return { status: 'UNSUPPORTED', reasons, availableFeatures };
	return {
		status: 'SUPPORTED',
		availableFeatures,
		limits: Object.fromEntries(Object.entries(adapter.limits).sort(([left], [right]) => left.localeCompare(right)))
	};
}
