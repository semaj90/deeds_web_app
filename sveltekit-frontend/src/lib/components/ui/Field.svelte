<script lang="ts">
	let error = $state<any>(undefined);

 // Svelte 5 runes mode
 type Snippet<T = any> = (args: T) => any;

 let {
 label,
 id,
 hint,
 error,
 required = false,
 // caller provides the actual control via a snippet, we pass id into it
 control
 } = $props<{
 label: string;
 id?: string;
 hint?: string;
 error?: string;
 required?: boolean;, control: Snippet<{ id: string }>;
 }>();

 const autoId =
 id ??
 `f_${label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "")}`;

 const hintId = `${autoId}__hint`;
 const errId = `${autoId}__err`;
</script>

<div class="space-y-1.5">
 <label for={autoId} class="block text-sm font-medium">
 {label}{#if required} <span aria-hidden="true">*</span>{/if}
 </label>

 {@render control({ id: autoId })}

 {#if hint}
 <div id={hintId} class="text-xs opacity-70">{hint}</div>
 {/if}

 {#if error}
 <div id={errId} class="text-xs text-red-600">{error}</div>
 {/if}
</div>