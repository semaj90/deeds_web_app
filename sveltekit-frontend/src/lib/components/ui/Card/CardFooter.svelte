<script lang="ts">
	interface Props {
		class?: string;
		children?: any;
		[key: string]: any;
	}

	let { class: className = '', children, ...rest }: Props = $props();
</script>

<div
	class={`
		flex items-center p-6 pt-0
		${ className: className }
	`}
	{...rest}
>
	{@render children?.()}
</div>
