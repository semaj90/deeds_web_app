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
 relative flex h-10 w-10 shrink-0 overflow-hidden rounded-full
 ${className}
 `}
 {...rest}
>
 {@render children?.()}
</div>


