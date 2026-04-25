#!/usr/bin/env node
/**
 * 🎨 Phase 77: UI/UX Training Data Generator
 *
 * Creates training examples focused on:
 * - Component structure and styling
 * - Interactive UI patterns
 * - Accessibility and keyboard navigation
 * - Animations and transitions
 * - Form components and validation
 *
 * Output: uiux_training_data.jsonl
 *
 * Usage:
 *   node scripts/generate-uiux-training-data.mjs
 */

import chalk from 'chalk';
import fs from 'fs/promises';

const UIUX_EXAMPLES = [
	// ============================================
	// COMPONENT STRUCTURE & SCOPED STYLES
	// ============================================
	{
		instruction: 'Create a reusable button component with scoped styles in Svelte 5',
		input: 'I want a button component with variant styles that don\'t affect other buttons',
		output: `Use Svelte's automatic style scoping for component isolation:

\`\`\`svelte
<script>
  let { variant = 'primary', onclick } = $props();
</script>

<button class={variant} {onclick}>
  {@render children?.()}
</button>

<style>
  button {
    padding: 0.5rem 1rem;
    border-radius: 0.25rem;
    font-weight: 600;
    transition: all 0.2s;
  }

  .primary {
    background: #ff3e00;
    color: white;
  }

  .secondary {
    background: #676778;
    color: white;
  }

  button:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  }
</style>
\`\`\`

Styles only affect this component's elements. Use with: \`<Button variant="primary" onclick={handleClick}>Click me</Button>\``
	},
	{
		instruction: 'Build a toast notification system using module-level state',
		input: 'I need centralized toast notifications that work across multiple components',
		output: `Use <script module> to create shared state across component instances:

\`\`\`svelte
<script module>
  let toasts = $state([]);

  export function addToast(message, type = 'info') {
    const id = Date.now();
    toasts.push({ id, message, type });
    setTimeout(() => {
      toasts = toasts.filter(t => t.id !== id);
    }, 3000);
  }
</script>

<script>
  let visible = $derived(toasts.length > 0);
</script>

{#if visible}
  <div class="toast-container">
    {#each toasts as toast (toast.id)}
      <div class="toast {toast.type}">
        {toast.message}
      </div>
    {/each}
  </div>
{/if}

<style>
  .toast-container {
    position: fixed;
    top: 1rem;
    right: 1rem;
    z-index: 9999;
  }

  .toast {
    padding: 1rem;
    margin-bottom: 0.5rem;
    border-radius: 0.5rem;
    animation: slideIn 0.3s ease;
  }

  .info { background: #3b82f6; color: white; }
  .success { background: #10b981; color: white; }
  .error { background: #ef4444; color: white; }

  @keyframes slideIn {
    from { transform: translateX(100%); opacity: 0; }
    to { transform: translateX(0); opacity: 1; }
  }
</style>
\`\`\`

Call \`addToast('Hello!', 'success')\` from anywhere to show notifications.`
	},

	// ============================================
	// INTERACTIVE UI WITH $STATE
	// ============================================
	{
		instruction: 'Create an interactive card component with hover effects',
		input: 'I want a card that responds to hover with smooth animations',
		output: `Track interactive state with $state for responsive UI:

\`\`\`svelte
<script>
  let { title, description, image, href } = $props();
  let isHovered = $state(false);
  let imageLoaded = $state(false);
</script>

<a
  {href}
  class="card"
  class:hovered={isHovered}
  onmouseenter={() => isHovered = true}
  onmouseleave={() => isHovered = false}
>
  <div class="image-wrapper">
    <img
      src={image}
      alt={title}
      class:loaded={imageLoaded}
      onload={() => imageLoaded = true}
    />
  </div>

  <div class="content">
    <h3>{title}</h3>
    <p>{description}</p>
  </div>
</a>

<style>
  .card {
    display: block;
    border-radius: 1rem;
    overflow: hidden;
    background: white;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  }

  .card.hovered {
    transform: translateY(-8px);
    box-shadow: 0 12px 24px rgba(0, 0, 0, 0.15);
  }

  img {
    width: 100%;
    opacity: 0;
    transition: opacity 0.4s, transform 0.3s;
  }

  img.loaded {
    opacity: 1;
  }

  .card.hovered img {
    transform: scale(1.05);
  }
</style>
\`\`\``
	},
	{
		instruction: 'Build an accessible modal dialog with focus management',
		input: 'I need a modal that traps focus and handles keyboard navigation',
		output: `Use $effect for lifecycle management and cleanup:

\`\`\`svelte
<script>
  let { open = $bindable(false), title } = $props();
  let dialog;

  $effect(() => {
    if (!dialog) return;

    if (open) {
      dialog.showModal();
      document.body.style.overflow = 'hidden';
    } else {
      dialog.close();
      document.body.style.overflow = '';
    }

    return () => {
      document.body.style.overflow = '';
    };
  });

  function handleKeydown(e) {
    if (e.key === 'Escape') {
      open = false;
    }
  }
</script>

<dialog
  bind:this={dialog}
  onkeydown={handleKeydown}
  onclick={(e) => {
    if (e.target === dialog) open = false;
  }}
>
  <div class="modal-content">
    <header>
      <h2>{title}</h2>
      <button onclick={() => open = false} aria-label="Close">×</button>
    </header>

    <div class="body">
      {@render children?.()}
    </div>
  </div>
</dialog>

<style>
  dialog {
    border: none;
    border-radius: 1rem;
    padding: 0;
    max-width: 90vw;
    max-height: 90vh;
  }

  dialog::backdrop {
    background: rgba(0, 0, 0, 0.5);
    backdrop-filter: blur(4px);
  }

  header {
    display: flex;
    justify-content: space-between;
    padding: 1.5rem;
    border-bottom: 1px solid #e5e7eb;
  }
</style>
\`\`\``
	},

	// ============================================
	// RESPONSIVE LAYOUTS
	// ============================================
	{
		instruction: 'Create a responsive grid layout component with CSS Grid',
		input: 'I want a grid that automatically adjusts columns based on screen size',
		output: `Use CSS custom properties with CSS Grid for responsive layouts:

\`\`\`svelte
<script>
  let { minWidth = '250px', gap = '1rem', items } = $props();
</script>

<div class="grid" style="--min-width: {minWidth}; --gap: {gap};">
  {#each items as item (item.id)}
    <div class="grid-item">
      {@render children?.(item)}
    </div>
  {/each}
</div>

<style>
  .grid {
    display: grid;
    grid-template-columns: repeat(
      auto-fill,
      minmax(var(--min-width), 1fr)
    );
    gap: var(--gap);
    padding: var(--gap);
  }

  .grid-item {
    container-type: inline-size;
  }

  @media (max-width: 640px) {
    .grid {
      grid-template-columns: 1fr;
    }
  }
</style>
\`\`\`

Usage: \`<Grid items={products} minWidth="300px">{#snippet children(product)}<ProductCard {product} />{/snippet}</Grid>\``
	},

	// ============================================
	// FORM COMPONENTS & VALIDATION
	// ============================================
	{
		instruction: 'Build a form input with validation states and error display',
		input: 'I need an input that shows validation errors with visual feedback',
		output: `Use reactive state with $derived for validation display logic:

\`\`\`svelte
<script>
  let {
    label,
    value = $bindable(''),
    error = '',
    required = false,
    type = 'text',
    placeholder = ''
  } = $props();

  let touched = $state(false);
  let focused = $state(false);

  let showError = $derived(touched && !focused && error);
  let inputClass = $derived(showError ? 'error' : touched ? 'valid' : '');
</script>

<div class="field">
  <label>
    {label}
    {#if required}<span class="required">*</span>{/if}
  </label>

  <input
    {type}
    {placeholder}
    class={inputClass}
    bind:value
    onfocus={() => focused = true}
    onblur={() => {
      focused = false;
      touched = true;
    }}
    aria-invalid={showError}
    aria-describedby={showError ? 'error-msg' : undefined}
  />

  {#if showError}
    <span class="error-msg" id="error-msg">{error}</span>
  {/if}
</div>

<style>
  .field {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  input {
    padding: 0.75rem;
    border: 2px solid #d1d5db;
    border-radius: 0.5rem;
    transition: all 0.2s;
  }

  input:focus {
    outline: none;
    border-color: #3b82f6;
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
  }

  input.valid {
    border-color: #10b981;
  }

  input.error {
    border-color: #ef4444;
  }

  .error-msg {
    color: #ef4444;
    font-size: 0.875rem;
  }
</style>
\`\`\``
	},

	// ============================================
	// KEYBOARD NAVIGATION & ACCESSIBILITY
	// ============================================
	{
		instruction: 'Create a dropdown menu with full keyboard navigation',
		input: 'I need an accessible dropdown that works with arrow keys and escape',
		output: `Implement keyboard navigation with proper ARIA attributes:

\`\`\`svelte
<script>
  let { items, onSelect } = $props();
  let open = $state(false);
  let selectedIndex = $state(0);
  let menuRef;

  function handleKeydown(e) {
    if (!open) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        open = true;
      }
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        selectedIndex = (selectedIndex + 1) % items.length;
        break;
      case 'ArrowUp':
        e.preventDefault();
        selectedIndex = (selectedIndex - 1 + items.length) % items.length;
        break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        onSelect(items[selectedIndex]);
        open = false;
        break;
      case 'Escape':
        open = false;
        break;
    }
  }

  $effect(() => {
    if (open && menuRef) {
      const selected = menuRef.querySelector('[data-selected="true"]');
      selected?.scrollIntoView({ block: 'nearest' });
    }
  });
</script>

<div class="dropdown">
  <button
    class="trigger"
    onclick={() => open = !open}
    onkeydown={handleKeydown}
    aria-expanded={open}
    aria-haspopup="menu"
  >
    Select option
  </button>

  {#if open}
    <ul class="menu" bind:this={menuRef} role="menu">
      {#each items as item, i (item.id)}
        <li
          role="menuitem"
          data-selected={i === selectedIndex}
          class:selected={i === selectedIndex}
          onclick={() => {
            onSelect(item);
            open = false;
          }}
        >
          {item.label}
        </li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  .dropdown {
    position: relative;
  }

  .menu {
    position: absolute;
    top: 100%;
    background: white;
    border: 1px solid #e5e7eb;
    border-radius: 0.5rem;
    box-shadow: 0 10px 25px rgba(0, 0, 0, 0.1);
    max-height: 300px;
    overflow-y: auto;
    z-index: 10;
  }

  li:hover,
  li.selected {
    background: #f3f4f6;
  }
</style>
\`\`\``
	},

	// ============================================
	// LOADING STATES & SKELETONS
	// ============================================
	{
		instruction: 'Build a skeleton loader for async content',
		input: 'I want placeholder UI to show while data is loading',
		output: `Create animated skeleton loaders with CSS animations:

\`\`\`svelte
<script>
  let { type = 'card', count = 1 } = $props();
</script>

<div class="skeleton-container">
  {#each Array(count) as _, i (i)}
    {#if type === 'card'}
      <div class="skeleton-card">
        <div class="skeleton-image"></div>
        <div class="skeleton-text"></div>
        <div class="skeleton-text short"></div>
      </div>
    {:else if type === 'list'}
      <div class="skeleton-list-item">
        <div class="skeleton-avatar"></div>
        <div class="skeleton-content">
          <div class="skeleton-text"></div>
          <div class="skeleton-text short"></div>
        </div>
      </div>
    {/if}
  {/each}
</div>

<style>
  @keyframes shimmer {
    0% { background-position: -200% 0; }
    100% { background-position: 200% 0; }
  }

  .skeleton-container > * {
    background: linear-gradient(
      90deg,
      #f3f4f6 25%,
      #e5e7eb 50%,
      #f3f4f6 75%
    );
    background-size: 200% 100%;
    animation: shimmer 1.5s infinite;
  }

  .skeleton-card {
    border-radius: 1rem;
    margin-bottom: 1rem;
  }

  .skeleton-image {
    aspect-ratio: 16 / 9;
  }

  .skeleton-text {
    height: 1rem;
    margin: 0.75rem 1rem;
    border-radius: 0.25rem;
  }

  .skeleton-text.short {
    width: 60%;
  }

  .skeleton-list-item {
    display: flex;
    gap: 1rem;
    padding: 1rem;
  }

  .skeleton-avatar {
    width: 3rem;
    height: 3rem;
    border-radius: 50%;
  }
</style>
\`\`\``
	},

	// ============================================
	// TABS & NAVIGATION
	// ============================================
	{
		instruction: 'Create a tabs component with animated indicator',
		input: 'I need tabs with a sliding active indicator that follows the selected tab',
		output: `Use $effect to track tab position for smooth animations:

\`\`\`svelte
<script>
  let { tabs, activeTab = $bindable(tabs[0]?.id) } = $props();

  let indicatorStyle = $state('');
  let tabRefs = new Map();

  $effect(() => {
    const activeEl = tabRefs.get(activeTab);
    if (activeEl) {
      indicatorStyle = \`left: \${activeEl.offsetLeft}px; width: \${activeEl.offsetWidth}px;\`;
    }
  });
</script>

<div class="tabs">
  <div class="tab-list" role="tablist">
    {#each tabs as tab (tab.id)}
      <button
        bind:this={tabRefs.set(tab.id, $el)}
        role="tab"
        class="tab"
        class:active={activeTab === tab.id}
        aria-selected={activeTab === tab.id}
        onclick={() => activeTab = tab.id}
      >
        {tab.label}
      </button>
    {/each}
    <div class="indicator" style={indicatorStyle}></div>
  </div>

  <div class="tab-content">
    {#each tabs as tab (tab.id)}
      {#if activeTab === tab.id}
        <div role="tabpanel">
          {@render tab.content?.()}
        </div>
      {/if}
    {/each}
  </div>
</div>

<style>
  .tab-list {
    display: flex;
    position: relative;
    border-bottom: 2px solid #e5e7eb;
  }

  .tab {
    padding: 1rem 1.5rem;
    background: none;
    border: none;
    cursor: pointer;
    color: #6b7280;
    transition: color 0.2s;
  }

  .tab.active {
    color: #3b82f6;
  }

  .indicator {
    position: absolute;
    bottom: -2px;
    height: 2px;
    background: #3b82f6;
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  }
</style>
\`\`\``
	},

	// ============================================
	// TOOLTIPS & POPOVERS
	// ============================================
	{
		instruction: 'Build a tooltip component with smart positioning',
		input: 'I want a tooltip that automatically positions itself to stay in viewport',
		output: `Use $effect to calculate optimal tooltip position:

\`\`\`svelte
<script>
  let { text, position = 'top' } = $props();
  let visible = $state(false);
  let tooltipRef;
  let targetRef;
  let tooltipStyle = $state('');

  $effect(() => {
    if (!visible || !tooltipRef || !targetRef) return;

    const targetRect = targetRef.getBoundingClientRect();
    const tooltipRect = tooltipRef.getBoundingClientRect();

    let top, left;

    if (position === 'top') {
      top = targetRect.top - tooltipRect.height - 8;
      left = targetRect.left + (targetRect.width - tooltipRect.width) / 2;
    } else if (position === 'bottom') {
      top = targetRect.bottom + 8;
      left = targetRect.left + (targetRect.width - tooltipRect.width) / 2;
    }

    // Keep in viewport
    if (left < 8) left = 8;
    if (left + tooltipRect.width > window.innerWidth - 8) {
      left = window.innerWidth - tooltipRect.width - 8;
    }

    tooltipStyle = \`top: \${top}px; left: \${left}px;\`;
  });
</script>

<div class="tooltip-wrapper">
  <div
    bind:this={targetRef}
    onmouseenter={() => visible = true}
    onmouseleave={() => visible = false}
  >
    {@render children?.()}
  </div>

  {#if visible}
    <div
      bind:this={tooltipRef}
      class="tooltip"
      style={tooltipStyle}
      role="tooltip"
    >
      {text}
    </div>
  {/if}
</div>

<style>
  .tooltip-wrapper {
    position: relative;
    display: inline-block;
  }

  .tooltip {
    position: fixed;
    background: #1f2937;
    color: white;
    padding: 0.5rem 0.75rem;
    border-radius: 0.375rem;
    font-size: 0.875rem;
    z-index: 9999;
    pointer-events: none;
    animation: fadeIn 0.15s ease;
  }

  @keyframes fadeIn {
    from { opacity: 0; transform: scale(0.95); }
    to { opacity: 1; transform: scale(1); }
  }
</style>
\`\`\``
	},

	// ============================================
	// SEARCH & AUTOCOMPLETE
	// ============================================
	{
		instruction: 'Create an autocomplete search input with debouncing',
		input: 'I need a search input that shows suggestions while typing with a delay',
		output: `Implement debounced search with $effect:

\`\`\`svelte
<script>
  let { searchFn, placeholder = 'Search...' } = $props();
  let query = $state('');
  let results = $state([]);
  let loading = $state(false);
  let focused = $state(false);

  let showResults = $derived(focused && query.length > 0 && results.length > 0);

  $effect(() => {
    if (query.length === 0) {
      results = [];
      loading = false;
      return;
    }

    loading = true;
    const timeout = setTimeout(async () => {
      results = await searchFn(query);
      loading = false;
    }, 300);

    return () => clearTimeout(timeout);
  });
</script>

<div class="search-container">
  <div class="input-wrapper">
    <input
      type="text"
      {placeholder}
      bind:value={query}
      onfocus={() => focused = true}
      onblur={() => setTimeout(() => focused = false, 200)}
    />
    {#if loading}
      <div class="spinner"></div>
    {/if}
  </div>

  {#if showResults}
    <ul class="results">
      {#each results as result (result.id)}
        <li onclick={() => {
          query = result.name;
          focused = false;
        }}>
          {result.name}
        </li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  .search-container {
    position: relative;
  }

  .input-wrapper {
    position: relative;
  }

  input {
    width: 100%;
    padding: 0.75rem 2.5rem 0.75rem 1rem;
    border: 2px solid #d1d5db;
    border-radius: 0.5rem;
  }

  .spinner {
    position: absolute;
    right: 1rem;
    top: 50%;
    transform: translateY(-50%);
    width: 1rem;
    height: 1rem;
    border: 2px solid #e5e7eb;
    border-top-color: #3b82f6;
    border-radius: 50%;
    animation: spin 0.6s linear infinite;
  }

  @keyframes spin {
    to { transform: translateY(-50%) rotate(360deg); }
  }

  .results {
    position: absolute;
    top: 100%;
    left: 0;
    right: 0;
    margin-top: 0.5rem;
    background: white;
    border: 1px solid #e5e7eb;
    border-radius: 0.5rem;
    box-shadow: 0 10px 25px rgba(0, 0, 0, 0.1);
    max-height: 300px;
    overflow-y: auto;
  }

  li {
    padding: 0.75rem 1rem;
    cursor: pointer;
  }

  li:hover {
    background: #f3f4f6;
  }
</style>
\`\`\``
	}
];

/**
 * Main
 */
async function main() {
	console.log(chalk.cyan.bold('\n🎨 Phase 77: UI/UX Training Data Generation\n'));

	console.log(chalk.green(`✅ Generated ${UIUX_EXAMPLES.length} UI/UX examples\n`));

	// Write JSONL
	const outputPath = 'uiux_training_data.jsonl';
	const jsonlContent = UIUX_EXAMPLES.map((ex) => JSON.stringify(ex)).join('\n');
	await fs.writeFile(outputPath, jsonlContent, 'utf-8');

	const stats = await fs.stat(outputPath);
	const sizeKB = (stats.size / 1024).toFixed(1);

	console.log(chalk.cyan('📊 Summary:\n'));
	console.log(chalk.white(`   Total examples: ${UIUX_EXAMPLES.length}`));
	console.log(chalk.white(`   Output file: ${outputPath}`));
	console.log(chalk.white(`   Size: ${sizeKB} KB\n`));

	// Category breakdown
	const categories = {
		scoped_styles: 0,
		interactive: 0,
		responsive: 0,
		forms: 0,
		accessibility: 0,
		loading: 0,
		navigation: 0,
		tooltips: 0,
		search: 0
	};

	for (const ex of UIUX_EXAMPLES) {
		const inst = ex.instruction.toLowerCase();
		if (inst.includes('scoped') || inst.includes('style')) categories.scoped_styles++;
		if (inst.includes('hover') || inst.includes('interactive')) categories.interactive++;
		if (inst.includes('responsive') || inst.includes('grid')) categories.responsive++;
		if (inst.includes('form') || inst.includes('input') || inst.includes('validation')) categories.forms++;
		if (inst.includes('accessible') || inst.includes('keyboard') || inst.includes('aria')) categories.accessibility++;
		if (inst.includes('skeleton') || inst.includes('loading')) categories.loading++;
		if (inst.includes('tab') || inst.includes('dropdown')) categories.navigation++;
		if (inst.includes('tooltip') || inst.includes('popover')) categories.tooltips++;
		if (inst.includes('search') || inst.includes('autocomplete')) categories.search++;
	}

	console.log(chalk.cyan('📈 Category Breakdown:\n'));
	for (const [cat, count] of Object.entries(categories)) {
		if (count > 0) {
			const percentage = ((count / UIUX_EXAMPLES.length) * 100).toFixed(1);
			console.log(chalk.white(`   ${cat.padEnd(20)} ${count.toString().padStart(2)} (${percentage}%)`));
		}
	}

	console.log(chalk.green('\n✅ Ready to merge with existing datasets!\n'));
	console.log(chalk.gray('Next: Update combine-training-data.mjs to include uiux_training_data.jsonl\n'));
}

main().catch((error) => {
	console.error(chalk.red('Fatal error:'), error);
	process.exit(1);
});
