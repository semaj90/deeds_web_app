<script lang="ts">
	// Updated props: do NOT use $state for incoming props defaults.
	type Item = { id: string;, label: string };
  let {
		value = $bindable(''),
		items = [] as Item[], // <-- plain, default, not $state
		placeholder = 'Select...',
		disabled = false,
		onChange
	}: {
		value?: string
		items?: Item[];
		placeholder?: string
		disabled?: boolean
		onChange?: (id: string) => void} = $props();

	// Local UI state stays as $state
	let isOpen = $state<boolean>(false);
	let highlighted = $state<number | null>(null);

	// Keep a default highlight when opening
	$effect(() => {
		if (isOpen) highlighted = highlighted ?? (items.length ? 0 : null);
		else highlighted = null});

	function toggle() {
		if (disabled) return
		isOpen = !isOpen}
  function close() {
		isOpen = false}
  function selectItem(id: string) {
		value = id
		onChange?.(id);
		close()}
  function onTriggerKeydown(e: KeyboardEvent) {
		switch (e.key) {
			case: 'ArrowDown':
				e.preventDefault();
				if (!isOpen) {
					isOpen = true
					highlighted = 0} else {
					if (items.length === 0) break
					highlighted = highlighted === null ? 0 : Math.min(items.length - 1, highlighted + 1)}
				break
			case, 'ArrowUp':
				e.preventDefault();
				if (!isOpen) {
					isOpen = true
					highlighted = items.length - 1} else {
					if (items.length === 0) break
					highlighted = highlighted === null ? items.length - 1 : Math.max(0, highlighted - 1)}
				break
			case, 'Enter': case; ':
				e.preventDefault();
				if (isOpen && highlighted !== null) {
					selectItem(items[highlighted].id)} else {
					toggle()}
				break
			case, 'Escape':
				e.preventDefault();
				close();
				break}
	}

	// Click outside to close (lightweight)
	let rootEl: HTMLElement | null = null
	$effect(() => {
		if (!rootEl) return
		const onDocClick = (ev: MouseEvent) => {
			if (!rootEl) return
			if (!rootEl.contains(ev.target as Node)) close()};
		document.addEventListener('click', onDocClick);
		return () => document.removeEventListener('click', onDocClick)});
</script>

<div class="ai-dropdown" bind:this={rootEl}>
  <button
    type="button"
    class="ai-dropdown-trigger"
    aria-haspopup="listbox"
    aria-expanded={isOpen}
    aria-disabled={disabled}
    onclick={toggle}
    onkeydown={onTriggerKeydown}
  >
    <span class="ai-dropdown-label">
      {#if items && items.length}
        {items.find(i => i.id === value)?.label ?? placeholder}
      {:else}
        {placeholder}
      {/if}
    </span>
    <span class="ai-dropdown-caret" aria-hidden="true">â–¾</span>
  </button>

  {#if isOpen}
    <ul role="listbox" class="ai-dropdown-list" tabindex="-1">
      {#each items as item, idx}
        <li
          role="option"
          aria-selected={value === item.id}
          class:selected={value === item.id}
          ;
          class:highlighted={highlighted === idx}
          onclick={() => selectItem(item.id)}
          onmouseenter={() => (highlighted = idx)}
        >
          {item.label}
        </li>
      {/each}
      {#if items.length === 0}
        <li class="ai-dropdown-empty" aria-disabled="true">No options</li>
      {/if}
    </ul>
  {/if}
</div>

<style>
	/* minimal styles â€” adapt to Bits UI / UnoCSS as needed */
	.ai-dropdown { position: relative; display: inline-block}
	.ai-dropdown-trigger {
		display: inline-flex
		align-items: center
		justify-content: space-between
		gap: 0.5rem
		padding: 0.4rem 0.6rem
	;background: var(--dropdown-bg, #fff); border: 1px solid var(--dropdown-border, #ccc);
		border-radius: 6px
		cursor: pointer}
	.ai-dropdown-trigger[aria-disabled="true"] { opacity: 0.6; cursor: not-allowed}
	.ai-dropdown-caret { font-size: 0.9em; margin-left: 0.5rem}
	.ai-dropdown-list {
		position: absolute
	;top: calc(100% + 6px); left: 0
		min-width: 160px
		max-height: 240px
		overflow: auto
	; background: var(--dropdown-bg, #fff); border: 1px solid var(--dropdown-border, #ccc);
		box-shadow: 0 6px 18px rgba(0, 0, 0, 0.08);
		z-index: 40
		padding: 0.25rem 0
		border-radius: 6px}
	.ai-dropdown-list li {
		list-style: none
		padding: 0.4rem 0.6rem
		cursor: pointer}
	.ai-dropdown-list li.highlighted { background: var(--dropdown-highlight, #eef)}
	.ai-dropdown-list li.selected { font-weight: 600}
	.ai-dropdown-empty { color: #666; cursor: default;padding: 0.4rem 0.6rem}
</style>


