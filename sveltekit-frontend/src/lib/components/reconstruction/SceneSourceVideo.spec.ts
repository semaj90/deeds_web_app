import { render, fireEvent, waitFor, cleanup } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import SceneSourceVideo from './SceneSourceVideo.svelte';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('scene source video', () => {
	it('publishes presented time and ignores a frame callback from disposed media', async () => {
		const prototype = HTMLVideoElement.prototype;
		const oldRequest = Object.getOwnPropertyDescriptor(prototype, 'requestVideoFrameCallback');
		const oldCancel = Object.getOwnPropertyDescriptor(prototype, 'cancelVideoFrameCallback');
		let pendingFrame: VideoFrameRequestCallback | undefined;
		const cancel = vi.fn();
		Object.defineProperty(prototype, 'requestVideoFrameCallback', { configurable: true, value: (callback: VideoFrameRequestCallback) => { pendingFrame = callback; return 1; } });
		Object.defineProperty(prototype, 'cancelVideoFrameCallback', { configurable: true, value: cancel });
		vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
		vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
		try {
			const onTime = vi.fn();
			const view = render(SceneSourceVideo, { src: '/pinned', seek: { timeMs: 2000 }, onTime, onPending: vi.fn(), onPlaying: vi.fn() });
			const video = view.getByLabelText('Source evidence video') as HTMLVideoElement;
			Object.defineProperty(video, 'duration', { value: 10 });
			await fireEvent.loadedMetadata(video);
			await waitFor(() => expect(video.currentTime).toBe(2));
			await fireEvent.seeked(video);
			expect(onTime).not.toHaveBeenCalled();
			pendingFrame?.(0, { mediaTime: 1.96 } as VideoFrameCallbackMetadata);
			expect(onTime).toHaveBeenCalledExactlyOnceWith(1960, true);
			view.unmount();
			expect(cancel).toHaveBeenCalledWith(1);
			pendingFrame?.(1, { mediaTime: 5 } as VideoFrameCallbackMetadata);
			expect(onTime).toHaveBeenCalledTimes(1);
		} finally {
			cleanup();
			if (oldRequest) Object.defineProperty(prototype, 'requestVideoFrameCallback', oldRequest);
			else Reflect.deleteProperty(prototype, 'requestVideoFrameCallback');
			if (oldCancel) Object.defineProperty(prototype, 'cancelVideoFrameCallback', oldCancel);
			else Reflect.deleteProperty(prototype, 'cancelVideoFrameCallback');
		}
	});
	it('uses the newest seek and releases the old media source on unmount', async () => {
		vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {});
		const load = vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {});
		const onTime = vi.fn();
		const view = render(SceneSourceVideo, {
			src: '/pinned-video', seek: { timeMs: 1000 }, onTime, onPending: vi.fn(), onPlaying: vi.fn()
		});
		const video = view.getByLabelText('Source evidence video') as HTMLVideoElement;
		Object.defineProperty(video, 'duration', { value: 10 });
		const time = vi.spyOn(video, 'currentTime', 'set');
		await fireEvent.loadedMetadata(video);
		await view.rerender({ seek: { timeMs: 4000 } });
		await waitFor(() => expect(video.currentTime).toBe(4));
		expect(time.mock.calls).toEqual([[4]]);
		await fireEvent.seeked(video);
		expect(onTime).toHaveBeenLastCalledWith(4000, false);
		view.unmount();
		expect(video.hasAttribute('src')).toBe(false);
		expect(load).toHaveBeenCalledTimes(1);
	});
});
