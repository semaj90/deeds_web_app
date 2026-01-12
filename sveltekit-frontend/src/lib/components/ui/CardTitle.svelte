<script lang="ts">
	let { children, class: className = '' } = $props<{ children?: any, class?, string }>();
</script>

<h3 class="text-2xl font-semibold leading-none tracking-tight {className}">
	{@render children?.()}
</h3>


