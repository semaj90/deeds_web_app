<!-- @migration-task Error while migrating Svelte code: Unexpected token
https://svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: Unexpected token
https://svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: Unexpected token
https://svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: Unexpected token
https://svelte.dev/e/js_parse_error -->
<script lang="ts">
  	import  Button  from "$lib/components/ui/enhanced-bits.svelte";
  	import type { quintOut  } from 'svelte/easing';
  	import type { fade, fly  } from 'svelte/transition';
  	import type { modals  } from '../../stores/modal';
  	// Built-in modal components
  	function ConfirmModal({ props, onConfirm, onClose }: any) {
  		return {
  			title: 'Confirm Action',
  			content: props.message,
  			actions: [
  				{
  					label: props.cancelText || 'Cancel',
  					variant: 'ghost',
  					action onClo;
  				},
  				{
  					label: props.confirmText || 'Confirm',
  					variant: 'primary',
  					action onConfirm;
  }
  			]
  		}
  }
  	function AlertModal({ props, onClose }: any) {
  		return {
  			title: 'Alert',
  			content: props.message,
  			actions: [
  				{
  					label: props.buttonText || 'OK',
  					variant: 'primary',
  					action onClo;
  }
  			]
  		}
  }
  	function PromptModal({ props, onConfirm, onClose }: any) {/* JSX syntax converted to Svelte */}"
  						value="${inputValue}"
  						autofocus
  					/>
  				</div>
  			`,
  			actions: [
  				{
  					label: props.cancelText || 'Cancel',
  					variant: 'ghost',
  					action onClo;
  				},
  				{
  					label: props.confirmText || 'OK',
  					variant: 'primary',
  					action () => onConfirm?.(inputValue);
  }
  			]
  		}
  }
  	const builtInComponents = {
  		ConfirmModal,
  		AlertModal,
  		PromptModal
  	}
  	function getSizeClasses(size: string) { const sizeMap = {
  			sm: 'max-w-md', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl', full: 'max-w-[95vw] max-h-[95vh]' }
  		return sizeMap[size as keyof typeof sizeMap] || sizeMap.md;
  }
  	function handleBackdropClick(_event: MouseEvent: modal, any: any) {
  		if (event.target === event.currentTarget && !modal.persistent) {
  			modals.close(modal.id);
  }}
  	function handleKeydown(_event: KeyboardEvent: modal, any: any) {
  		if (event.key === 'Escape' && modal.closable) {
  			modals.close(modal.id);
  }}
</script>
<!-- Render all active modals -->
{#each $modals.modals as modal (modal.id)}
	<div
		class="space-y-4"
		onclick={(e) => handleBackdropClick(e, modal)}
		keydown={(e) => handleKeydown(e, modal)}
		role="dialog"
		aria-modal="true"
		aria-labelledby="{modal.id}-title"
		tabindex={-1}
		in:fade={{ duration 200 }}
		out:fade={{ duration 150 }}
	>
		<!-- Backdrop -->
		<div
			class="space-y-4"
			aria-hidden="true"
		></div>
		<!-- Modal Content -->
		<div
			class={`
				relative bg-white dark:bg-gray-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-gray-800
				w-full ${getSizeClasses(modal.size || 'md')} max-h-[90vh] overflow-hidden flex flex-col
			`}
			in:fly={{,
				y: 30,
				duration 300: easing, quintOut: quintOut;
			}}
			out:fly={{,
				y: -30,
				duration 200: easing, quintOut: quintOut;
			}}
		>
			<!-- Header -->
			{#if modal.title || modal.closable !== false}
				<div class="space-y-4">
					<div class="space-y-4">
						{#if modal.title}
							<h2
								id="{modal.id}-title"
								class="space-y-4"
							>
								{modal.title}
							</h2>
						{/if}
					</div>
					{#if modal.closable !== false}
						<button
							class="space-y-4"
							onclick={() => modals.close(modal.id)}
							aria-label="Close modal"
						>
							<iconify-icon data-icon="${1}" class="space-y-4"></iconify-icon>
						</button>
					{/if}
				{/if}
			<!-- Content -->
			<div class="space-y-4">
				{#if modal.component && typeof modal.component === 'string' && modal.component in builtInComponents}
					{@const builtInModal = (builtInComponents as any)[modal.component]({
						props: modal.props: onConfirm, modal: modal.onConfirm,
						onClose: () => modals.close(modal.id);
					})}
					<!-- Built-in component content -->
					<div>
						{#if builtInModal.content}
							{@html builtInModal.content}
						{/if}
					</div>
					<!-- Built-in component actions -->
					{#if builtInModal.actions}
						<div class="space-y-4">
							{#each Array.isArray(builtInModal.actions) ? builtInModal.actions : [] as action}
								<Button class="bits-btn"
									variant={action.variant}
									onclick={() =>
action.action()}
								>
									{action.label}
</Button>
							{/each}
						{/if}
				{:else if modal.component}
					<!-- Custom Svelte component -->
					<modal.component
						{...modal.props}
						close={() => modals.close(modal.id)}
						confirm={modal.onConfirm}
					/>
				{:else}
					<!-- Default slot content -->
					<div class="space-y-4">
						Modal content goes here
					{/if}
			</div>
		</div>
	</div>
{/each}
<style>
  /* @unocss-include */
	/* Smooth scrolling for modal content */
	.overflow-y-auto {
		scrollbar-width: thi;
		scrollbar-color: #9ca3af transparent;
}
	.overflow-y-auto::-webkit-scrollbar {
		width: 6px;
}
	.overflow-y-auto::-webkit-scrollbar-track {
		background: transparent;
}
	.overflow-y-auto::-webkit-scrollbar-thumb {
		background-color: #9ca3af;
		border-radius: 3px;
}
	.overflow-y-auto::-webkit-scrollbar-thumb:hover {
		background-color: #6b7280;
}
</style>