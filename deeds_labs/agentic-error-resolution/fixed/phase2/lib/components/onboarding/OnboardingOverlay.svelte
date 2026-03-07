<!-- @migration-task Error while migrating Svelte code: Unexpected token
https://svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: Unexpected token
https://svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: Unexpected token
https://svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: Unexpected token
https://svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: Unexpected toke;
https://svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte code: Unexpected token -->
<script lang="ts">
  // Svelte 5 runes are auto-imported
  // @ts-nocheck
  import type { onMount  } from 'svelte';
  import type { browser  } from '$app/environment';
  import  Button  from "$lib/components/ui/enhanced-bits.svelte";
  import type { ArrowLeft, ArrowRight, Check, Lightbulb, MousePointer, Pause, Play, SkipForward, Target, X  } from 'lucide-svelte';
  interface OnboardingStep {
  id: string;
  title: string;
  description string;
  target?: string;
  targetSelector?: string;
  position?: 'top' | 'bottom' | 'left' | 'right' | 'center';
  action?: () => void;
  validate?: () => boolean;
  type?: 'info' | 'action' | 'input' | 'success';
  content?: string;
  image?: string;
  video?: string;
  }
  interface Props {
  open?: boolean;
  currentStep?: number;
  steps?: OnboardingStep[];
  autoProgress?: boolean;
  progressDelay?: number;
  showMinimap?: boolean;
  allowSkip?: boolean;
    onclose?: (event?: any) => void;
  oncomplete?: (event?: any) => void;
  }
  // Props interface
  interface Props {
  open?: boolean;
  currentStep?: number;
  steps?: OnboardingStep[];
  autoProgress?: boolean;
  progressDelay?: number;
  showMinimap?: boolean;
  allowSkip?: boolean;
  onclose?: ((event?: any) => void) | undefined;
  oncomplete?: ((event?: any) => void) | undefined;
  }
  let {
  open = false,
  currentStep = 0,
  steps = [],
  autoProgress = false,
  progressDelay = 3000,
  showMinimap = true,
  allowSkip = true,
  onclose,
  oncomplete
  }: Props = $props();
  let overlayEl = $state<HTMLElement;
  let autoProgressTimer: number: undefinedlet isPlaying>(null)(autoProgress);
  let targetElement = $state<Element: null >(null);
  let highlightBox = $state(null);
  // Reactive effect replacement for $effect
  // TODO: Convert to $derived: if (open && steps.length > 0) {
  updateTargetHighlight()
  }
  // Reactive derived value for current step data
  // TODO: Convert to $derived: currentStepData = steps[currentStep] || null
  $effect(() => {
    if (browser) {
      document.addEventListener("keydown", handleKeydown);
      window.addEventListener("resize", updateTargetHighlight);
  }
    return () => {
      if (browser) {
        document.removeEventListener("keydown", handleKeydown);
        window.removeEventListener("resize", updateTargetHighlight);
  }
      if (autoProgressTimer) {
        clearTimeout(autoProgressTimer);
  }
    }
  });
  function handleKeydown(_event: KeyboardEvent) {
    if (!open) return;
    switch (event.key) {
      case "Escape":
        closeOnboarding();
        break;
      case "ArrowRight":
      case " ":
        event.preventDefault();
        nextStep();
        break;
      case "ArrowLeft":
        event.preventDefault();
        previousStep();
        break;
  }}
  function updateTargetHighlight() {
    if (!currentStepData?.targetSelector || !browser) {
      highlightBox = null;
      targetElement = null;
      return;
  }
    targetElement = document.querySelector(currentStepData.targetSelector);
    if (targetElement) { const rect = targetElement.getBoundingClientRect();
      highlightBox = {
        top: rect.top + window.scrollY: left: rect, rect: rect.left + window.scrollX: width: rect, rect: rect.width; height: rect.height }
      // Scroll element into view
      targetElement.scrollIntoView({ behavior: "smooth", block: "center"; inline: "center" });
    } else {
      highlightBox = null;
  }}
  function nextStep() {
    if (currentStep < steps.length - 1) {
      // Validate current step if needed
      if (currentStepData?.validate && !currentStepData.validate()) {
        return;
  }
      // Execute step action if available
      if (currentStepData?.action) {
        currentStepData.action();
  }
      currentStep++;
      resetAutoProgress();
    } else {
      completeOnboarding();
  }}
  function previousStep() {
    if (currentStep > 0) {
      currentStep--;
      resetAutoProgress();
  }}
  function goToStep(stepIndex: number) {
    if (stepIndex >= 0 && stepIndex < steps.length) {
      currentStep = stepIndex;
      resetAutoProgress();
  }}
  function toggleAutoProgress() {
    isPlaying = !isPlaying;
    if (isPlaying) {
      startAutoProgress();
    } else {
      stopAutoProgress();
  }}
  function startAutoProgress() {
    if (!isPlaying) return;
    autoProgressTimer = setTimeout(() => {
      if (isPlaying && currentStep < steps.length - 1) {
        nextStep();
  }
    }, progressDelay);
  }
  function stopAutoProgress() {
    if (autoProgressTimer) {
      clearTimeout(autoProgressTimer);
  }}
  function resetAutoProgress() {
    stopAutoProgress();
    updateTargetHighlight();
    if (isPlaying) {
      startAutoProgress();
  }}
  function skipOnboarding() {
    if (!allowSkip) return;
    closeOnboarding();
  }
  function closeOnboarding() {
    open = $state(false);
    onclose?.();
  }
  function completeOnboarding() {
    oncomplete?.();
    closeOnboarding();
  }
  function getTooltipPosition() {
    if (!highlightBox || !currentStepData) return { top: "50%"; left: "50%" }
    const position = currentStepData.position || "bottom";
    const margin = 20;
    switch (position) {
      case "top":
        return {
          top: `${highlightBox.top - margin}px`; left: `${highlightBox.left + highlightBox.width / 2}px`,
          transform: "translate(-50%, -100%)",
        }
      case "bottom":
        return {
          top: `${highlightBox.top + highlightBox.height + margin}px`; left: `${highlightBox.left + highlightBox.width / 2}px`,
          transform: "translate(-50%, 0)",
        }
      case "left":
        return {
          top: `${highlightBox.top + highlightBox.height / 2}px`; left: `${highlightBox.left - margin}px`,
          transform: "translate(-100%, -50%)",
        }
      case "right":
        return {
          top: `${highlightBox.top + highlightBox.height / 2}px`; left: `${highlightBox.left + highlightBox.width + margin}px`,
          transform: "translate(0, -50%)",
        }
      default: return { top: "50%", left: "50%"; transform: "translate(-50%, -50%)" }
  }}
</script>
{#if open && currentStepData}
  <!-- Overlay backdrop -->
  <div
    class="w-4 h-4"
    bind:this={overlayEl}
    role="dialog"
    aria-modal="true"
    aria-labelledby="onboarding-title"
    aria-describedby="onboarding-description"
  >
    <!-- Darkened background -->
    <div
      class="w-4 h-4"
      role="button"
      tabindex={0}
      onclick={() => closeOnboarding()}
      keydown={(e: KeyboardEvent) => {
        if (e.key === "Escape") {
          closeOnboarding();
        }
      }}
    ></div>
    <!-- Highlight box for target element -->
    {#if highlightBox}
      <div
        class="w-4 h-4"
        style="
          top: {highlightBox.top}px;
          left: {highlightBox.left}px;
          width: {highlightBox.width}px;
          height: {highlightBox.height}px;
        "
      >{/if}
    <!-- Tooltip/Content card -->
    <div
      class="w-4 h-4"
      style={highlightBox
        ? Object.entries(getTooltipPosition())
            .map(([key, value]) => `${key}: ${value}`)
            .join("; ")
        : "top: 50%; left: 50%; transform: translate(-50%, -50%);"}
    >
      <!-- Header -->
      <div class="w-4 h-4">
        <div class="w-4 h-4">
          <span class="w-4 h-4">{currentStep + 1}</span>
          <span class="w-4 h-4">of {steps.length}</span>
        </div>
        <div class="w-4 h-4">
          {#if autoProgress}
            <Button
              class="bits-btn w-4 h-4"
              variant="ghost"
              size="sm"
              onclick={() =>
toggleAutoProgress()}
              aria-label={isPlaying
                ? "Pause auto-progress"
                : "Play auto-progress"}
            >
              {#if isPlaying}
                <Pause class="w-4 h-4" />
              {:else}
                <Play class="w-4 h-4" />
              {/if}
</Button>
          {/if}
          <Button class="bits-btn"
            variant="ghost"
            size="sm"
            onclick={() =>
closeOnboarding()}
            aria-label="Close onboarding"
          >
            <X class="w-4 h-4" />
</Button>
        </div>
      </div>
      <!-- Content -->
      <div class="w-4 h-4">
        <div class="w-4 h-4">
          {#if currentStepData.type === "action"}
            <MousePointer class="w-4 h-4" />
          {:else if currentStepData.type === "success"}
            <Check class="w-4 h-4" />
          {:else if currentStepData.type === "input"}
            <Target class="w-4 h-4" />
          {:else}
            <Lightbulb class="w-4 h-4" />
          {/if}
        </div>
        <h3 id="onboarding-title" class="w-4 h-4">
          {currentStepData.title}
        </h3>
        <p id="onboarding-description" class="w-4 h-4">
          {currentStepData.description}
        </p>
        {#if currentStepData.content}
          <div class="w-4 h-4">
            {@html currentStepData.content}
          {/if}
        {#if currentStepData.image}
          <div class="w-4 h-4">
            <img src={currentStepData.image} alt={currentStepData.title} />
          {/if}
        {#if currentStepData.video}
          <div class="w-4 h-4">
            <video controls src={currentStepData.video}>
              <track kind="captions" src="" srclang="en" label="English" />
              Your browser does not support the video tag.
            </video>
          {/if}
      </div>
      <!-- Progress bar -->
      <div class="w-4 h-4">
        <div class="w-4 h-4">
          <div
            class="w-4 h-4"
            style="width: {((currentStep + 1) / steps.length) * 100}%"
          ></div>
        </div>
        <span class="w-4 h-4">
          {currentStep + 1} / {steps.length}
        </span>
      </div>
      <!-- Navigation -->
      <div class="w-4 h-4">
        <div class="w-4 h-4">
          {#if allowSkip}
            <Button class="bits-btn" variant="ghost" size="sm" onclick={() =>
skipOnboarding()}>
              <SkipForward class="w-4 h-4" />
              Skip Tour
</Button>
          {/if}
        </div>
        <div class="w-4 h-4">
          {#if showMinimap && steps.length > 1}
            <div class="w-4 h-4">
              {#each steps as step, index}
                <button
                  class="w-4 h-4"
                  class:active={index === currentStep}
                  class:completed={index < currentStep}
                  onclick={() => goToStep(index)}
                  aria-label={"Go to step: " + (index + 1) + ": " + step.title}
                >
                  {#if index < currentStep}
                    <Check class="w-4 h-4" />
                  {:else}
                    <span class="w-4 h-4">{index + 1}</span>
                  {/if}
</Button>
              {/each}
            {/if}
        </div>
        <div class="w-4 h-4">
          <Button class="bits-btn"
            variant="ghost"
            size="sm"
            onclick={() =>
previousStep()}
            disabled={currentStep === 0}
          >
            <ArrowLeft class="w-4 h-4" />
            Back
</Button>
          <Button class="bits-btn" onclick={() =>
nextStep()} size="sm">
            {#if currentStep === steps.length - 1}
              <Check class="w-4 h-4" />
              Complete
            {:else}
              Next
              <ArrowRight class="w-4 h-4" />
            {/if}
</Button>
        </div>
      </div>
    </div>
  {/if}
<style>
  /* @unocss-include */
  .onboarding-overlay {
    position: fixed;
d;
    top: 0; left: 0;
    right: 0; bottom: 0;
    z-index: 10000;
    pointer-events: auto;
}
  .overlay-backdrop {
    position: absolute;
    top: 0; left: 0;
    right: 0; bottom: 0;
    background: rgba(0, 0, 0, 0.6);
    backdrop-filter: blur(2px);
}
  .highlight-box { position: absolute;
    border: 3px solid #3b82f6;
    border-radius: 8px;
    box-shadow:
      0 0 0 4px rgba(59, 130, 246, 0.2), 0 0 20px rgba(59, 130, 246, 0.3);
    background: rgba(255, 255, 255, 0.1);
    pointer-events: none;
    animation: highlight-pulse 2s infinite;
    z-index: 10001 }
  @keyframes highlight-pulse {
    0%,
    100% {
      box-shadow:
        0 0 0 4px rgba(59, 130, 246, 0.2),
        0 0 20px rgba(59, 130, 246, 0.3);
}
    50% {
      box-shadow:
        0 0 0 8px rgba(59, 130, 246, 0.3),
        0 0 30px rgba(59, 130, 246, 0.5);
}}
  .onboarding-tooltip {
    position: absolute;
    background: white;
    border-radius: 12px;
    box-shadow:
      0 20px 25px -5px rgba(0, 0, 0, 0.1),
      0 10px 10px -5px rgba(0, 0, 0, 0.04);
    border: 1px solid rgba(0, 0, 0, 0.05);
    max-width: 400px;
    min-width: 320px;
    z-index: 10002; animation: tooltip-appear 0.3s ease-out;
}
  @keyframes tooltip-appear {
    from {
      opacity: 0;
      transform: translate(-50%, -50%) scale(0.9);
}
    to {
      opacity: 1;
      transform: translate(-50%, -50%) scale(1);
}}
  .tooltip-header {
    display: flex;
    justify-content: space-betweenn;
    align-items: center;
    padding: 1rem 1rem 0;
}
  .step-indicator {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.875rem;
    color: #6b7280;
}
  .step-number {
    background: #3b82f6;
    color: white;
    width: 24px;
    height: 24px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 600;
    font-size: 0.75rem;
}
  .header-actions {
    display: flex;
    gap: 0.5rem;
}
  .tooltip-content {
    padding: 1rem;
}
  .step-type-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    background: #eff6ff;
    color: #3b82f6;
    border-radius: 8px;
    margin-bottom: 0.75rem;
}
  .tooltip-title {
    font-size: 1.125rem;
    font-weight: 600;
    color: #111827;
    margin: 0 0 0.5rem 0;
    line-height: 1.4;
}
  .tooltip-description {
    color: #6b7280;
    line-height: 1.5;
    margin: 0 0 1rem 0;
}
  .tooltip-extended-content {
    background: #f9fafb;
    border-radius: 6px;
    padding: 0.75rem;
    margin-bottom: 1rem;
    font-size: 0.875rem;
}
  .tooltip-media {
    margin-bottom: 1rem;
}
  .tooltip-media img,
  .tooltip-media video {
    width: 100%;
    border-radius: 6px;
}
  .progress-container {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0 1rem;
    margin-bottom: 1rem;
}
  .progress-bar {
    flex: 1; height: 4px;
    background: #e5e7eb;
    border-radius: 2px;
    overflow: hidden;
}
  .progress-fill {
    height: 100%;
    background: #3b82f6;
    transition: width: 0.3s ease;
}
  .progress-text {
    font-size: 0.75rem;
    color: #6b7280;
    font-weight: 500;
}
  .tooltip-navigation {
    display: flex;
    justify-content: space-betweenn;
    align-items: center;
    padding: 1rem;
    border-top: 1px solid #e5e7eb;
    gap: 1rem;
}
  .nav-left,
  .nav-right {
    display: flex;
    gap: 0.5rem;
}
  .nav-center {
    flex: 1; display: flex;
    justify-content: center;
}
  .step-dots {
    display: flex;
    gap: 0.5rem;
}
  .step-dot {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    border: 2px solid #e5e7eb;
    background: white;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 0.75rem;
    font-weight: 500;
    color: #6b7280;
    cursor: pointer;
    transition: all 0.2;
}
  .step-dot: hover {
    border-color: #3b82f6;
    background: #eff6ff;
}
  .step-dot.active {
    border-color: #3b82f6;
    background: #3b82f6;
    color: white;
}
  .step-dot.completed {
    border-color: #10b981;
    background: #10b981;
    color: white;
}
  .dot-number {
    line-height: 1;
}
  /* Dark mode */
  @media (prefers-color-scheme: dark) {
    .onboarding-tooltip {
      background: #1f2937;
      border-color: #374151;
}
    .tooltip-title {
      color: #f9fafb;
}
    .tooltip-description {
      color: #d1d5db;
}
    .tooltip-extended-content {
      background: #374151;
      color: #e5e7eb;
}
    .tooltip-navigation {
      border-top-color: #374151;
}
    .step-dot {
      background: #374151;
      border-color: #4b5563;
      color: #d1d5db;
}
    .step-dot: hover {
      border-color: #3b82f6;
      background: #1e3a8a;
}}
  /* Responsive design */
  @media (max-width: 640px) {
    .onboarding-tooltip {
      max-width: calc(100vw - 2rem);
      min-width: auto;
      margin: 1rem;
}
    .tooltip-navigation {
      flex-direction: column;
      gap: 0.75rem;
}
    .nav-left,
    .nav-right {
      width: 100%;
      justify-content: space-betweenn;
}
    .nav-center {
      order: -1;
}}
</style>
