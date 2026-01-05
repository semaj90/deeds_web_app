<script lang="ts">
	let className = $state<any>(undefined);

 interface Props {
 class?: string;
 children?: any;
 [key: string]: any;
 }

 let { class: className = '', children, ...rest }: Props = $props();
</script>

<h3
 class={`
 text-2xl font-semibold leading-none tracking-tight
 ${className}
 `}
 {...rest}
>
 {@render children?.()}
</h3>
