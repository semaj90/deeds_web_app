import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';

class FakeEventSource {
	static instances: FakeEventSource[] = [];
	readonly listeners = new Map<string, Array<(event: MessageEvent<string>) => void>>();
	onerror: (() => void) | null = null;
	closed = false;

	constructor(readonly url: string) {
		FakeEventSource.instances.push(this);
	}

	addEventListener(type: string, listener: EventListenerOrEventListenerObject) {
		const handlers = this.listeners.get(type) ?? [];
		handlers.push(listener as (event: MessageEvent<string>) => void);
		this.listeners.set(type, handlers);
	}

	dispatch(type: string, data: unknown, lastEventId: string) {
		const event = new MessageEvent(type, { data: JSON.stringify(data), lastEventId });
		for (const listener of this.listeners.get(type) ?? []) listener(event);
	}

	close() {
		this.closed = true;
	}
}

const caseId = '11111111-1111-4111-8111-111111111111';
const jobId = '22222222-2222-4222-8222-222222222222';
const evidenceId = '33333333-3333-4333-8333-333333333333';
const eventId = '44444444-4444-4444-8444-444444444444';
const sourceRevision = `sha256:${'b'.repeat(64)}`;

function progressEnvelope(overrides: Record<string, unknown> = {}) {
	return {
		eventId,
		jobId,
		evidenceId,
		caseId,
		stage: 'extracting',
		status: 'running',
		sourceRevision,
		progress: 45,
		...overrides,
	};
}

describe('SmartDocumentForm case-scoped SSE', () => {
	let fetchMock: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		FakeEventSource.instances = [];
		vi.stubGlobal('EventSource', FakeEventSource);
		fetchMock = vi.fn(async (input: RequestInfo | URL) => {
			if (String(input) === '/api/evidence/upload') {
				return new Response(JSON.stringify({ id: evidenceId, jobId }), {
					status: 200,
					headers: { 'Content-Type': 'application/json' },
				});
			}
			return new Response(JSON.stringify({ results: [] }), {
				status: 200,
				headers: { 'Content-Type': 'application/json' },
			});
		});
		vi.stubGlobal('fetch', fetchMock);
	});

	afterEach(() => {
		cleanup();
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	it('uses the case stream, ignores mismatched case events and only fetches extracted data after qualified completion', async () => {
		const { default: SmartDocumentForm } = await import('./SmartDocumentForm.svelte');
		render(SmartDocumentForm, { props: { caseId, onocrresult: vi.fn() } });
		const file = new File(['evidence'], 'evidence.pdf', { type: 'application/pdf' });
		await fireEvent.change(document.querySelector('input[type="file"]')!, { target: { files: [file] } });

		await waitFor(() => expect(FakeEventSource.instances).toHaveLength(1));
		const stream = FakeEventSource.instances[0];
		expect(stream.url).toBe(`/api/cases/${caseId}/evidence/jobs/${jobId}/events`);
		stream.onerror?.();
		stream.dispatch('analysis-progress', progressEnvelope({ caseId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' }), '1');
		expect(fetchMock).toHaveBeenCalledTimes(1);

		stream.dispatch('analysis-progress', progressEnvelope({ status: 'completed', progress: 100 }), '2');
		await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
		expect(fetchMock.mock.calls[1][0]).toBe('/api/evidence/search');
		expect(stream.closed).toBe(true);
	});

	it('closes and settles progress tracking when the form is unmounted', async () => {
		const { default: SmartDocumentForm } = await import('./SmartDocumentForm.svelte');
		const { unmount } = render(SmartDocumentForm, { props: { caseId, onocrresult: vi.fn() } });
		const file = new File(['evidence'], 'evidence.pdf', { type: 'application/pdf' });
		await fireEvent.change(document.querySelector('input[type="file"]')!, { target: { files: [file] } });
		await waitFor(() => expect(FakeEventSource.instances).toHaveLength(1));

		const stream = FakeEventSource.instances[0];
		unmount();
		expect(stream.closed).toBe(true);
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it('surfaces a safe error and does not fetch extracted data when the stream fails', async () => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
		const { default: SmartDocumentForm } = await import('./SmartDocumentForm.svelte');
		render(SmartDocumentForm, { props: { caseId, onocrresult: vi.fn() } });
		const file = new File(['evidence'], 'evidence.pdf', { type: 'application/pdf' });
		await fireEvent.change(document.querySelector('input[type="file"]')!, { target: { files: [file] } });
		await waitFor(() => expect(FakeEventSource.instances).toHaveLength(1));

		const stream = FakeEventSource.instances[0];
		stream.dispatch('stream-error', { code: 'PROGRESS_READ_UNAVAILABLE' }, '');

		await screen.findByText('Evidence was accepted, but processing status could not be verified.');
		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(stream.closed).toBe(true);
	});
});
