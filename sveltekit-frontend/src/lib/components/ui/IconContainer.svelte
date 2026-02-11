<script lang="ts">
	import type { ComponentType } from 'svelte';
	// Migrated to $effect

	interface Props {
		icon: ComponentType;
		class?: string;
		size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl';
	}

	let { icon: Icon, class: className = '', size = 'md' }: Props = $props();

	const sizeClasses: Record<string, string> = {
		xs: 'h-3 w-3',
		sm: 'h-4 w-4',
		md: 'h-5 w-5',
		lg: 'h-6 w-6',
		xl: 'h-8 w-8',
		'2xl': 'h-10 w-10'
	};

	let containerRef: HTMLElement;

	$effect(() => {

		if (containerRef) {
			const style = document.createElement('style');
			style.textContent = `
				.icon-container-${size} {
					container-type: inline-size;
				}
			`;
			document.head.appendChild(style);
		}
	
});
</script>

<div bind:this={containerRef} class="icon-container icon-container-{size} {sizeClasses[size]} {className}">
	<Icon class="h-full w-full" />
</div>

<style>
	.icon-container {
		container-type: inline-size;
	}
</style>
