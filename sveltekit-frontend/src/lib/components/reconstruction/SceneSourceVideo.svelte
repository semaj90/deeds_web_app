<script lang="ts">
	import { onMount } from 'svelte';

	let { src, seek, onTime, onPending, onPlaying }: {
		src: string;
		seek: { timeMs: number };
		onTime: (timeMs: number, presented: boolean) => void;
		onPending: (pending: boolean) => void;
		onPlaying: (playing: boolean) => void;
	} = $props();

	let video: HTMLVideoElement;
	let available = $state(false);
	let failed = $state(false);
	let appliedSeek: { timeMs: number } | undefined;
	let lastFrameMs: number | undefined;

	function reportMediaTime() {
		if (appliedSeek === seek && !video.requestVideoFrameCallback && !video.seeking && Number.isFinite(video.currentTime)) {
			onTime(Math.round(video.currentTime * 1000), false);
			onPending(false);
		}
	}

	$effect(() => {
		const request = seek;
		if (!available || failed) return;
		const frame = requestAnimationFrame(() => {
			if (seek !== request) return;
			appliedSeek = request;
			const seconds = Math.max(0, Math.min(video.duration, request.timeMs / 1000));
			if (Math.abs(video.currentTime - seconds) < 0.0005 && !video.seeking) {
				reportMediaTime();
				if (lastFrameMs !== undefined) {
					onTime(lastFrameMs, true);
					onPending(false);
				}
				return;
			}
			lastFrameMs = undefined;
			onPending(true);
			video.currentTime = seconds;
		});
		return () => cancelAnimationFrame(frame);
	});

	onMount(() => {
		const element = video;
		let disposed = false;
		let callback: number | undefined;
		if (element.requestVideoFrameCallback) {
			const present: VideoFrameRequestCallback = (_now, frame) => {
				if (disposed) return;
				if (!element.seeking && Number.isFinite(frame.mediaTime) && !failed) {
					lastFrameMs = Math.round(frame.mediaTime * 1000);
					if (appliedSeek === seek) {
						onTime(lastFrameMs, true);
						onPending(false);
					}
				}
				callback = element.requestVideoFrameCallback(present);
			};
			callback = element.requestVideoFrameCallback(present);
		}
		return () => {
			disposed = true;
			if (callback !== undefined) element.cancelVideoFrameCallback(callback);
			element.pause();
			element.removeAttribute('src');
			element.load();
		};
	});
</script>

<!-- The original exhibit may have no caption track. Reviewed transcript evidence is a separate artifact. -->
<!-- svelte-ignore a11y_media_has_caption -->
<video bind:this={video} {src} controls preload="metadata" playsinline aria-label="Source evidence video"
	onloadedmetadata={() => { available = Number.isFinite(video.duration); }}
	onseeking={() => { lastFrameMs = undefined; onPending(true); }}
	onseeked={reportMediaTime}
	ontimeupdate={reportMediaTime}
	onplay={() => onPlaying(true)}
	onpause={() => onPlaying(false)}
	onended={() => onPlaying(false)}
	onerror={() => { failed = true; onPending(true); onPlaying(false); }}
></video>
{#if failed}<p role="alert">The pinned source video could not be loaded. Close it to return to scene-only playback.</p>{/if}

<style>
	video { display: block; width: 100%; max-height: 22rem; background: #172630; }
</style>
