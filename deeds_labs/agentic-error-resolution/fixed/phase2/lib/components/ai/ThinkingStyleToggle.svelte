<!-- @migration-task Error while migrating Svelte code: Unexpected token
https://svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: Unexpected token
https://svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: Unexpected token
https://svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: Unexpected token
https://svelte.dev/e/js_parse_error -->
<!-- Enhanced ThinkingStyleToggle with Nier Automata + Harvard Crimson Theme -->
<script lang="ts">
  // Svelte 5 runes are auto-imported
  let {
    enabled = $bindable(false),
    loading = false,
    premium = true,
    size = 'md',
    ontoggle,
    onconfigure,
    onupgrade
  }: {
    enabled?: boolean;
    loading?: boolean;
    premium?: boolean;
    size?: 'sm' | 'md' | 'lg';
    ontoggle?: (_event: { enabled: boolean }) => void;
    onconfigure?: () => void;
    onupgrade?: () => void;
  } = $props();
  import type { fade, slide, scale  } from 'svelte/transition';
  import type { Brain, Zap, Settings, Crown, Info  } from 'lucide-svelte';
  import  Button  from "$lib/components/ui/enhanced-bits.svelte";
  import type { cn  } from '$lib/utils';
  let showTooltip = $state(false);
  let showConfig = $state(false);
  let thinkingDepth = $state('detailed');
  let focusAreas = $state({ precedents: true
    evidence: true, compliance: true;
    alternatives: false });
  let iconSize = $derived(size === 'sm' ? 16 : size === 'md' ? 20 : 24);
  let buttonClass = $derived(cn(
    'thinking-toggle',
    size,
    enabled ? 'enabled' : 'disabled',
    loading ? 'loading' : '',
    !premium ? 'premium-required' : ''
  ));
  function handleToggle() {
    if (!premium) {
      onupgrade?.();
      return;
    }
    enabled = !enabled;
    ontoggle?.({ enabled });
  }
  function handleConfigure() {
    if (!premium) return;
    showConfig = !showConfig;
    onconfigure?.();
  }
  function handleUpgrade() {
    onupgrade?.();
  }
</script>
<div class="thinking-style-control">
  <!-- Main Toggle Button -->
  <div
    class="toggle-container"
    onmouseenter={() => (showTooltip = true)}
    onmouseleave={() => (showTooltip = false)}
    role="button"
    tabindex="0"
  >
    <Button
      variant={enabled ? 'crimson' : 'nier'}
      size={size === 'sm' ? 'sm' : size === 'lg' ? 'lg' : 'default'}
      disabled={loading || (!premium && !enabled)}
      onclick={handleToggle}
      class={cn(
        'thinking-toggle-btn transition-all duration-300',
        enabled && 'animate-crimson-glow',
        loading && 'animate-nier-pulse'
      )}
    >
      <div class="icon-container">
        {#if loading}
          <div class="loading-spinner nier-glow"></div>
        {:else if enabled}
          <Brain size={iconSize} class="text-current" />
        {:else}
          <Zap size={iconSize} class="text-current" />
        {/if}
      </div>
      <span class="toggle-text ml-2">
        {#if loading}
          Analyzing...
        {:else if enabled}
          Thinking Style
        {:else}
          Quick Mode
        {/if}
      </span>
      {#if premium && enabled}
        <Crown size={12} class="ml-2 text-harvard-gold opacity-80" />
      {/if}
    </Button>
    <!-- Configuration Button -->
    {#if premium}
      <Button
        variant="ghost"
        size="sm"
        onclick={handleConfigure}
        class="config-btn ml-2 bits-btn bits-btn"
        disabled={loading}
      >
        <Settings size={14} />
      </Button>
    {/if}
    <!-- Info Button for non-premium users -->
    {#if !premium}
      <Button variant="ghost" size="sm" onclick={handleUpgrade} class="upgrade-btn ml-2 bits-btn bits-btn">
        <Info size={14} class="text-harvard-gold" />
      </Button>
    {/if}
    <!-- Tooltip -->
    {#if showTooltip}
      <div class="tooltip" transitifade={{ duration 200 }}>
        {#if !premium}
          <div class="tooltip-content premium-required">
            <Crown class="h-4 w-4 text-harvard-gold" />
            <div>
              <strong>Premium Feature</strong>
              <p>Thinking Style requires Premium access for advanced AI reasoning</p>
            </div>
          </div>
        {:else if enabled}
          <div class="tooltip-content">
            <Brain class="h-4 w-4 text-harvard-crimson" />
            <div>
              <strong>Thinking Style Active</strong>
              <p>AI shows step-by-step reasoning process</p>
              <div class="feature-list">
                <span class="feature">• Deeper legal analysis</span>
                <span class="feature">• Transparent reasoning</span>
                <span class="feature">• Higher accuracy</span>
                <span class="feature">• Detailed explanations</span>
              </div>
            </div>
          </div>
        {:else}
          <div class="tooltip-content">
            <Zap class="h-4 w-4 text-harvard-gold" />
            <div>
              <strong>Quick Mode Active</strong>
              <p>Fast AI responses without reasoning details</p>
              <div class="feature-list">
                <span class="feature">• Instant results</span>
                <span class="feature">• Concise answers</span>
                <span class="feature">• Lower resource usage</span>
                <span class="feature">• Basic analysis</span>
              </div>
            </div>
          {/if}
      {/if}
  </div>
  <!-- Configuration Panel -->
  {#if showConfig && premium}
    <div class="config-panel nier-border-glow" transitislide={{ duration 300 }}>
      <div class="config-header">
        <h4 class="text-foreground font-semibold">Thinking Style Configuration</h4>
        <p class="nes-text is-disabled text-sm">Customize AI reasoning parameters</p>
      </div>
      <div class="config-content space-y-4">
        <!-- Reasoning Depth -->
        <div class="setting-group">
          <label for="thinking-depth" class="setting-label"> Reasoning Depth </label>
          <select id="thinking-depth" bind:value={thinkingDepth} class="setting-select">
            <option value="basic">Basic (3-5 steps)</option>
            <option value="detailed">Detailed (5-10 steps)</option>
            <option value="comprehensive">Comprehensive (10+ steps)</option>
          </select>
        </div>
        <!-- Focus Areas -->
        <div class="setting-group">
          <label class="setting-label">Focus Areas</label>
          <div class="checkbox-group space-y-2">
            <label class="checkbox-label">
              <input type="checkbox" bind:checked={focusAreas.precedents} class="checkbox-input" />
              <span>Legal precedents & case law</span>
            </label>
            <label class="checkbox-label">
              <input type="checkbox" bind:checked={focusAreas.evidence} class="checkbox-input" />
              <span>Evidence quality assessment</span>
            </label>
            <label class="checkbox-label">
              <input type="checkbox" bind:checked={focusAreas.compliance} class="checkbox-input" />
              <span>Procedural compliance</span>
            </label>
            <label class="checkbox-label">
              <input type="checkbox" bind:checked={focusAreas.alternatives} class="checkbox-input" />
              <span>Alternative interpretations</span>
            </label>
          </div>
        </div>
      </div>
      <div class="config-actions">
        <Button class="bits-btn" variant="ghost" size="sm" onclick={() => (showConfig = false)}>Cancel</Button>
        <Button class="bits-btn" variant="crimson" size="sm">Save Configuration</Button>
      </div>
    {/if}
  <!-- Premium Upgrade Banner -->
  {#if !premium}
    <div class="premium-banner" transitislide={{ duration 300 }}>
      <div class="premium-content">
        <Crown class="h-5 w-5 text-harvard-gold" />
        <div class="premium-text">
          <strong>Unlock Advanced AI Reasoning</strong>
          <p>Get step-by-step legal analysis with transparent thinking process</p>
        </div>
        <Button class="bits-btn" variant="gold" size="sm" onclick={handleUpgrade}>Upgrade Now</Button>
      </div>
    {/if}
</div>
<style>
  /* @unocss-include */
  .thinking-style-control {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }
  .toggle-container {
    position: relative;
    display: flex;
    align-items: center;
  }
  .thinking-toggle-btn {
    min-width: 140px;
    justify-content: flex-start;
  }
  .icon-container {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
  }
  .loading-spinner {
    width: 16px;
    height: 16px;
    border: 2px solid transparent;
    border-top: 2px solid currentColor;
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }
  @keyframes spin {
    0% {
      transform: rotate(0deg);
    }
    100% {
      transform: rotate(360deg);
    }
  }
  .tooltip {
    position: absolute;
    top: calc(100% + 0.5rem);
    left: 0;
    z-index: 50;
    pointer-events: none;
  }
  .tooltip-content {
    background: var(--color-ui-surface);
    border: 1px solid var(--color-ui-border);
    border-radius: var(--radius);
    padding: 1rem;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
    max-width: 320px;
    display: flex;
    gap: 0.75rem;
    align-items: flex-start;
  }
  .tooltip-content.premium-required {
    background: linear-gradient(135deg, var(--color-accent-gold), var(--color-accent-dark-gold));
    color: var(--color-primary-black);
    border-color: var(--color-accent-gold);
  }
  .tooltip-content strong {
    display: block;
    margin-bottom: 0.25rem;
    color: inherit;
  }
  .tooltip-content p {
    margin-bottom: 0.5rem;
    color: inherit;
    opacity: 0.9;
    line-height: 1.4;
  }
  .feature-list {
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
  }
  .feature {
    font-size: 0.75rem;
    opacity: 0.8;
  }
  .config-panel {
    background: var(--color-ui-surface);
    border: 1px solid var(--color-ui-border);
    border-radius: var(--radius);
    padding: 1.5rem;
    box-shadow: 0 8px 25px rgba(0, 0, 0, 0.3);
  }
  .config-header {
    margin-bottom: 1.5rem;
  }
  .config-content {
    margin-bottom: 1.5rem;
  }
  .setting-group {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  .setting-label {
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--color-ui-text);
  }
  .setting-select {
    width: 100%;
    padding: 0.5rem 0.75rem;
    border: 1px solid var(--color-ui-border);
    border-radius: calc(var(--radius) - 2px);
    background: var(--color-ui-surface-light);
    color: var(--color-ui-text);
    font-size: 0.875rem;
  }
  .setting-select:focus {
    outline: none;
    border-color: var(--color-accent-crimson);
    box-shadow: 0 0 0 2px rgba(165, 28, 48, 0.2);
  }
  .checkbox-group {
    display: flex;
    flex-direction: column;
  }
  .checkbox-label {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.875rem;
    color: var(--color-ui-text);
    cursor: pointer;
  }
  .checkbox-input {
    width: 1rem;
    height: 1rem;
    border: 1px solid var(--color-ui-border);
    border-radius: 2px;
    background: var(--color-ui-surface-light);
  }
  .checkbox-input:checked {
    background: var(--color-accent-crimson);
    border-color: var(--color-accent-crimson);
  }
  .config-actions {
    display: flex;
    gap: 0.75rem;
    justify-content: flex-end;
  }
  .premium-banner {
    background: linear-gradient(135deg, var(--color-accent-gold), var(--color-accent-dark-gold));
    color: var(--color-primary-black);
    border-radius: var(--radius);
    padding: 1rem;
    box-shadow: 0 4px 15px rgba(201, 169, 110, 0.3);
  }
  .premium-content {
    display: flex;
    align-items: center;
    gap: 1rem;
  }
  .premium-text { flex: 1 }
  .premium-text strong {
    display: block;
    margin-bottom: 0.25rem;
    font-weight: 600;
  }
  .premium-text p {
    margin: 0;
    font-size: 0.875rem;
    opacity: 0.9;
  }
  .nier-border-glow {
    position: relative;
  }
  .nier-border-glow::before {
    content: '';
    position: absolute;
    inset: -1px;
    padding: 1px;
    background: linear-gradient(45deg, var(--color-accent-crimson), transparent, var(--color-accent-gold));
    border-radius: inherit;
    mask:
      linear-gradient(#fff 0 0) content-box,
      linear-gradient(#fff 0 0);
    mask-composite: exclud;
    opacity: 0.6;
  }
</style>
