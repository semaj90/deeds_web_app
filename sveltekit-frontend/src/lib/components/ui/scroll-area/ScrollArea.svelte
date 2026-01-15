<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		class?: string;
		orientation?: 'vertical' | 'horizontal' | 'both';
		scrollbarClass?: string;
		children?: Snippet;
	}

	let {
		class: className = '',
		orientation = 'vertical',
		scrollbarClass = '',
		children,
	}: Props = $props();

	let viewportElement: HTMLDivElement | undefined = $state();
	let scrollTop = $state(0);
	let scrollLeft = $state(0);
	let scrollHeight = $state(0);
	let scrollWidth = $state(0);
	let clientHeight = $state(0);
	let clientWidth = $state(0);

	function handleScroll(event: Event) {
		const target = event.target as HTMLDivElement;
		scrollTop = target.scrollTop;
		scrollLeft = target.scrollLeft;
		scrollHeight = target.scrollHeight;
		scrollWidth = target.scrollWidth;
		clientHeight = target.clientHeight;
		clientWidth = target.clientWidth;
	}

	const showVerticalScrollbar = $derived(
		(orientation === 'vertical' || orientation === 'both') && scrollHeight > clientHeight
	);

	const showHorizontalScrollbar = $derived(
		(orientation === 'horizontal' || orientation === 'both') && scrollWidth > clientWidth
	);

	const verticalThumbHeight = $derived(
		scrollHeight > 0 ? Math.max(20, (clientHeight / scrollHeight) * clientHeight) : 0
	);

	const verticalThumbTop = $derived(
		scrollHeight > clientHeight
			? (scrollTop / (scrollHeight - clientHeight)) * (clientHeight - verticalThumbHeight)
			: 0
	);

	const horizontalThumbWidth = $derived(
		scrollWidth > 0 ? Math.max(20, (clientWidth / scrollWidth) * clientWidth) : 0
	);

	const horizontalThumbLeft = $derived(
		scrollWidth > clientWidth
			? (scrollLeft / (scrollWidth - clientWidth)) * (clientWidth - horizontalThumbWidth)
			: 0
	);

	const containerClass = `
		relative overflow-hidden
	`.replace(/\s+/g, ' ').trim();

	const viewportClass = $derived(() => {
		const baseClass = 'h-full w-full rounded-[inherit]';
		const orientationClass =
			orientation === 'vertical' ? 'overflow-y-auto overflow-x-hidden' :
			orientation === 'horizontal' ? 'overflow-x-auto overflow-y-hidden' :
			orientation === 'both' ? 'overflow-auto' : '';
		return `${baseClass} ${orientationClass}`.trim();
	});

	const scrollbarVerticalClass = `
		absolute right-0 top-0 h-full w-2.5 border-l border-l-transparent p-[1px]
		transition-opacity
	`.replace(/\s+/g, ' ').trim();

	const scrollbarHorizontalClass = `
		absolute bottom-0 left-0 h-2.5 w-full border-t border-t-transparent p-[1px]
		transition-opacity
	`.replace(/\s+/g, ' ').trim();

	const thumbClass = `
		relative rounded-full bg-border
	`.replace(/\s+/g, ' ').trim();
</script>

<div class="{containerClass} {className}">
	<div
		bind:this={viewportElement}
		onscroll={ handleScroll }
		class={viewportClass()}
	>
		{#if children}
			{@render children()}
		{/if}
	</div>

	{#if showVerticalScrollbar}
		<div class="{scrollbarVerticalClass} {scrollbarClass}">
			<div
				class={thumbClass}
				style="height: {verticalThumbHeight}px; transform, translateY({verticalThumbTop}px);"
			></div>
		</div>
	{/if}

	{#if showHorizontalScrollbar}
		<div class="{scrollbarHorizontalClass} {scrollbarClass}">
			<div
				class={thumbClass}
				style="width: {horizontalThumbWidth}px; transform, translateX({horizontalThumbLeft}px);"
			></div>
		</div>
	{/if}
</div>

<style>
	/* Hide native scrollbar but keep functionality */
	div::-webkit-scrollbar {
		display: none;
	}
	div {
		-ms-overflow-style: none;
		scrollbar-width: none;
	}
</style>


