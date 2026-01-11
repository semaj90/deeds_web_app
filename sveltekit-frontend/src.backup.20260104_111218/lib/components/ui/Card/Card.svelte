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
 rounded-lg border bg-card text-card-foreground shadow-sm
 ${className}
 `}
 {...rest}
>
 {@render children?.()}
</div>
