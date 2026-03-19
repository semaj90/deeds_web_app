<script lang="ts">
  /**
   * EmptyState — UI/UX Error Handling + Affordance
   * Shows a clear, actionable empty state when there's no data.
   * Reduces cognitive load (Miller's Law) with a single clear action.
   */
  import type { Snippet } from 'svelte';
  import Icon from '$lib/components/ui/Icon.svelte';

  interface Props {
    icon?: string;
    title?: string;
    description?: string;
    actionLabel?: string;
    actionHref?: string;
    onaction?: () => void;
    variant?: 'default' | 'compact' | 'card';
    children?: Snippet;
  }

  let {
    icon = 'inbox',
    title = 'No items yet',
    description = '',
    actionLabel = '',
    actionHref = '',
    onaction,
    variant = 'default',
    children,
  }: Props = $props();
</script>

<div class="empty-state {variant}" role="status">
  <div class="empty-icon">
    <Icon name={icon} size={variant === 'compact' ? 24 : 40} />
  </div>
  <h3 class="empty-title">{title}</h3>
  {#if description}
    <p class="empty-desc">{description}</p>
  {/if}
  {#if children}
    <div class="empty-slot">
      {@render children()}
    </div>
  {/if}
  {#if actionLabel}
    {#if actionHref}
      <a href={actionHref} class="empty-action">
        <Icon name="plus" size={14} />
        {actionLabel}
      </a>
    {:else if onaction}
      <button class="empty-action" onclick={onaction}>
        <Icon name="plus" size={14} />
        {actionLabel}
      </button>
    {/if}
  {/if}
</div>

<style>
  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
    padding: 3rem 2rem;
    gap: 0.75rem;
  }

  .empty-state.compact {
    padding: 1.5rem 1rem;
    gap: 0.5rem;
  }

  .empty-state.card {
    padding: 2.5rem 2rem;
    background: linear-gradient(180deg, rgba(17, 24, 39, 0.74) 0%, rgba(10, 15, 25, 0.9) 100%);
    border: 1px dashed rgba(126, 231, 255, 0.16);
    border-radius: 1.5rem;
  }

  .empty-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 4rem;
    height: 4rem;
    border-radius: 50%;
    background: radial-gradient(circle at top, rgba(126, 231, 255, 0.16), rgba(83, 183, 255, 0.08));
    color: rgba(183, 224, 255, 0.76);
    margin-bottom: 0.25rem;
  }

  .compact .empty-icon {
    width: 2.75rem;
    height: 2.75rem;
  }

  .empty-title {
    margin: 0;
    font-size: 0.9375rem;
    font-weight: 600;
    color: rgba(233, 240, 255, 0.88);
    letter-spacing: 0.01em;
  }

  .compact .empty-title {
    font-size: 0.8125rem;
  }

  .empty-desc {
    margin: 0;
    font-size: 0.8125rem;
    color: rgba(184, 198, 226, 0.72);
    max-width: 28rem;
    line-height: 1.5;
  }

  .empty-slot {
    margin-top: 0.5rem;
  }

  .empty-action {
    display: inline-flex;
    align-items: center;
    gap: 0.375rem;
    margin-top: 0.5rem;
    padding: 0.75rem 1.15rem;
    font-size: 0.8125rem;
    font-weight: 700;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    color: rgba(233, 240, 255, 0.92);
    background: linear-gradient(135deg, rgba(126, 231, 255, 0.18) 0%, rgba(83, 183, 255, 0.18) 52%, rgba(255, 212, 121, 0.16) 100%);
    border: 1px solid rgba(126, 231, 255, 0.2);
    border-radius: 999px;
    cursor: pointer;
    text-decoration: none;
    transition: all 0.15s ease;
    box-shadow: 0 16px 30px rgba(0, 0, 0, 0.2);
  }

  .empty-action:hover {
    background: linear-gradient(135deg, rgba(126, 231, 255, 0.28) 0%, rgba(83, 183, 255, 0.24) 52%, rgba(255, 212, 121, 0.2) 100%);
    border-color: rgba(126, 231, 255, 0.3);
    transform: translateY(-1px);
    box-shadow: 0 20px 34px rgba(0, 0, 0, 0.24);
  }

  .empty-action:active {
    transform: translateY(0);
  }
</style>
