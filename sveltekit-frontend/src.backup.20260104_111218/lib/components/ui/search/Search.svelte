<script lang="ts">
 interface Props {
 class?: string;
 [key: string]: any;
 }

 let { class: className = '', ...rest }: Props = $props();
</script>

<svg
 xmlns="http://www.w3.org/2000/svg"
 viewBox="0 0 24 24"
 fill="none"
 stroke="currentColor"
 stroke-width="2"
 stroke-linecap="round"
 stroke-linejoin="round"
 class={className}
 {...rest}
>
 <circle cx="11" cy="11" r="8"></circle>
 <path d="m21 21-4.35-4.35"></path>
</svg>
