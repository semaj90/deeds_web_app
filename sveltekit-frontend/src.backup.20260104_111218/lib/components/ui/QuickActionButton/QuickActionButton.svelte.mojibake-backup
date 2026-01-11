<script lang="ts">
  let { icon = null, variant = 'default', disabled = false, ariaLabel = undefined } = $props<{
    icon?: string | null;
    variant?: 'default' | 'secondary' | 'destructive' | 'outline' | 'ghost' | 'link';
    disabled?: boolean;
    ariaLabel?: string;
  }>();
</script>

<button type="button" class={`quick-action ${variant}`} {disabled} aria-label={ariaLabel}>
  {#if icon}
    <span class={`icon ${icon}`} aria-hidden="true"></span>
  {/if}
  <span class="label"><slot /></span>
</button>

<style>
  .quick-action {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 0.75rem;
    border-radius: 6px;
    border: 1px solid rgba(0, 0, 0, 0.06);
    background: var(--button-bg, #f7f9fc);
    color: var(--button-fg, #111);
    cursor: pointer;
    font-size: 0.9rem;
  }
  .quick-action.destructive {
    background: #ffecec;
    color: #9b1c1c;
  }
  .quick-action.link {
    background: transparent;
    border: none;
    color: var(--accent, #007bff);
    padding: 0.25rem 0.5rem;
  }
  .quick-action:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }
  .label {
    line-height: 1;
  }
</style>
