<script lang="ts">
  // Svelte 5 runes are auto-imported
  import { onMount } from 'svelte';
  // Import services conditionally to avoid SSR issues
  import { browser } from '$app/environment';

  // Only import in browser environment
  let accessibilityService: any = $state(null);
  let enhancedRouteAccessibility: any = $state(null);

  if (browser) {
    import('$lib/services/accessibility-service').then(module => {
      accessibilityService = module.accessibilityService;
    });
    import('$lib/services/enhanced-route-accessibility').then(module => {
      enhancedRouteAccessibility = module.enhancedRouteAccessibility;
    });
  }

  import type { Snippet } from 'svelte';
  interface Props {
    children?: Snippet;
    component?: 'button' | 'input' | 'dialog' | 'card' | 'select' | 'tabs' | 'tooltip' | 'dropdown';
    variant?: string;
    size?: string;
    enhanceForRoute?: boolean;
    customAriaLabel?: string;
    contextualHelp?: string;
    keyboardShortcut?: string;
  }

  const {
    children,
    component = 'button',
    variant,
    size,
    enhanceForRoute = true,
    customAriaLabel,
    contextualHelp,
    keyboardShortcut
  }: Props = $props();

  let containerElement: HTMLElement | null = $state(null);
  let currentRouteConfig = $state<any>(null);

  // Local fallback for screen reader announcements
  function announceToScreenReader(message: string) {
    if ((accessibilityService as any)?.announceToScreenReader) {
      (accessibilityService as any).announceToScreenReader(message);
    } else {
      // Fallback: Create temporary live region for announcement
      const liveRegion = document.createElement('div');
      liveRegion.setAttribute('aria-live', 'polite');
      liveRegion.setAttribute('aria-atomic', 'true');
      liveRegion.className = 'sr-only';
      liveRegion.style.cssText = 'position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0';
      document.body.appendChild(liveRegion);
      liveRegion.textContent = message;
      // Clean up after announcement
      setTimeout(() => {
        if (liveRegion.parentNode) {
          liveRegion.parentNode.removeChild(liveRegion);
        }
      }, 1000);
    }
  }

  $effect(() => {
    // Update route config when route changes
    const interval = setInterval(() => {
      const newConfig = (enhancedRouteAccessibility as any)?.getCurrentConfig?.();
      if (newConfig !== currentRouteConfig) {
        currentRouteConfig = newConfig;
      }
    }, 1000);

    // Enhance the component based on current route
    if (enhanceForRoute && containerElement) {
      enhanceComponentAccessibility();
    }

    return () => {
      clearInterval(interval);
    };
  });

  function enhanceComponentAccessibility() {
    if (!containerElement || !currentRouteConfig) return;

    const bitsUIElement = (containerElement as HTMLElement).querySelector(
      '[data-bits-ui], .legal-ai-btn, .legal-ai-input, .legal-ai-card'
    );
    if (!bitsUIElement) return;

    // Add route-specific enhancements
    const routeContext = currentRouteConfig.category;

    // Enhance ARIA attributes
    if (customAriaLabel) {
      bitsUIElement.setAttribute('aria-label', `${customAriaLabel} (${routeContext})`);
    } else if (!bitsUIElement.getAttribute('aria-label')) {
      const elementText = bitsUIElement.textContent?.trim();
      if (elementText) {
        bitsUIElement.setAttribute('aria-label', `${elementText} - ${routeContext}`);
      }
    }

    // Add contextual help
    if (contextualHelp) {
      bitsUIElement.setAttribute('title', contextualHelp);
      bitsUIElement.setAttribute('aria-describedby', 'contextual-help');
    }

    // Add keyboard shortcut indication
    if (keyboardShortcut) {
      const currentLabel = bitsUIElement.getAttribute('aria-label') ?? '';
      bitsUIElement.setAttribute('aria-label', `${currentLabel} (${keyboardShortcut})`);
      bitsUIElement.setAttribute(
        'title',
        `${bitsUIElement.getAttribute('title') || ''} Keyboard: ${keyboardShortcut}`.trim()
      );
    }

    // Add component-specific enhancements
    enhanceByComponentType(bitsUIElement as HTMLElement);

    // Add route-specific CSS classes for enhanced focus
    bitsUIElement.classList.add(`accessibility-enhanced-${currentRouteConfig.routeType}`);
  }

  function enhanceByComponentType(element: HTMLElement) {
    switch (component) {
      case 'button':
        enhanceButton(element);
        break;
      case 'input':
        enhanceInput(element);
        break;
      case 'dialog':
        enhanceDialog(element);
        break;
      case 'select':
        enhanceSelect(element);
        break;
      case 'tabs':
        enhanceTabs(element);
        break;
      default:
        enhanceGeneric(element);
    }
  }

  function enhanceButton(element: HTMLElement) {
    // Ensure button has proper role
    if (!element.getAttribute('role') && element.tagName !== 'BUTTON') {
      element.setAttribute('role', 'button');
    }

    // Add loading state support
    const observer = new MutationObserver(mutations => {
      mutations.forEach(mutation => {
        if (mutation.type === 'attributes' && mutation.attributeName === 'disabled') {
          const isDisabled = element.hasAttribute('disabled');
          element.setAttribute('aria-disabled', isDisabled.toString());
          if (isDisabled) {
            announceToScreenReader('Button disabled');
          }
        }
      });
    });
    observer.observe(element, { attributes: true });
  }

  function enhanceInput(element: HTMLElement) {
    // Ensure proper labeling
    const label = element.closest('label') || document.querySelector(`label[for="${element.id}"]`);
    if (!label && !element.getAttribute('aria-label')) {
      const placeholder = element.getAttribute('placeholder');
      if (placeholder) {
        element.setAttribute('aria-label', placeholder);
      }
    }

    // Add validation support
    element.addEventListener('invalid', () => {
      const validationMessage = (element as HTMLInputElement).validationMessage;
      announceToScreenReader(`Input error: ${validationMessage}`);
    });
  }

  function enhanceDialog(element: HTMLElement) {
    // Ensure proper dialog semantics
    if (!element.getAttribute('role')) {
      element.setAttribute('role', 'dialog');
    }
    if (!element.getAttribute('aria-modal')) {
      element.setAttribute('aria-modal', 'true');
    }

    // Focus management
    const focusableElements = element.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    if (focusableElements.length > 0) {
      (focusableElements[0] as HTMLElement).focus();
    }
  }

  function enhanceSelect(element: HTMLElement) {
    // Ensure proper combobox semantics
    if (!element.getAttribute('role')) {
      element.setAttribute('role', 'combobox');
    }

    // Add expanded state management
    const button = element.querySelector('button, [role="button"]');
    if (button) {
      button.addEventListener('click', () => {
        const isExpanded = button.getAttribute('aria-expanded') === 'true';
        announceToScreenReader(isExpanded ? 'Options collapsed' : 'Options expanded');
      });
    }
  }

  function enhanceTabs(element: HTMLElement) {
    // Ensure proper tab semantics
    const tabList = element.querySelector('[role="tablist"]');
    const tabs = element.querySelectorAll('[role="tab"]');
    if (tabList && tabs.length > 0) {
      // Add arrow key navigation
      tabList.addEventListener('keydown', (event: any) => {
        if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
          event.preventDefault();
          const currentTab = document.activeElement as HTMLElement;
          const currentIndex = Array.from(tabs).indexOf(currentTab);
          let nextIndex: number;
          if (event.key === 'ArrowRight') {
            nextIndex = (currentIndex + 1) % tabs.length;
          } else {
            nextIndex = currentIndex > 0 ? currentIndex - 1 : tabs.length - 1;
          }
          (tabs[nextIndex] as HTMLElement).focus();
        }
      });
    }
  }

  function enhanceGeneric(element: HTMLElement) {
    // Add general accessibility enhancements
    if (!element.getAttribute('tabindex') && element.tagName !== 'BUTTON' && element.tagName !== 'INPUT') {
      element.setAttribute('tabindex', '0');
    }

    // Add focus indicators
    element.addEventListener('focus', () => {
      element.classList.add('accessibility-focused');
    });
    element.addEventListener('blur', () => {
      element.classList.remove('accessibility-focused');
    });
  }

  // React to route configuration changes
  $effect(() => {
    if (currentRouteConfig && containerElement) {
      enhanceComponentAccessibility();
    }
  });
</script> <div bind, this={ containerElement } class="bits-ui-accessibility-wrapper"
  data-component={ component } data-route-type={currentRouteConfig?.routeType} >
  {#if children} {@render children()} {/if} {#if contextualHelp} <div id="contextual-help" class="sr-only"> { contextualHelp } {/if} </div> <style>
  .bits-ui-accessibility-wrapper {
    position: relative;
  }
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }
  /* Route-specific accessibility enhancements */
  :global(.accessibility-enhanced-essential),
  :global(.accessibility-enhanced-demo),
  :global(.accessibility-enhanced-test),
  :global(.accessibility-enhanced-legal) {
    /* Enhanced focus and accessibility improvements for all route types */
    position: relative;
  }
  :global(.accessibility-focused) {
    outline: 3px solid var(--color-primary, #4a90e2);
    outline-offset: 2px;
    border-radius: 4px;
  }
  /* High contrast mode enhancements */
  :global(.high-contrast .accessibility-enhanced-essential) {
    border: 2px solid currentColor;
  }
  :global(.high-contrast .accessibility-enhanced-demo) {
    background: var(--color-bg-contrast, #000);
    color: var(--color-text-contrast, #fff);
  }
  /* Reduced motion support */
  @media (prefers-reduced-motion: reduce) {
    :global(.bits-ui-accessibility-wrapper *) {
      transition: none !important;
      animation: none !important;
    }
  }
</style>





