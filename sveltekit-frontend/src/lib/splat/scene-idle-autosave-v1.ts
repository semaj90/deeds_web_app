/** Coalesces scene edits into one commit after the editor has been idle. */
export function createSceneIdleAutosaveV1(commit: () => void, delayMs = 1200) {
	if (!Number.isSafeInteger(delayMs) || delayMs < 100 || delayMs > 30_000) {
		throw new RangeError('Scene autosave idle delay must be between 100 and 30000 ms.');
	}
	let timer: ReturnType<typeof setTimeout> | null = null;

	return {
		schedule() {
			if (timer) clearTimeout(timer);
			timer = setTimeout(() => {
				timer = null;
				commit();
			}, delayMs);
		},
		cancel() {
			if (timer) clearTimeout(timer);
			timer = null;
		}
	};
}
