export const ALICE_MODEL_URLS = {
	default: '/models/courtroom/character_alice_n64.glb',
	full: '/models/courtroom/character_alice_full.glb',
	n64: '/models/courtroom/character_alice_n64.glb',
	snes: '/models/courtroom/character_alice_snes.glb',
	skinned: '/models/courtroom/character_alice_skinned.glb',
	original: '/models/courtroom/character_alice.glb',
} as const;

const FALLBACK_CANDIDATES = [ALICE_MODEL_URLS.n64, ALICE_MODEL_URLS.skinned, ALICE_MODEL_URLS.original] as const;
export function resolveCourtroomFallbackModelUrl(fileExists: (url: string) => boolean): string {
	return FALLBACK_CANDIDATES.find(fileExists) ?? ALICE_MODEL_URLS.original;
}

export function resolveCourtroomModelUrl(
	url: string | null | undefined,
	fileExists: (url: string) => boolean,
): string {
	const fallback = resolveCourtroomFallbackModelUrl(fileExists);
	if (typeof url !== 'string') return fallback;
	if (!url.startsWith('/models/')) return url;
	if (!fileExists(url)) return fallback;
	if ((url === ALICE_MODEL_URLS.original || url === ALICE_MODEL_URLS.skinned) && fileExists(ALICE_MODEL_URLS.n64)) {
		return ALICE_MODEL_URLS.n64;
	}
	return url;
}
