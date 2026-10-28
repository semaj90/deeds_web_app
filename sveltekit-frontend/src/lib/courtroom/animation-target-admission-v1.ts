export type AnimationTargetAdmission =
	| { ok: true; targetCount: number }
	| { ok: false; reason: 'NO_TARGETS' | 'NULL_TARGET' | 'TARGET_NOT_OWNED_BY_CHARACTER' };

type AnimationGroupLike = {
	targetedAnimations?: Array<{ target?: unknown } | null>;
};

type CharacterTargetScope = {
	root: unknown;
	skeleton?: {
		bones?: Array<{ getTransformNode?: () => unknown }>;
	};
};

export function admitAnimationGroupTargets(
	group: AnimationGroupLike,
	character: CharacterTargetScope
): AnimationTargetAdmission {
	const entries = group.targetedAnimations ?? [];
	if (entries.length === 0) return { ok: false, reason: 'NO_TARGETS' };
	if (entries.some((entry) => !entry?.target)) return { ok: false, reason: 'NULL_TARGET' };

	const skeletonNodes = new Set(
		(character.skeleton?.bones ?? [])
			.map((bone) => bone.getTransformNode?.())
			.filter(Boolean)
	);

	const belongsToCharacter = (target: any): boolean => {
		if (skeletonNodes.has(target)) return true;
		const visited = new Set<unknown>();
		let current = target;
		while (current && !visited.has(current)) {
			if (current === character.root) return true;
			visited.add(current);
			current = current.parent;
		}
		return false;
	};

	if (entries.some((entry) => !belongsToCharacter(entry!.target))) {
		return { ok: false, reason: 'TARGET_NOT_OWNED_BY_CHARACTER' };
	}

	return { ok: true, targetCount: entries.length };
}
