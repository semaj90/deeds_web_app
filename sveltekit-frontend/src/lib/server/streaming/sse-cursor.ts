/**
 * SSE resume cursors.
 *
 * The event id sent to the browser (`id:`) and read back on reconnect (`Last-Event-ID`) is a
 * Valkey/Redis stream ID ("<ms>-<seq>"). Stream IDs are assigned once by XADD, so every
 * subscriber and every reconnect sees the same identity for the same event, and they sort.
 * (A random UUID per delivery would not: it cannot be compared or resumed from.)
 */

// <= 15 digits keeps both halves exactly representable as JS numbers (2^53 has 16 digits).
export const STREAM_ID_PATTERN = /^\d{1,15}-\d{1,15}$/;

export function isStreamId(value: unknown): value is string {
	return typeof value === 'string' && STREAM_ID_PATTERN.test(value);
}

/** Numeric comparison of two stream IDs: negative if a < b, 0 if equal, positive if a > b. */
export function compareStreamIds(a: string, b: string): number {
	const [aMs, aSeq] = a.split('-').map(Number);
	const [bMs, bSeq] = b.split('-').map(Number);
	if (aMs !== bMs) return aMs < bMs ? -1 : 1;
	if (aSeq !== bSeq) return aSeq < bSeq ? -1 : 1;
	return 0;
}

/**
 * Read the resume cursor from `Last-Event-ID` (sent automatically by a native EventSource that
 * auto-reconnects) or, as a fallback for manual reconnects that create a new EventSource, the
 * `lastEventId` query parameter. Anything that is not a well-formed stream ID is ignored, so
 * client input never reaches XRANGE unvalidated.
 */
export function parseResumeCursor(headers: Headers, url: URL): string | null {
	const raw = headers.get('last-event-id') ?? url.searchParams.get('lastEventId');
	return isStreamId(raw) ? raw : null;
}
