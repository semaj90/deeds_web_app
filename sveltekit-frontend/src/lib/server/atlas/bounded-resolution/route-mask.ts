export const ATLAS_ROUTE_BITS = {
	semanticRequired: 1 << 0,
	astRequired: 1 << 1,
	graphRequired: 1 << 2,
	exactOracleRequired: 1 << 3,
	mutationPresent: 1 << 4,
	staleRevision: 1 << 5,
	degradedIdentity: 1 << 6,
	sourceRequired: 1 << 7,
} as const;

export type AtlasRouteFlag = keyof typeof ATLAS_ROUTE_BITS;
export type AtlasRouteMask = number;
export type RouteMaskInputV1 = Partial<Record<AtlasRouteFlag, boolean>>;

export function buildRouteMask(flags: RouteMaskInputV1): AtlasRouteMask {
	let mask = 0;
	for (const [flag, enabled] of Object.entries(flags) as Array<[AtlasRouteFlag, boolean | undefined]>) {
		if (enabled) mask |= ATLAS_ROUTE_BITS[flag];
	}
	return mask >>> 0;
}

export function hasRouteFlag(mask: AtlasRouteMask, flag: AtlasRouteFlag): boolean {
	return (mask & ATLAS_ROUTE_BITS[flag]) !== 0;
}

/** Hamming distance is a control-plane fingerprint metric, not semantic distance. */
export function routeHammingDistance(a: AtlasRouteMask, b: AtlasRouteMask): number {
	let value = (a ^ b) >>> 0;
	let count = 0;
	while (value !== 0) {
		value &= value - 1;
		count += 1;
	}
	return count;
}
