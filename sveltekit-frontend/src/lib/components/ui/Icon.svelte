<script lang="ts">
	let { name, size, class: className = '', label }: {
		name: string;
		size?: string | number;
		class?: string;
		label?: string;
	} = $props();

	let sizeStyle = $derived.by(() => {
		if (!size) return '';
		const val = typeof size === 'number' ? `${size}px` : size;
		return `width:${val};height:${val};`;
	});
</script>

<span
	class="i-lucide-{name} inline-block {className}"
	style={sizeStyle}
	aria-hidden={label ? undefined : 'true'}
	aria-label={label}
	role={label ? 'img' : undefined}
></span>
