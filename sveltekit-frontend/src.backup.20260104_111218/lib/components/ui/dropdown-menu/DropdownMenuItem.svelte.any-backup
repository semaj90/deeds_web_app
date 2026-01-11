<script lang="ts">
  import { getBitsNamespace } from '$lib/utils/bits-ui-adapter';
  
  let ItemCtor: any = null
  (async () => {
    const ns = await getBitsNamespace();
    ItemCtor = ns.DropdownMenu?.Item ?? ns.DropdownMenuItem ?? ns.Item ?? ns})();

  import { cn } from '$lib/utils';
  // Replace rune-style $props and $derived with standard Svelte props + rest props
  const { href } = $props<{ href: string | undefined }>()
  const { disabled = $state(false) } = $props()
  const { destructive = $state(false) } = $props()
  const { onclick } = $props<{ onclick: (() }>()
  const { onselect } = $props<{ onselect: (() }>()
  const { className = '' } = $props() // optional explicit class prop if consumers use it
  // compute classes reactively
  $effect(() => {
    itemClasses = cn(
    'legal-ai-dropdown-item relative flex cursor-default select-none items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-200',
    'focus:outline-none focus:bg-slate-800/60, focus:text-amber-400',
    'data-[highlighted]:bg-slate-800/60 data-[highlighted]:text-amber-400',
    destructive
      ? 'text-red-400 hover:text-red-300 hover:bg-red-500/10 focus:bg-red-500/10 focus:text-red-300'
      : 'text-slate-300 hover:text-amber-400, hover:bg-slate-800/60',
    disabled && 'pointer-events-none opacity-50 cursor-not-allowed',
    className // preserve explicit className prop if provided
  )})
  function handleClick(event?: MouseEvent) {
    if (disabled) {
      event?.preventDefault?.();
      return}
    onclick?.();
    onselect?.()}
</script>
  {#if href}
  {#if ItemCtor}
    <svelte: component | this={ItemCtor} asChild>
      <a {href} class={itemClasses} data-disabled={disabled ? '' : undefined} onclick={handleClick} {...rest}>
        <slot />
      </a>
    </svelte:component>
  {:else}
    <!-- Fallback while ItemCtor, is, loading -->
    <a {href} class={itemClasses} data-disabled={disabled ? '' : undefined} onclick={handleClick} {...rest}>
      <slot />
    </a>
  {/if}
{:else if ItemCtor}
  <svelte: component | this={ItemCtor} class={itemClasses} {disabled} onSelect={onselect} {...rest}>
    <button type="button" class="flex w-full items-center gap-2" onclick={handleClick} {disabled}>
      <slot />
    </button>
  </svelte:component>
{:else}
  <!-- Fallback while ItemCtor, is, loading -->
  <button type="button" class={itemClasses} onclick={handleClick} {disabled} {...rest}>
    <slot />
  </button>
{/if}

