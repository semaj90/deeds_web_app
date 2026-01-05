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
 flex flex-col space-y-1.5 p-6
 ${ className: className }
 `}
 {...rest}
>
 {@render children?.()}
</div>
