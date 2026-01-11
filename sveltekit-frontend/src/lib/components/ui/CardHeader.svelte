<script lang="ts">
	let { children, class: className = '' } = $props<{ children?: any, class?: string }>();
</script>

<div class="flex flex-col space-y-1.5 p-6 {className}">
	{@render children?.()}
</div>


