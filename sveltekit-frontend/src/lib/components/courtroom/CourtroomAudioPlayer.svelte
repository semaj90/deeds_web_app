<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import {
		CourtroomAudioPlayer,
	} from '$lib/courtroom/courtroom-audio-player-v1.js';
	import type { CourtroomMusicTrack } from '$lib/courtroom/courtroom-music-manifest-v1.js';

	let {
		musicCue = null,
		class: className = ''
	}: {
		musicCue?: string | null;
		class?: string;
	} = $props();

	let audioElement = $state<HTMLAudioElement | null>(null);
	let currentTrack = $state<CourtroomMusicTrack | null>(null);
	let isUnlocked = $state(false);
	let volume = $state(0.7);
	let isMuted = $state(false);

	let player: CourtroomAudioPlayer | null = null;

	onMount(() => {
		player = new CourtroomAudioPlayer({
			initialVolume: volume,
			onTrackChange: (t) => {
				currentTrack = t;
			}
		});

		if (audioElement) {
			player.attachAudioElement(audioElement);
		}

		return () => {
			player?.dispose();
		};
	});

	$effect(() => {
		if (audioElement && player && !player.isPlaying) {
			player.attachAudioElement(audioElement);
		}
	});

	$effect(() => {
		if (player) {
			player.syncWithEngineMusic(musicCue);
		}
	});

	async function handleUnlock() {
		if (!player) return;
		await player.unlockAudio();
		isUnlocked = player.userGestureUnlocked;
	}

	function handleVolumeChange(e: Event) {
		const target = e.target as HTMLInputElement;
		const val = parseFloat(target.value);
		volume = val;
		player?.setVolume(val);
	}

	function handleToggleMute() {
		if (!player) return;
		isMuted = player.toggleMute();
	}
</script>

<aside
	aria-label="Courtroom Audio Player"
	data-testid="courtroom-audio-player"
	class="flex items-center gap-2 rounded-md border border-[#bad0ff]/20 bg-[#0c101d]/90 px-3 py-1.5 font-mono text-xs text-[#e6efff] backdrop-blur-md shadow-md {className}"
>
	<audio bind:this={audioElement} preload="none"></audio>

	{#if !isUnlocked}
		<button
			type="button"
			onclick={handleUnlock}
			class="flex items-center gap-1.5 rounded bg-[#f3d471]/20 hover:bg-[#f3d471]/30 border border-[#f3d471]/50 px-2 py-0.5 text-[0.7rem] font-semibold text-[#f3d471] transition-colors"
			title="Audio playback requires an initial user interaction"
		>
			<span class="size-1.5 rounded-full bg-[#f3d471] animate-ping"></span>
			<span>Enable Audio</span>
		</button>
	{:else}
		<div class="flex items-center gap-2">
			<button
				type="button"
				onclick={handleToggleMute}
				class="rounded border border-white/10 hover:border-white/30 px-1.5 py-0.5 text-[0.68rem] text-zinc-300 transition-colors"
				aria-label={isMuted ? 'Unmute courtroom audio' : 'Mute courtroom audio'}
			>
				{isMuted ? '🔇 MUTED' : '🔊 SFX'}
			</button>

			<label class="flex items-center gap-1 text-[0.65rem] text-zinc-400">
				<span>Vol</span>
				<input
					type="range"
					min="0"
					max="1"
					step="0.05"
					value={volume}
					oninput={handleVolumeChange}
					class="w-16 h-1 accent-[#8bdfff] cursor-pointer"
					aria-label="Courtroom volume"
				/>
			</label>
		</div>
	{/if}

	<div class="ml-2 flex items-center gap-1 text-[0.68rem] text-zinc-400">
		<span class="text-zinc-500">Track:</span>
		{#if currentTrack && currentTrack.id !== 'silence'}
			<span class="font-semibold text-[#8bdfff] truncate max-w-[140px]">{currentTrack.title}</span>
		{:else}
			<span class="text-zinc-600 italic">None</span>
		{/if}
	</div>
</aside>
