<script lang="ts">
	import ToastContainer from '$lib/components/ui/ToastContainer.svelte';
	import { toastStore } from '$lib/stores/unified/toast-store.svelte';
	import Icon from '$lib/components/ui/Icon.svelte';

</script>

<div class="p-6 max-w-2xl mx-auto">
	<header class="mb-6">
		<h1 class="text-xl font-bold mb-2 flex items-center gap-2">
			<Icon name="bell" size={20} />
			NES Toast Notifications
		</h1>
		<p class="text-sm opacity-60">
			Retro NES.css-styled toast notifications with auto-dismiss, animated slide-in, and 3 severity levels.
		</p>
	</header>

	<div class="flex flex-wrap gap-3 mb-8">
		<button
			class="nes-btn is-success"
			onclick={() => toastStore.show('Evidence uploaded successfully!', 'success', 3000)}
		>
			Success Toast
		</button>
		<button
			class="nes-btn is-error"
			onclick={() => toastStore.show('Failed to connect to AI service', 'error', 4000)}
		>
			Error Toast
		</button>
		<button
			class="nes-btn is-primary"
			onclick={() => toastStore.show('New case assigned to your queue', 'info', 3000)}
		>
			Info Toast
		</button>
		<button
			class="nes-btn"
			onclick={() => {
				toastStore.show('Step 1: Uploading...', 'info', 2000);
				setTimeout(() => toastStore.show('Step 2: Processing...', 'info', 2000), 1000);
				setTimeout(() => toastStore.show('Step 3: Complete!', 'success', 3000), 2500);
			}}
		>
			Rapid Fire (3x)
		</button>
	</div>

	<div class="nes-container with-title">
		<p class="title">How It Works</p>
		<p class="text-sm">
			Uses <code>toastStore.show(message, type, duration)</code> from the unified toast store.
			The <code>ToastContainer</code> renders toasts as NES-styled cards with slide-in animation.
		</p>
	</div>
</div>

<ToastContainer />