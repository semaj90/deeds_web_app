// @vitest-environment jsdom
/**
 * Unit tests for the server-side autosave path in board-persistence.svelte.ts.
 *
 * Scope:
 *  - scheduleServerSave() debounces for 4s and POSTs to /api/cases/{id}/canvas
 *  - flushServerSave() uses navigator.sendBeacon() when available, falling back
 *    to keepalive fetch otherwise
 *  - Both are no-ops when no save is pending
 *  - Rapid successive scheduleServerSave calls collapse into a single POST
 *
 * This path is load-bearing: without it, edits made between manual "Save"
 * clicks are stranded in IndexedDB on the editing device. If debounce or
 * sendBeacon regresses, users silently lose work on tab close.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// board-persistence imports idb + lokijs — both are thin enough that we can
// let them run untouched, since the server-save path doesn't touch either.

const snapshot = () => ({
	version: 1,
	viewport: { pan: { x: 0, y: 0 }, zoom: 1 },
	nodes: [{ id: 'n1' }],
	edges: [],
});

describe('board-persistence: scheduleServerSave', () => {
	let fetchSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		vi.resetModules();
		vi.useFakeTimers();
		fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue(
			new Response('{}', { status: 200 }),
		);
	});

	afterEach(() => {
		vi.useRealTimers();
		fetchSpy.mockRestore();
	});

	it('no-op when caseId is empty', async () => {
		const { scheduleServerSave } = await import(
			'$lib/components/evidence/board-persistence.svelte.js'
		);
		scheduleServerSave('', snapshot());
		await vi.advanceTimersByTimeAsync(10_000);
		expect(fetchSpy).not.toHaveBeenCalled();
	});

	it('POSTs after 4s debounce with the snapshot body', async () => {
		const { scheduleServerSave } = await import(
			'$lib/components/evidence/board-persistence.svelte.js'
		);

		scheduleServerSave('case-abc', snapshot());

		// Before debounce fires — no request yet
		await vi.advanceTimersByTimeAsync(3_000);
		expect(fetchSpy).not.toHaveBeenCalled();

		// After debounce window — exactly one request
		await vi.advanceTimersByTimeAsync(1_500);
		expect(fetchSpy).toHaveBeenCalledTimes(1);

		const [url, init] = fetchSpy.mock.calls[0];
		expect(String(url)).toBe('/api/cases/case-abc/canvas');
		expect((init as RequestInit).method).toBe('POST');
		expect((init as RequestInit).keepalive).toBe(true);

		const body = JSON.parse((init as RequestInit).body as string);
		expect(body.nodes).toHaveLength(1);
	});

	it('swallows fetch failures via console.warn (never throws)', async () => {
		const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
		fetchSpy.mockRejectedValue(new Error('ECONNREFUSED'));

		const { scheduleServerSave } = await import(
			'$lib/components/evidence/board-persistence.svelte.js'
		);

		// Should not throw even though fetch rejects
		scheduleServerSave('case-abc', snapshot());
		await vi.advanceTimersByTimeAsync(5_000);

		expect(fetchSpy).toHaveBeenCalledTimes(1);
		expect(warnSpy).toHaveBeenCalledWith(
			'[board-persistence] server save failed:',
			'ECONNREFUSED',
		);

		warnSpy.mockRestore();
	});

	it('collapses rapid successive schedules into a single POST', async () => {
		const { scheduleServerSave } = await import(
			'$lib/components/evidence/board-persistence.svelte.js'
		);

		// Three edits in quick succession — only the last should ship
		scheduleServerSave('case-abc', { ...snapshot(), nodes: [{ id: 'n1' }] });
		await vi.advanceTimersByTimeAsync(1_000);

		scheduleServerSave('case-abc', { ...snapshot(), nodes: [{ id: 'n2' }] });
		await vi.advanceTimersByTimeAsync(1_000);

		scheduleServerSave('case-abc', { ...snapshot(), nodes: [{ id: 'n3' }] });
		await vi.advanceTimersByTimeAsync(5_000);

		expect(fetchSpy).toHaveBeenCalledTimes(1);

		const body = JSON.parse((fetchSpy.mock.calls[0][1] as RequestInit).body as string);
		// Only the latest snapshot made it
		expect(body.nodes[0].id).toBe('n3');
	});
});

describe('board-persistence: flushServerSave', () => {
	beforeEach(() => {
		vi.resetModules();
		vi.useFakeTimers();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('no-op when nothing is pending', async () => {
		const fetchSpy = vi.spyOn(global, 'fetch');
		const sendBeaconSpy = vi.fn<(url: string, data?: BodyInit | null) => boolean>();
		Object.defineProperty(navigator, 'sendBeacon', {
			configurable: true,
			value: sendBeaconSpy,
		});

		const { flushServerSave } = await import(
			'$lib/components/evidence/board-persistence.svelte.js'
		);
		flushServerSave();

		expect(sendBeaconSpy).not.toHaveBeenCalled();
		expect(fetchSpy).not.toHaveBeenCalled();
	});

	it('uses navigator.sendBeacon when available', async () => {
		const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue(
			new Response('{}', { status: 200 }),
		);
		const sendBeaconSpy = vi.fn<(url: string, data?: BodyInit | null) => boolean>(() => true);
		Object.defineProperty(navigator, 'sendBeacon', {
			configurable: true,
			value: sendBeaconSpy,
		});

		const { scheduleServerSave, flushServerSave } = await import(
			'$lib/components/evidence/board-persistence.svelte.js'
		);

		scheduleServerSave('case-xyz', snapshot());
		// Flush BEFORE the debounce fires — simulates beforeunload mid-edit
		flushServerSave();

		// sendBeacon takes it, fetch never called
		expect(sendBeaconSpy).toHaveBeenCalledTimes(1);
		const [url, blob] = sendBeaconSpy.mock.calls[0];
		expect(url).toBe('/api/cases/case-xyz/canvas');
		expect(blob).toBeInstanceOf(Blob);

		// Ensure the debounce timer was cleared (no delayed fetch)
		await vi.advanceTimersByTimeAsync(10_000);
		expect(fetchSpy).not.toHaveBeenCalled();
	});

	it('falls back to keepalive fetch when sendBeacon returns false', async () => {
		const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue(
			new Response('{}', { status: 200 }),
		);
		const sendBeaconSpy = vi.fn<(url: string, data?: BodyInit | null) => boolean>(() => false);
		Object.defineProperty(navigator, 'sendBeacon', {
			configurable: true,
			value: sendBeaconSpy,
		});

		const { scheduleServerSave, flushServerSave } = await import(
			'$lib/components/evidence/board-persistence.svelte.js'
		);

		scheduleServerSave('case-xyz', snapshot());
		flushServerSave();

		expect(sendBeaconSpy).toHaveBeenCalledTimes(1);
		// sendBeacon said "no" — fallback fetch should have fired
		// (the fallback is triggered by sendBeacon returning false)
		expect(fetchSpy).toHaveBeenCalledTimes(1);
		expect((fetchSpy.mock.calls[0][1] as RequestInit).keepalive).toBe(true);
	});

	it('subsequent flush is a no-op (pending state cleared)', async () => {
		vi.spyOn(global, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }));
		const sendBeaconSpy = vi.fn<(url: string, data?: BodyInit | null) => boolean>(() => true);
		Object.defineProperty(navigator, 'sendBeacon', {
			configurable: true,
			value: sendBeaconSpy,
		});

		const { scheduleServerSave, flushServerSave } = await import(
			'$lib/components/evidence/board-persistence.svelte.js'
		);

		scheduleServerSave('case-xyz', snapshot());
		flushServerSave();
		flushServerSave(); // second flush — pending already cleared

		expect(sendBeaconSpy).toHaveBeenCalledTimes(1);
	});
});
