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
const sourceRevision = `sha256:${'a'.repeat(64)}`;

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

describe('EnhancedDocumentUploader case-scoped SSE', () => {
	beforeEach(() => {
		FakeEventSource.instances = [];
		vi.stubGlobal('EventSource', FakeEventSource);
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
			id: evidenceId,
			jobId,
			status: 'queued',
			fileName: 'evidence.pdf',
		}), { status: 200, headers: { 'Content-Type': 'application/json' } })));
	});

	afterEach(() => {
		cleanup();
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	it('uses the authorized case stream, ignores wrong-case frames, and completes only on a qualified terminal event', async () => {
		const { default: EnhancedDocumentUploader } = await import('./EnhancedDocumentUploader.svelte');
		render(EnhancedDocumentUploader, { props: { caseId } });
		const file = new File(['evidence'], 'evidence.pdf', { type: 'application/pdf' });
		await fireEvent.change(document.querySelector('input[type="file"]')!, { target: { files: [file] } });
		await fireEvent.click(screen.getByRole('button', { name: /Upload & Process/ }));

		await waitFor(() => expect(FakeEventSource.instances).toHaveLength(1));
		const stream = FakeEventSource.instances[0];
		expect(stream.url).toBe(`/api/cases/${caseId}/evidence/jobs/${jobId}/events`);
		await screen.findByText('processing');

		stream.onerror?.();
		stream.dispatch('analysis-progress', progressEnvelope({ caseId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' }), '1');
		expect(screen.getByText('processing')).toBeInTheDocument();
		expect(screen.queryByText('completed')).not.toBeInTheDocument();

		stream.dispatch('analysis-progress', progressEnvelope({ status: 'completed', progress: 100 }), '2');
		await screen.findByText('completed');
		expect(stream.closed).toBe(true);
	});

	it('closes the active stream when the uploader is unmounted', async () => {
		const { default: EnhancedDocumentUploader } = await import('./EnhancedDocumentUploader.svelte');
		const { unmount } = render(EnhancedDocumentUploader, { props: { caseId } });
		const file = new File(['evidence'], 'evidence.pdf', { type: 'application/pdf' });
		await fireEvent.change(document.querySelector('input[type="file"]')!, { target: { files: [file] } });
		await fireEvent.click(screen.getByRole('button', { name: /Upload & Process/ }));
		await waitFor(() => expect(FakeEventSource.instances).toHaveLength(1));

		const stream = FakeEventSource.instances[0];
		unmount();
		expect(stream.closed).toBe(true);
	});

	it('shows a safe recoverable error when event history has a retention gap', async () => {
		const { default: EnhancedDocumentUploader } = await import('./EnhancedDocumentUploader.svelte');
		render(EnhancedDocumentUploader, { props: { caseId } });
		const file = new File(['evidence'], 'evidence.pdf', { type: 'application/pdf' });
		await fireEvent.change(document.querySelector('input[type="file"]')!, { target: { files: [file] } });
		await fireEvent.click(screen.getByRole('button', { name: /Upload & Process/ }));
		await waitFor(() => expect(FakeEventSource.instances).toHaveLength(1));

		const stream = FakeEventSource.instances[0];
		stream.dispatch('stream-ended', { code: 'EVENT_HISTORY_GAP' }, '');

		await screen.findByText('Progress history is incomplete. Refresh the case to verify the current status.');
		expect(screen.queryByText('completed')).not.toBeInTheDocument();
		expect(stream.closed).toBe(true);
	});
});
