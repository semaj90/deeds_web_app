<!--
  AIChatWidget — Floating chat dialog using bits-ui Dialog + SimpleWorkingChat
  Opens as a modal overlay with a trigger button.
-->
<script lang="ts">
	import { Dialog } from 'bits-ui';
	import SimpleWorkingChat from '$lib/components/ai/SimpleWorkingChat.svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import Icon from '$lib/components/ui/Icon.svelte';

	interface Props {
		context?: { title?: string; description?: string } | null;
		caseId?: string | null;
		triggerClass?: string;
	}

	let {
		context = null,
		caseId = null,
		triggerClass = ''
	}: Props = $props();

	let isOpen = $state(false);

	let chatId = $derived.by(() => {
		if (caseId) return `case-${caseId}`;
		return `widget-${Date.now()}`;
	});
</script>

<Dialog.Root bind:open={isOpen}>
	<Dialog.Trigger class="widget-trigger {triggerClass}">
		<Icon name="message-circle" size={24} />
	</Dialog.Trigger>

	<Dialog.Portal>
		<Dialog.Overlay class="widget-overlay" />
		<Dialog.Content class="widget-content">
			<div class="widget-header">
				<Dialog.Title class="widget-title">
					<Icon name="bot" size={18} />
					Legal AI Assistant
				</Dialog.Title>
				{#if context?.title}
					<Dialog.Description class="widget-desc">
						Context: {context.title}
					</Dialog.Description>
				{/if}
				<Dialog.Close class="widget-close">
					<Icon name="x" size={16} />
				</Dialog.Close>
			</div>

			<SimpleWorkingChat
				{chatId}
				hasCaseContext={!!caseId}
				height="420px"
			/>
		</Dialog.Content>
	</Dialog.Portal>
</Dialog.Root>

<style>
	:global(.widget-trigger) {
		position: fixed;
		bottom: 1.5rem;
		right: 1.5rem;
		width: 56px;
		height: 56px;
		border-radius: 50%;
		background: var(--color-info, #2563eb);
		color: white;
		border: none;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
		z-index: 40;
		transition: transform 0.15s, box-shadow 0.15s;
	}

	:global(.widget-trigger:hover) {
		transform: scale(1.05);
		box-shadow: 0 6px 16px rgba(0, 0, 0, 0.4);
	}

	:global(.widget-overlay) {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.5);
		z-index: 49;
	}

	:global(.widget-content) {
		position: fixed;
		bottom: 6rem;
		right: 1.5rem;
		width: 400px;
		max-width: calc(100vw - 2rem);
		max-height: calc(100vh - 8rem);
		background: var(--color-panel, #1c1917);
		border: 1px solid var(--color-sand-20, #44403c);
		border-radius: 12px;
		overflow: hidden;
		z-index: 50;
		box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
		display: flex;
		flex-direction: column;
	}

	.widget-header {
		padding: 0.75rem 1rem;
		border-bottom: 1px solid var(--color-sand-20, #44403c);
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.5rem;
		position: relative;
	}

	:global(.widget-title) {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		font-size: 0.95rem;
		font-weight: 600;
		color: var(--color-sand-80, #e7e5e4);
		margin: 0;
	}

	:global(.widget-desc) {
		width: 100%;
		font-size: 0.75rem;
		color: var(--color-sand-60, #78716c);
		margin: 0;
	}

	:global(.widget-close) {
		position: absolute;
		top: 0.75rem;
		right: 0.75rem;
		background: none;
		border: none;
		color: var(--color-sand-60, #78716c);
		cursor: pointer;
		padding: 0.25rem;
		display: flex;
		align-items: center;
	}

	:global(.widget-close:hover) {
		color: var(--color-sand-80, #e7e5e4);
	}
</style>
