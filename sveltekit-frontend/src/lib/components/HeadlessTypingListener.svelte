<!--
  HeadlessTypingListener - Tracks user typing behavior
  Provides typing state, contextual prompts, and analytics
-->
<script lang="ts">
  import type { TypingContext, TypingState, TypingEvent } from '$lib/machines/userTypingStateMachine';
// Custom event types for this component
  export interface TypingStateChangeEvent { state: TypingState, context: Partial<TypingContext>;
  }

  export interface ContextualPromptEvent { prompts: string[], context: Partial<TypingContext>;
  }

  export interface AnalyticsUpdateEvent {
    data: any;
  }

  interface Props {
    text?: string;
    element?: HTMLTextAreaElement;
    enableContextualPrompts?: boolean;
    enableAnalytics?: boolean;
    mcpEndpoint?: string;
    // Event handlers are usually passed as props in Svelte 5 but
    // custom events via dispatch are also common for "headless" logic emitting events up
    // We'll support both patterns if possible or stick to dispatch for events.
    onstateChange?: (event: CustomEvent<TypingStateChangeEvent>) => void;
    oncontextualPrompt?: (event: CustomEvent<ContextualPromptEvent>) => void;
    onanalyticsUpdate?: (event: CustomEvent<AnalyticsUpdateEvent>) => void;
  }

  let {
    text = $bindable(''),
    element = $bindable(),
    enableContextualPrompts = true,
    enableAnalytics = true,
    mcpEndpoint = 'http://localhost:3002',
    onstateChange,
    oncontextualPrompt,
    onanalyticsUpdate
  }: Props = $props();

  let currentState: TypingState = $state('idle');
  let typingTimeout: ReturnType<typeof setTimeout> | null = null;
  let lastKeyTime = $state(Date.now());
  let wordCount = $state(0);

  // Derived context - using Partial because we don't have full state machine context here
  const context: Partial<TypingContext> = $derived({
    currentText: text,
    lastActivity: lastKeyTime,
    wordsTyped: text ? text.split(/\s+/).filter(Boolean) : [],
    analytics: enableAnalytics ? {
      userEngagement: wordCount > 50 ? 'high' : wordCount > 20 ? 'medium' : 'low',
      typingPatterns: [],
      sessionDuration: 0,
      totalInteractions: wordCount,
      contextSwitches: 0
    } : undefined
  });

  function updateState(newState: TypingState) {
    if (currentState !== newState) {
      currentState = newState;
      if (onstateChange) {
         // Create event object directly if callback is provided
         // Note: CustomEvent constructor might not be needed if we just call the function with data
         // But signature says CustomEvent, so we respect it.
         onstateChange(new CustomEvent('stateChange', { detail: { state: newState, context }
         }));
      }
    }
  }

  function handleInput() {
    lastKeyTime = Date.now();
    wordCount = text.split(/\s+/).filter(Boolean).length;
    updateState('typing');

    if (typingTimeout) {
      clearTimeout(typingTimeout);
    }

    typingTimeout = setTimeout(() => {
      updateState('waiting_user');

      if (enableContextualPrompts && text.length > 20) {
        generateContextualPrompts();
      }
    }, 1500);
  }

  async function generateContextualPrompts() {
    if (!enableContextualPrompts) return;

    const prompts: string[] = [];

    // Simple keyword-based prompts
    if (text.toLowerCase().includes('evidence')) {
      prompts.push('Would you like to analyze evidence connections?');
    }
    if (text.toLowerCase().includes('case')) {
      prompts.push('Search for similar cases?');
    }
    if (text.length > 100) {
      prompts.push('Generate a summary?');
    }

    if (prompts.length > 0) {
      oncontextualPrompt?.(new CustomEvent('contextualPrompt', {
        detail: { prompts, context }
      }));
    }
  }

  $effect(() => {
    if (element) {
      element.addEventListener('input', handleInput);
      return () => {
        element.removeEventListener('input', handleInput);
        if (typingTimeout) {
          clearTimeout(typingTimeout);
        }
      };
    }
  });

  // Watch for text changes if element is not provided (binding usage)
  $effect(() => {
    if (text && !element) {
      handleInput();
    }
  });
</script>

<!-- Headless component - no visible output -->
