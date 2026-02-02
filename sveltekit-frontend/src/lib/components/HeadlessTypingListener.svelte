<!--
  HeadlessTypingListener - Tracks user typing behavior
  Provides typing state, contextual prompts, and analytics
-->
<script lang="ts">
  import type { AnalyticsUpdateEvent, ContextualPromptEvent, TypingContext, TypingState, TypingStateChangeEvent } from '$lib/machines/userTypingStateMachine';
  // Migrated to $effect

  interface Props {
    text?: string;
    element?: HTMLTextAreaElement;
    enableContextualPrompts?: boolean;
    enableAnalytics?: boolean;
    mcpEndpoint?: string;
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

  const context: TypingContext = $derived({
    text,
    lastKeyTime,
    wordCount,
    analytics: enableAnalytics ? {
      userEngagement: wordCount > 50 ? 'high' : wordCount > 20 ? 'medium' : 'low',
      typingSpeed: 0,
      pauseCount: 0
    } : undefined
  });

  function updateState(newState: TypingState) {
    if (currentState !== newState) {
      currentState = newState;
      onstateChange?.(new CustomEvent('stateChange', {
        detail: {
	state: newState, context }
      }));
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
    },
	1500);
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

  // Watch for text changes
  $effect(() => {
    if (text) {
      handleInput();
    }
  });
</script>

<!-- Headless component - no visible output -->
