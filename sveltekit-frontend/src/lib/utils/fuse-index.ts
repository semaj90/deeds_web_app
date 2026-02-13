import Fuse from 'fuse.js';

// Narrow T so keyof T may include non-strings but we only accept string keys
export function createFuseIndex<T extends Record<string, unknown>>(
	items: T[],
	keys: Array<string | { name: string; weight?: number }>
) {
	type NormalizedKey = string | { name: string; weight: number };

	const normalizedKeys: NormalizedKey[] = keys.map((k) => {
		if (typeof k === 'string') return k;
		const obj = k as { name: string; weight?: number };
		const name = String(obj.name);
		// clamp weight into [0,1] and default to 1 if unspecified
		const rawWeight = typeof obj.weight === 'number' ? obj.weight : 1;
		const weight = Math.min(1, Math.max(0, rawWeight));
		return { name, weight };
	});

	const fuse = new Fuse<T>(items, {
		includeScore: true,
		threshold: 0.35,
		keys: normalizedKeys as Fuse.FuseOptionKey<T>[]
	});

	return fuse;
}
