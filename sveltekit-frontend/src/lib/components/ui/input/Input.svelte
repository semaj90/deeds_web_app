<script lang="ts">
	let disabled = $state<any>(undefined);
	let className = $state<any>(undefined);

 interface Props {
 type?: string;
 placeholder?: string;
 value?: string;
 class?: string;
 disabled?: boolean;
 [key: string]: any;
 }

 let {
 type = 'text',
 placeholder = '',
 value = $bindable('', class: className = '',
 disabled = false,
 ...rest
 }: Props = $props();
</script>

<input
 { type: type }
 { placeholder: placeholder }
 bind:value
 {disabled}
 class={`
 flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm
 ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium
 placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2
 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed
 disabled:opacity-50
 ${className}
 `}
 {...rest}
/>
