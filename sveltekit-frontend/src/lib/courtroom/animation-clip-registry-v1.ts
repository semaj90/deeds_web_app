import { z } from 'zod';

export const ANIMATION_CLIP_ACTIONS_V1 = ['idle', 'walk', 'inspect', 'interact'] as const;
export type AnimationClipActionV1 = (typeof ANIMATION_CLIP_ACTIONS_V1)[number];

const hashSchema = z.string().regex(/^sha256:[a-f0-9]{64}$/i);
const actionSchema = z.enum(ANIMATION_CLIP_ACTIONS_V1);

export const animationClipRegistryV1Schema = z.object({
	schema: z.literal('atlas.animation-clip-registry.v1'),
	assetSha256: hashSchema,
	clips: z.array(z.object({
		clipIndex: z.number().int().nonnegative(),
		name: z.string().min(1).max(200),
		durationSeconds: z.number().finite().nonnegative(),
		trackCount: z.number().int().nonnegative(),
		action: actionSchema.nullable(),
		status: z.enum(['AVAILABLE', 'AMBIGUOUS', 'INVALID', 'UNMAPPED']),
	}).strict()).max(1_000),
	actions: z.array(z.object({ action: actionSchema, clipIndex: z.number().int().nonnegative() }).strict()).max(4),
}).strict();

export type AnimationClipRegistryV1 = z.infer<typeof animationClipRegistryV1Schema>;
export type AnimationClipDescriptorV1 = { name: string; duration: number; tracks: readonly unknown[] };

const aliases: Readonly<Record<AnimationClipActionV1, ReadonlySet<string>>> = {
	idle: new Set(['idle', 'standing idle']),
	walk: new Set(['walk', 'walking', 'walk cycle', 'locomotion walk', 'reviewed detective walk']),
	inspect: new Set(['inspect', 'inspection', 'examining']),
	interact: new Set(['interact', 'interaction', 'use']),
};

function normalizeName(value: string): string {
	return value.trim().toLocaleLowerCase('en-US').replace(/[._-]+/g, ' ').replace(/\s+/g, ' ');
}

/** Index actual GLTFLoader clips; never guess between duplicate semantic matches. */
export function createAnimationClipRegistryV1(
	assetSha256: string,
	clips: readonly AnimationClipDescriptorV1[],
): AnimationClipRegistryV1 {
	const hash = hashSchema.parse(assetSha256);
	if (clips.length > 1_000) throw new RangeError('ANIMATION_CLIP_COUNT_LIMIT');
	const classified: AnimationClipRegistryV1['clips'] = clips.map((clip, clipIndex) => {
		const name = z.string().min(1).max(200).parse(clip.name.trim());
		const durationSeconds = Number.isFinite(clip.duration) && clip.duration > 0 ? clip.duration : 0;
		const trackCount = clip.tracks.length;
		const normalized = normalizeName(name);
		const action = ANIMATION_CLIP_ACTIONS_V1.find((candidate) => aliases[candidate].has(normalized)) ?? null;
		return { clipIndex, name, durationSeconds, trackCount, action,
			status: durationSeconds > 0 && trackCount > 0 ? (action ? 'AVAILABLE' as const : 'UNMAPPED' as const) : 'INVALID' as const };
	});
	for (const action of ANIMATION_CLIP_ACTIONS_V1) {
		const matches = classified.filter((clip) => clip.action === action && clip.status === 'AVAILABLE');
		if (matches.length > 1) for (const match of matches) match.status = 'AMBIGUOUS';
	}
	const actions = ANIMATION_CLIP_ACTIONS_V1.flatMap((action) => {
		const match = classified.find((clip) => clip.action === action && clip.status === 'AVAILABLE');
		return match ? [{ action, clipIndex: match.clipIndex }] : [];
	});
	return animationClipRegistryV1Schema.parse({
		schema: 'atlas.animation-clip-registry.v1',
		assetSha256: hash,
		clips: classified,
		actions,
	});
}
