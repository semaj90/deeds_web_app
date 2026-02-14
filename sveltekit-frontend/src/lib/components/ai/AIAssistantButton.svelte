<script lang="ts">
	import { goto } from '$app/navigation';
	import Badge from '$lib/components/ui/badge/Badge.svelte';
	import { cn } from '$lib/utils';
	import Brain from 'lucide-svelte/icons/brain';
	import Mic from 'lucide-svelte/icons/mic';
	import MicOff from 'lucide-svelte/icons/mic-off';
	import Sparkles from 'lucide-svelte/icons/sparkles';

	interface Props {
		variant?: 'floating' | 'inline' | 'compact' | 'full';
		position?: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';
		showStatus?: boolean;
		showBadge?: boolean;
		disabled?: boolean;
		voiceEnabled?: boolean;
		class?: string;
		onclick?: () => void;
	}

	let {
		variant = 'floating',
		position = 'bottom-right',
		showStatus = true,
		showBadge = true,
		disabled = false,
		voiceEnabled = true,
		class: className = '',
		onclick
	}: Props = $props();

	// AI Assistant state
	let isActive = $state(false);
	let isListening = $state(false);
	let unreadCount = $state(3);
	let aiStatus = $state<'idle' | 'processing' | 'listening' | 'connected'>('connected');

	const buttonClasses = $derived(() => {
		const base = 'ai-assistant-btn transition-all duration-300 font-mono';
		const variants = {
			floating: 'fixed z-50 rounded-full shadow-2xl hover:shadow-yorha-accent/20 border-2 p-4',
			inline: 'relative rounded-lg shadow-md hover:shadow-lg border p-2',
			compact: 'relative rounded-md shadow-sm hover:shadow-md border p-1',
			full: 'w-full rounded-lg shadow-md hover:shadow-lg border p-4'
		};
		const positions = {
			'bottom-right': 'bottom-6 right-6',
			'bottom-left': 'bottom-6 left-6',
			'top-right': 'top-6 right-6',
			'top-left': 'top-6 left-6'
		};
		const statusColors = {
			idle: 'bg-panelSoft border-sand/20 text-sand/40',
			processing: 'bg-info/10 border-info text-info/80 animate-pulse',
			listening: 'bg-danger/10 border-danger text-danger/80 animate-pulse',
			connected: 'bg-warning/20/20 border-warning text-warning'
		};

		let classes = `${base} ${variants[variant]} ${statusColors[aiStatus]}`;
		if (variant === 'floating') {
			classes += ` ${positions[position]}`;
		}
		if (disabled) {
			classes += ' opacity-50 cursor-not-allowed';
		} else {
			classes += ' cursor-pointer hover:scale-105, active:scale-95';
		}
		return cn(classes, className);
	});

	function handleClick() {
		if (disabled) return;
		if (onclick) {
			onclick();
		} else {
			goto('/ai-assistant');
		}
		isActive = true;
	}

	function toggleVoiceInput(e: Event) {
		e.stopPropagation();
		if (!voiceEnabled) return;
		isListening = !isListening;
		aiStatus = isListening ? 'listening' : 'connected';
	}

	const statusConfig = { idle: { color: 'bg-sand/20', pulse: false },
	processing: {
	color: 'bg-info', pulse: true },
	listening: {
	color: 'bg-danger', pulse: true },
	connected: {
	color: 'bg-warning', pulse: false }
	};
</script>

{#if variant === 'floating'}
	<button
		type="button"
		class={buttonClasses()}
		onclick={handleClick}
		{disabled}
		aria-label="Open assistant"
	>
		<div class="relative">
			<Brain class="w-8 h-8" />
			{#if showStatus}
				<div
					class="absolute -top-1 -right-1 w-3 h-3 rounded-full border-2 border-sand/20 {statusConfig[aiStatus].color} {statusConfig[aiStatus].pulse ? 'animate-pulse' : ''}"
					title={aiStatus}
				></div>
			{/if}
			{#if showBadge && unreadCount > 0}
				<Badge class="absolute -top-4 -right-4 bg-warning text-black text-[10px] h-5 w-5 flex items-center justify-center p-0 min-w-0">
					{unreadCount > 9 ? '9+' : unreadCount}
				</Badge>
			{/if}
		</div>
	</button>

{:else if variant === 'inline' || variant === 'full'}
	<button
		type="button"
		class={buttonClasses()}
		onclick={handleClick}
		{disabled}
	>
		<div class="flex items-center gap-3 w-full">
			<div class="relative">
				<Brain class="w-6 h-6" />
				{#if showStatus}
					<div
						class="absolute -bottom-1 -right-1 w-2.5 h-2.5 rounded-full border-2 border-sand/20 {statusConfig[aiStatus].color} {statusConfig[aiStatus].pulse ? 'animate-pulse' : ''}"
						title={aiStatus}
					></div>
				{/if}
			</div>

			<div class="flex-1 text-left">
				<div class="font-bold text-sm">AI Assistant</div>
				<div class="text-[10px] opacity-70">
					{aiStatus === 'connected' ? 'Ready' : aiStatus === 'processing' ? 'Thinking...' : aiStatus === 'listening' ? 'Listening...' : 'Offline'}
				</div>
			</div>

			{#if voiceEnabled}
				<button
					class="p-1.5 hover:bg-white/10 rounded-full transition-colors"
					onclick={toggleVoiceInput}
					aria-label={isListening ? 'Stop listening' : 'Start voice input'}
				>
					{#if isListening}
						<MicOff size={16} />
					{:else}
						<Mic size={16} />
					{/if}
				</button>
			{/if}

			{#if showBadge && unreadCount > 0}
				<Badge variant="yorha" class="text-[10px] px-1.5">{unreadCount}</Badge>
			{/if}

			{#if variant === 'full'}
				<Sparkles class="w-4 h-4 text-warning animate-pulse" />
			{/if}
		</div>
	</button>

{:else if variant === 'compact'}
	<button
		type="button"
		class={buttonClasses()}
		onclick={handleClick}
		{disabled}
		title="AI Assistant"
	>
		<div class="relative">
			<Brain class="w-5 h-5" />
			{#if showStatus}
				<div
					class="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full {statusConfig[aiStatus].color}"
					title={aiStatus}
				></div>
			{/if}
		</div>
	</button>
{/if}

<style>
	.ai-assistant-btn { position: relative;
		overflow: hidden;
	}

	.ai-assistant-btn::before { content: '';
		position: absolute;
	top: 0;
	left: -100%;
	width: 100%;
	height: 100%;
	background: linear-gradient(90deg, transparent, rgba(255, 215, 0, 0.1), transparent);
		transition:left 0.5s ease;
	}

	.ai-assistant-btn:hover::before {
		left: 100%;
	}
</style>






