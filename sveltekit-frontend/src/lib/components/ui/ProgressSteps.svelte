<script lang="ts">
  /**
   * ProgressSteps — Workflow Indicator (Progressive Disclosure + Visual Hierarchy)
   * Shows multi-step progress. Great for case intake, evidence upload, onboarding.
   * Implements Doherty Threshold visual feedback on step transitions.
   */
  import Icon from '$lib/components/ui/Icon.svelte';

  interface Step {
    label: string;
    icon?: string;
    description?: string;
  }

  interface Props {
    steps: Step[];
    current: number;
    variant?: 'horizontal' | 'vertical';
    size?: 'sm' | 'md';
  }

  let {
    steps,
    current = 0,
    variant = 'horizontal',
    size = 'md',
  }: Props = $props();

  function stepStatus(i: number): 'completed' | 'active' | 'upcoming' {
    if (i < current) return 'completed';
    if (i === current) return 'active';
    return 'upcoming';
  }
</script>

<nav class="progress-steps {variant} {size}" aria-label="Progress">
  <ol>
    {#each steps as step, i}
      {@const status = stepStatus(i)}
      <li class="step {status}">
        <div class="step-indicator">
          {#if status === 'completed'}
            <div class="step-circle completed">
              <Icon name="check" size={size === 'sm' ? 12 : 14} />
            </div>
          {:else if status === 'active'}
            <div class="step-circle active">
              {#if step.icon}
                <Icon name={step.icon} size={size === 'sm' ? 12 : 14} />
              {:else}
                <span class="step-num">{i + 1}</span>
              {/if}
            </div>
          {:else}
            <div class="step-circle upcoming">
              <span class="step-num">{i + 1}</span>
            </div>
          {/if}
          {#if i < steps.length - 1}
            <div class="step-connector {status === 'completed' ? 'filled' : ''}"></div>
          {/if}
        </div>
        <div class="step-content">
          <span class="step-label">{step.label}</span>
          {#if step.description && variant === 'vertical'}
            <span class="step-desc">{step.description}</span>
          {/if}
        </div>
      </li>
    {/each}
  </ol>
</nav>

<style>
  .progress-steps ol {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  /* ═══ HORIZONTAL ═══ */
  .horizontal ol {
    display: flex;
    align-items: flex-start;
    gap: 0;
  }

  .horizontal .step {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
    flex: 1;
    min-width: 0;
  }

  .horizontal .step-indicator {
    display: flex;
    align-items: center;
    width: 100%;
    position: relative;
  }

  .horizontal .step-circle {
    flex-shrink: 0;
    z-index: 1;
    margin: 0 auto;
  }

  .horizontal .step-connector {
    position: absolute;
    top: 50%;
    left: calc(50% + 1rem);
    right: calc(-50% + 1rem);
    height: 2px;
    background: rgba(212, 199, 163, 0.1);
    transform: translateY(-50%);
  }

  .horizontal .step-connector.filled {
    background: rgba(52, 211, 153, 0.5);
  }

  /* ═══ VERTICAL ═══ */
  .vertical ol {
    display: flex;
    flex-direction: column;
    gap: 0;
  }

  .vertical .step {
    display: flex;
    align-items: flex-start;
    gap: 0.75rem;
  }

  .vertical .step-indicator {
    display: flex;
    flex-direction: column;
    align-items: center;
    flex-shrink: 0;
  }

  .vertical .step-connector {
    width: 2px;
    height: 1.5rem;
    background: rgba(212, 199, 163, 0.1);
  }

  .vertical .step-connector.filled {
    background: rgba(52, 211, 153, 0.5);
  }

  /* ═══ STEP CIRCLES ═══ */
  .step-circle {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 2rem;
    height: 2rem;
    border-radius: 50%;
    font-family: 'JetBrains Mono', monospace;
    transition: all 0.25s ease;
  }

  .sm .step-circle {
    width: 1.5rem;
    height: 1.5rem;
  }

  .step-circle.completed {
    background: rgba(52, 211, 153, 0.2);
    border: 2px solid rgba(52, 211, 153, 0.6);
    color: #6ee7b7;
  }

  .step-circle.active {
    background: rgba(96, 165, 250, 0.15);
    border: 2px solid rgba(96, 165, 250, 0.6);
    color: #93c5fd;
    box-shadow: 0 0 0 4px rgba(96, 165, 250, 0.1);
    animation: pulse-ring 2s ease-in-out infinite;
  }

  .step-circle.upcoming {
    background: rgba(212, 199, 163, 0.04);
    border: 2px solid rgba(212, 199, 163, 0.15);
    color: rgba(212, 199, 163, 0.3);
  }

  @keyframes pulse-ring {
    0%, 100% { box-shadow: 0 0 0 4px rgba(96, 165, 250, 0.1); }
    50% { box-shadow: 0 0 0 6px rgba(96, 165, 250, 0.05); }
  }

  .step-num {
    font-size: 0.6875rem;
    font-weight: 600;
  }

  .sm .step-num {
    font-size: 0.5625rem;
  }

  /* ═══ LABELS ═══ */
  .step-content {
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
    min-width: 0;
  }

  .step-label {
    font-size: 0.75rem;
    font-weight: 500;
    color: rgba(212, 199, 163, 0.5);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .horizontal .step-content {
    text-align: center;
  }

  .active .step-label {
    color: rgba(212, 199, 163, 0.9);
    font-weight: 600;
  }

  .completed .step-label {
    color: rgba(52, 211, 153, 0.7);
  }

  .step-desc {
    font-size: 0.6875rem;
    color: rgba(212, 199, 163, 0.35);
    line-height: 1.4;
  }

  .active .step-desc {
    color: rgba(212, 199, 163, 0.55);
  }
</style>
