import { expect, test } from '@playwright/test';

test('native EventSource parses source-qualified progress and resumes with Last-Event-ID', async ({ page }) => {
	const origin = 'http://evidence-sse-contract.test';
	const reconnectCursors: string[] = [];

	await page.route(`${origin}/**`, async (route) => {
		const request = route.request();
		const url = new URL(request.url());

		if (url.pathname === '/') {
			await route.fulfill({
				status: 200,
				headers: { 'content-type': 'text/html; charset=utf-8' },
				body: `<!doctype html><script>
					window.sseEvents = [];
					const source = new EventSource('/events');
					source.addEventListener('analysis-progress', (event) => {
						const data = JSON.parse(event.data);
						window.sseEvents.push({ type: event.type, id: event.lastEventId, status: data.status, jobId: data.jobId, caseId: data.caseId, sourceRevision: data.sourceRevision });
							if (data.status === 'completed') source.close();
					});
					source.addEventListener('stream-ended', (event) => {
						window.sseEvents.push({ type: event.type, code: JSON.parse(event.data).code });
						source.close();
					});
				</script>`,
			});
			return;
		}

		if (url.pathname !== '/events') {
			await route.fulfill({ status: 404, body: 'not found' });
			return;
		}

		const cursor = request.headers()['last-event-id'] ?? '';
		reconnectCursors.push(cursor);
		const replay = cursor === ''
			? { id: '40', status: 'queued', eventId: 'f24f9ad7-75b5-4f7c-9a40-1f305b6f0c40' }
			: cursor === '40'
				? { id: '41', status: 'running', eventId: 'f24f9ad7-75b5-4f7c-9a40-1f305b6f0c41' }
				: cursor === '41'
					? { id: '42', status: 'completed', eventId: 'f24f9ad7-75b5-4f7c-9a40-1f305b6f0c42' }
					: null;
		if (replay) {
			await route.fulfill({
				status: 200,
				headers: { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-cache' },
				body: [
					'retry: 10',
					`id: ${replay.id}`,
					'event: analysis-progress',
					`data: {"eventId":"${replay.eventId}","jobId":"e24f9ad7-75b5-4f7c-9a40-1f305b6f0c51","caseId":"89317a13-5ec2-4919-8795-1128bb01fdce","stage":"analysis","status":"${replay.status}","sourceRevision":"sha256:${'a'.repeat(64)}"}`,
					'',
					'',
				].join('\n'),
			});
			return;
		}

		await route.fulfill({
			status: 200,
			headers: { 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-cache' },
			body: 'event: stream-ended\ndata: {"code":"EVENT_HISTORY_GAP"}\n\n',
		});
	});

	await page.goto(origin);
	await expect.poll(() => page.evaluate(() => (window as Window & { sseEvents?: unknown[] }).sseEvents ?? [])).toHaveLength(3);

	const events = await page.evaluate(() => (window as Window & { sseEvents?: Array<Record<string, string>> }).sseEvents ?? []);
	expect(reconnectCursors).toEqual(['', '40', '41']);
	expect(events.map((event) => event.status)).toEqual(['queued', 'running', 'completed']);
	expect(events.map((event) => event.id)).toEqual(['40', '41', '42']);
	for (const event of events) {
		expect(event).toMatchObject({
			type: 'analysis-progress',
			jobId: 'e24f9ad7-75b5-4f7c-9a40-1f305b6f0c51',
			caseId: '89317a13-5ec2-4919-8795-1128bb01fdce',
			sourceRevision: `sha256:${'a'.repeat(64)}`,
		});
	}
});
