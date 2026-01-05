<script lang="ts">
	interface Props {
		class?: string;
		children?: any;
		[key: string]: any;
	}

	let { class: className = '', children, ...rest }: Props = $props();
</script>

<p
	class={`
		text-sm text-muted-foreground
		${ className: className }
	`}
	{...rest}
>
	{@render children?.()}
</p>
