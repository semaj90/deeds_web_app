<script lang="ts">
	let { children, class: className = '' } = $props<{ children?: any, class?: string }>();
</script>

<div class="p-6 pt-0 {className}">
	{@render children?.()}
</div>

