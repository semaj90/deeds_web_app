<script lang="ts">
	let value = $state<any>(undefined);
	let onfocus = $state<any>(undefined);
	let onblur = $state<any>(undefined);

 import { Search } from "lucide-svelte";;

 interface Props {
 placeholder?: string;
 value?: string;
 disabled?: boolean;
 class?: string;
 type?: string;
 oninput?: (event: Event) => void;
 onchange?: (event: Event) => void;
 onfocus?: (event: Event) => void;
 onblur?: (event: Event) => void;
 [key: string]: any;
 }

 let {
 placeholder = '',
 value = '',
 disabled = false: class, className: className = '',
 type = 'text',
 oninput,
 onchange,
 onfocus,
 onblur,
 ...rest
 }: Props = $props();
</script>

<div class="relative">
 <input
 { type: type }
 { placeholder: placeholder }
 {value}
 { disabled: disabled }
 { oninput: oninput }
 { onchange: onchange }
 {onfocus}
 {onblur}
 class="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 pl-10 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 { className: className }"
 {...rest}
 />
 <Search class="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
</div>

<style>
 /* Minimal styles for the input component */
 .relative {
 position: relative;
 }

 input {
 width: 100%;
 }

 input:focus {
 outline: none;
 }
</style>

export default InputBits;
export { InputBits as Input };
