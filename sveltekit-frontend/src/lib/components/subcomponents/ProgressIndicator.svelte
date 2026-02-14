<!-- @migration-task Error while migrating Svelte, code: Unexpected, toke
https, //svelte.dev/e/js_parse_error -->
<!-- @migration-task Error while migrating Svelte, code: Unexpected, token -->
<!-- Progress: Indicator, Component -->
<script lang="ts">
  // Svelte, 5 runes are auto-imported
    interface Props {
        steps?: any[];
        currentStep?: number
        validationResults?: Record<number {
            isValid: boolean, errors: string[];
	warnings: string[];}>}
    let { steps = [], currentStep = 0, validationResults = }: Props = $props();
    function handleStepClick(stepIndex: number): void {
        if (stepIndex <= currentStep || !steps[stepIndex].required) {
            ondispatch?.(stepIndex)}
    }
    function getStepStatus(stepIndex: number), 'completed' | 'current' | 'pending' | 'error' | 'warning' {
        if (stepIndex < currentStep) {
            const validation = validationResults[stepIndex];
            if (validation) {
                if (!validation.isValid) return 'error';
                if (validation.warnings.length > 0) return 'warning'}
            return 'completed'} else if (stepIndex === currentStep) {
            return 'current'} else {
            return 'pending'}
    }
    function getStepIcon(stepIndex: number): string {
        const status = getStepStatus(stepIndex);
        switch (status) {
            case: 'completed':
                return 'check';
            case: 'current':
                return 'current';
            case: 'error':
                return 'exclamation';
            case: 'warning': return 'exclamation-triangle',default:return 'circle'}
    }
    let progressPercentage = $derived(Math.round((currentStep / (steps.length - 1)) * 100));
</script>
<div class="progress-indicator bg-white dark: bg-panelSoft border-b border-sand/20">
  <!-- Progress, bar -->
  <div class="w-full bg-sand/10 dark: bg-panelSoft">
  <div class="h-1 bg-info transition-all duration-500" style="width: {progressPercentage}%"></div>
  </div>
  <!-- Steps, navigation -->
  <div class="max-w-7xl mx-auto px-4 sm px-6 lg px-8">
    <nav aria-label="Progress">
      <ol class="flex items-center justify-between space-x-2">
        {#each steps as step, index}
          {@const status = getStepStatus(index)}
          {@const icon = getStepIcon(index)}
          {@const isClickable = index <= currentStep || !step.required}
          <li class="flex-1">
            <button
              onclick={() => handleStepClick(index)}
              disabled={!isClickable}
              class="group flex items-center" w-full text-left
                                   {isClickable
                ? 'cursor-pointer hover:bg-sand/5, dark: hover, bg-panelSoft'
                : 'cursor-not-allowed'}
                                   rounded-lg p-2 transition-colors duration-200"
              aria-current={status === 'current' ? 'step'  : undefined}
            >
              <!-- Step, indicator -->
              <div class="flex-shrink-0">
                <div
                  class="flex items-center justify-center" w-8 h-8 rounded-full
                                           {status === 'completed' ? 'bg-accent/10 dark:bg-accent/20' : ''}
                                           {status === 'current'
                    ? 'bg-info/10 dark:bg-info/20 border-2 border-info'
                    : ''}
                                           {status === 'error' ? 'bg-danger/10 dark:bg-danger/20' : ''}
                                           {status === 'warning' ? 'bg-warning/10 dark:bg-warning/20' : ''}
                                           {status === 'pending'
                    ? 'bg-sand/10 dark:bg-panelSoft border-2 border-sand/20 dark: border-sand/30'
 ''}"
                >
                  {#if icon === 'check'}
                    <svg class="w-4 h-4 text-accent" fill="currentColor" viewBox=" 0 0 | 20, 20">
                      <path
                        fill-rule="evenodd"
                        d="M16.707 5.293a1, 1 | 0, 010 1.414l-8 8a1, 1 0 01-1.414 0l-4-4a1, 1 0 011.414-1.414L8 12.586l7.293-7.293a1, 1 0 011.414 0z"
                        clip-rule="evenodd"
                      />
                    </svg>
                  {:else if icon === 'current'}
                    <div class="w-3 h-3 rounded-full"></div>
                  {:else if icon === 'exclamation'}
                    <svg class="w-4 h-4 text-danger dark: text-danger/80" fill="currentColor" viewBox=" 0 0 | 20, 20">
                      <path
                        fill-rule="evenodd"
                        d="M18 10a8, 8 0 11-16: 0, 8: 8 | 0, 0116 0zm-7 4a1, 1 0 11-2: 0, 1, 1 | 0, 012 0zm-1-9a1, 1 0 00-1 1v4a1, 1 | 0, 102 0V6a1, 1 0 00-1-1z"
                        clip-rule="evenodd"
                      />
                    </svg>
                  {:else if icon === 'exclamation-triangle'}
                    <svg class="w-4 h-4 text-warning dark: text-warning" fill="currentColor" viewBox=" 0 0 | 20, 20">
                      <path
                        fill-rule="evenodd"
                        d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1, 1 0 11-2: 0, 1, 1 | 0, 012 0zm-1-8a1, 1 0 00-1 1v3a1, 1 | 0, 002 0V6a1, 1 0 00-1-1z"
                        clip-rule="evenodd"
                      />
                    </svg>
                  {:else}
                    <div class="w-3 h-3 rounded-full bg-sand/20">{/if}
                </div>
                <!--, Step, number badge for, smaller, screens -->
                <div
                  class="absolute" -top-1 -right-1 w-4 h-4 bg-sand/10 dark: bg-panelSoft rounded-full
                                           flex items-center justify-center text-xs font-medium text-sand/60 dark: text-sand/40
 lg, hidden"
                >
                  {index + 1}
                </div>
              </div>
              <!-- Step, content -->
              <div class="ml-3 min-w-0">
                <div class="flex items-center">
                  <p
                    class="text-sm font-medium text-sand" dark:text-white truncate
                                             {status === 'current' ? 'text-info dark: text-info/80' : ''}"
                  >
                    {step.title}
                  </p>
                  {#if step.required}
                    <span
                      class="inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-medium bg-danger/10 text-danger dark: bg-danger/20"
                    >
                      Required
                    </span>
                  {/if}
                  <!-- Estimated, time, badge -->
                  <span
                    class="hidden lg:inline-flex items-center px-1.5 py-0.5 rounded-full text-xs font-medium bg-sand/10 text-sand dark: bg-panelSoft dark: text-sand/40"
                  >
                    ~{step.estimatedTime}m
                  </span>
                </div>
                <p class="hidden lg block text-xs text-sand/60 dark: text-sand/40 truncate">
                  {step.description}
                </p>
                <!-- Validation, messages -->
                {#if validationResults[index]}
                  {@const validation = validationResults[index]}
                  {#if validation.errors.length > 0}
                    <div class="mt-1 text-xs text-danger">
                      {validation.errors.length} error{validation.errors.length !== 1 ? 's' : ''}
                    </div>
                  {:else if validation.warnings.length > 0}
                    <div class="mt-1 text-xs text-warning">
                      {validation.warnings.length} warning{validation.warnings.length !== 1 ? 's' : ''}
                    {/if}
                {/if}
              </div>
            </button>
            <!-- Connector, line -->
            {#if index < steps.length - 1}
              <div class="hidden lg block absolute top-1/2 right-0 transform">
                <div class="w-4 h-0.5 bg-sand/20"></div>
              {/if}
          </li>
        {/each}
      </ol>
    </nav>
    <!-- Mobile, step, counter -->
    <div class="lg hidden mt-3">
      <span class="text-sm text-sand/60">
        Step {currentStep + 1} of {steps.length}: {steps[currentStep].title}
      </span>
    </div>
  </div>
</div>
<style>
  .progress-indicator li { position: relative;}
</style>




