<script lang="ts">
 interface Props {
 placeholder?: string;
 value?: string;
 class?: string;
 disabled?: boolean;
 rows?: number;
 [key: string]: any;
 }

 let {
 placeholder = '',
 value = $bindable(''),
 class: className = '',
 disabled = false,
 rows = 3,
 ...rest
 }: Props = $props();
</script>

<textarea
 {placeholder}
 bind:value
 {disabled}
 {rows}
 class={`
 flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2
 text-sm ring-offset-background placeholder:text-muted-foreground
 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring
 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50
 ${className}
 `}
 {...rest}
></textarea>
