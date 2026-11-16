/**
 * ETA for a durable job progress bar. Linear extrapolation from elapsed time and percent.
 * Start time is the job's createdAt (queue time included), so the estimate is approximate.
 * Returns null when no honest estimate exists (no progress yet, complete, or bad input).
 */
export function estimateEtaSeconds(createdAt: string | number | Date | null | undefined, progressPct: number, nowMs: number): number | null {
	if (createdAt == null || !Number.isFinite(progressPct) || progressPct <= 0 || progressPct >= 100) return null;
	const startMs = new Date(createdAt).getTime();
	const elapsedSec = (nowMs - startMs) / 1000;
	if (!Number.isFinite(elapsedSec) || elapsedSec <= 0) return null;
	return Math.round((elapsedSec * (100 - progressPct)) / progressPct);
}

/** Formats seconds as m:ss, or h:mm:ss beyond an hour. */
export function formatEta(seconds: number): string {
	const s = Math.max(0, Math.round(seconds));
	const h = Math.floor(s / 3600);
	const m = Math.floor((s % 3600) / 60);
	const sec = s % 60;
	const pad = (n: number) => String(n).padStart(2, '0');
	return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}
