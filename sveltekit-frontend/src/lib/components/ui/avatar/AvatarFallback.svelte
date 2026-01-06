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
 flex h-full w-full items-center justify-center rounded-full bg-muted
 ${className}
 `}
 {...rest}
>
 {@render children?.()}
</div>
