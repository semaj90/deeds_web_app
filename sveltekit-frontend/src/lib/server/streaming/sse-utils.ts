/**
 * Shared SSE (Server-Sent Events) utilities
 * Used across 21+ streaming API endpoints
 */

/** Format an SSE message with event type and JSON data */
export function sseFormat(event: string, data: unknown, id?: string): string {
	const parts: string[] = [];
	if (id) parts.push(`id: ${id}`);
	parts.push(`event: ${event}`);
	parts.push(`data: ${JSON.stringify(data)}`);
	return parts.join('\n') + '\n\n';
}

/** Standard SSE response headers */
export function sseHeaders(): HeadersInit {
	return {
		'Content-Type': 'text/event-stream; charset=utf-8',
		'Cache-Control': 'no-cache, no-transform',
		'Connection': 'keep-alive',
		'X-Accel-Buffering': 'no'
	};
}
