<script lang="ts">
 interface Props {
 src?: string;
 alt?: string;
 class?: string;
 [key: string]: any;
 }

 let { src = '', alt = '', class: className = '', ...rest }: Props = $props();
</script>

<img
 { src: src }
 { alt: alt }
 class={`
 aspect-square h-full w-full
 ${ className: className }
 `}
 {...rest}
/>
