<script lang="ts">
	import { Dialog } from 'bits-ui';
	import type { Snippet } from 'svelte';

	interface Props {
		open?: boolean;
		title?: string;
		description?: string;
		analyticsLog?: (event: Record<string, unknown>) => void;
		onClose?: () => void;
		children?: Snippet;
	}

	let {
		children,
		open = $bindable(false),
		title = '',
		description = '',
		analyticsLog = () => {},
		onClose = () => {},
	}: Props = $props();

	$effect(() => {
		if (open) {
			analyticsLog({ event: 'dialog_opened', title, timestamp: Date.now() });
		} else {
			analyticsLog({ event: 'dialog_closed', timestamp: Date.now() });
		}
	});

	function handleOpenChange(val: boolean) {
		open = val;
		if (!val) {
			onClose();
		}
	}
</script>

<Dialog.Root {open} onOpenChange={handleOpenChange}>
	<Dialog.Portal>
		<Dialog.Overlay class="modal-overlay fixed inset-0 z-[9990] bg-black/80 backdrop-blur-md transition-opacity" />
		<Dialog.Content
			class="modal-content fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[9991] w-full max-w-md max-h-[90vh] overflow-y-auto bg-[#0d0e12]/95 border border-[#2a2e3d] rounded-2xl shadow-2xl p-6 text-neutral-100 font-sans focus:outline-none"
		>
			<!-- Tactical Corner Notches -->
			<span class="hud-notch-tl" aria-hidden="true"></span>
			<span class="hud-notch-tr" aria-hidden="true"></span>
			<span class="hud-notch-bl" aria-hidden="true"></span>
			<span class="hud-notch-br" aria-hidden="true"></span>

			<!-- Gold Top Highlight -->
			<div class="pointer-events-none absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-transparent via-[#f3d471] to-transparent opacity-80" aria-hidden="true"></div>

			<div class="flex items-start justify-between mb-4">
				<div class="flex-1 min-w-0 pr-3">
					{#if title}
						<Dialog.Title class="text-lg font-bold text-neutral-100 flex items-center gap-2 tracking-wide">
							<span class="text-[#f3d471] font-mono text-sm select-none">§</span>
							<span class="truncate">{title}</span>
						</Dialog.Title>
					{/if}
					{#if description}
						<Dialog.Description class="text-xs text-neutral-400 mt-1 leading-relaxed">
							{description}
						</Dialog.Description>
					{/if}
				</div>
				<Dialog.Close
					class="h-8 w-8 rounded-lg bg-neutral-800/60 border border-neutral-700/50 flex items-center justify-center text-neutral-400 hover:text-white hover:bg-neutral-700/60 hover:border-[#f3d471]/50 transition-all select-none focus:outline-none cursor-pointer"
					aria-label="Close dialog"
				>
					&times;
				</Dialog.Close>
			</div>

			<div class="modal-body text-sm text-neutral-300">
				{#if children}
					{@render children()}
				{/if}
			</div>
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>

<style>
	.hud-notch-tl,
	.hud-notch-tr,
	.hud-notch-bl,
	.hud-notch-br {
		position: absolute;
		width: 10px;
		height: 10px;
		pointer-events: none;
		z-index: 10;
	}
	.hud-notch-tl {
		top: 3px;
		left: 3px;
		border-top: 2px solid #f3d471;
		border-left: 2px solid #f3d471;
	}
	.hud-notch-tr {
		top: 3px;
		right: 3px;
		border-top: 2px solid #f3d471;
		border-right: 2px solid #f3d471;
	}
	.hud-notch-bl {
		bottom: 3px;
		left: 3px;
		border-bottom: 2px solid #f3d471;
		border-left: 2px solid #f3d471;
	}
	.hud-notch-br {
		bottom: 3px;
		right: 3px;
		border-bottom: 2px solid #f3d471;
		border-right: 2px solid #f3d471;
	}
</style>
