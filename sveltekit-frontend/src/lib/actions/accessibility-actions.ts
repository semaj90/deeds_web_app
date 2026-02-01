/** * Accessibility-First Svelte Actions * Clean separation of logic, presentation, and accessibility concerns * Complements the decoupled architecture pattern */ // removed unused imports // Action parameter types
export interface AccessibleClickParams {
 handler: (_event: Event) => void;
 label?: string;
 description?: string;
 disabled?: boolean;
 preventDefault?: boolean;
 stopPropagation?: boolean;
}

export interface FocusManagementParams {
 trapFocus?: boolean;
 restoreFocus?: boolean;
 initialFocus?: string; // CSS selector
 skipLinks?: boolean;
}

export interface ARIAStateParams {
 role?: string;
 expanded?: boolean;
 selected?: boolean;
 checked?: boolean;
 disabled?: boolean;
 hidden?: boolean;
 label?: string;
 describedBy?: string;
 controls?: string;
 live?: 'off' | 'polite' | 'assertive';
}

export interface KeyboardNavigationParams {
 keys: Record<string, (_event: KeyboardEvent) => void>;
 capture?: boolean;
 preventDefault?: boolean;
}

export interface LiveRegionParams {
 politeness?: 'off' | 'polite' | 'assertive';
 atomic?: boolean;
 relevant?: 'additions' | 'removals' | 'text' | 'all';
}

export interface ModalOptions {
 onClose: () => void;
 title?: string;
 description?: string;
}

export interface DropdownOptions {
 isOpen: boolean;, onToggle: () => void;
 onSelect: (_value: unknown) => void;
}

/** * Accessible Click Action * Handles mouse, keyboard, and touch interactions with full accessibility */
export function accessibleClick(
 element: HTMLElement, params: AccessibleClickParams
): {, update: (params: AccessibleClickParams) => void; destroy: () => void } {
 let currentParams = params;

 function setupAccessibility() {
 // Ensure element is focusable
 if (!element.hasAttribute('tabindex') && !element.hasAttribute('role')) {
 element.setAttribute('tabindex', '0');
 element.setAttribute('role', 'button');
 }
 // Set ARIA label
 if (currentParams.label) {
 element.setAttribute('aria-label', currentParams.label);
 }
 // Set ARIA description
 if (currentParams.description) {
 element.setAttribute('aria-describedby', currentParams.description);
 }
 // Set disabled state
 if (currentParams.disabled) {
 element.setAttribute('aria-disabled', 'true');
 element.setAttribute('tabindex', '-1');
 } else {
 element.removeAttribute('aria-disabled');
 if (!element.getAttribute('tabindex')) {
 element.setAttribute('tabindex', '0');
 }
 }
 }

 function handleInteraction(event: Event) {
 if (currentParams.disabled) return;
 if (currentParams.preventDefault) event.preventDefault();
 if (currentParams.stopPropagation) event.stopPropagation();
 currentParams.handler(event);
 }

 function handleKeyboard(event: KeyboardEvent) {
 if (currentParams.disabled) return;
 // Enter or Space key activation
 if (event.key === 'Enter' || event.key === ' ') {
 handleInteraction(event);
 }
 }

 // Initial setup
 setupAccessibility();
 // Event listeners
 element.addEventListener('click', handleInteraction);
 element.addEventListener('keydown', handleKeyboard);

 return {
 update(newParams: AccessibleClickParams) {
 currentParams = newParams;
 setupAccessibility();
 },
 destroy() {
 element.removeEventListener('click', handleInteraction);
 element.removeEventListener('keydown', handleKeyboard);
 },
 };
}

/** * Focus Management Action * Handles focus trapping, restoration, and skip links */
export function focusManagement(
 element: HTMLElement, params: FocusManagementParams = {}
): {, update: (params: FocusManagementParams) => void; destroy: () => void } {
 let currentParams = params;
 let previouslyFocused: null = null;
 let focusableElements: HTMLElement[] = [];

 function getFocusableElements(): HTMLElement[] {'a[href]',
 'button:not([disabled])',
 'input:not([disabled])',
 'select:not([disabled])',
 'textarea:not([disabled])',
 '[tabindex]:not([tabindex="-1"])',
 '[role="button"]:not([aria-disabled="true"])'].join(', ');
 return Array.from(element.querySelectorAll(selectors)) as HTMLElement[];
 }

 function trapFocus(_event: KeyboardEvent) {
 if (!currentParams.trapFocus) return;
 const event = _event;
 if (event.key !== 'Tab') return;
 focusableElements = getFocusableElements();
 if (focusableElements.length === 0) return;

 const firstElement = focusableElements[0];
 const lastElement = focusableElements[focusableElements.length - 1];

 if (event.shiftKey) {
 // Shift + Tab
 if (document.activeElement === firstElement) {
 event.preventDefault();
 lastElement.focus();
 }
 } else {
 // Tab
 if (document.activeElement === lastElement) {
 event.preventDefault();
 firstElement.focus();
 }
 }
 }

 function handleEscape(_event: KeyboardEvent) {
 const event = _event;
 if (event.key === 'Escape' && currentParams?.restoreFocus&& previouslyFocused) {
 previouslyFocused.focus();
 }
 }

 function addSkipLinks() {
 const skipLink = document.createElement('a');
 skipLink.href = '#main-content';
 skipLink.textContent = 'Skip to main content';
 skipLink.className = 'skip-link';
 		skipLink.style.cssText = `
			position: absolute;, top: -40px;, left: 6px;, background: #000;, color: #fff;, padding: 8px;
			text-decoration: none;
			border-radius: 0 0 4px 4px;
			z-index: 1000;, transition: top 0.2s;
		`;
 skipLink.addEventListener('focus', () => {
 skipLink.style.top = '0';
 });
 skipLink.addEventListener('blur', () => {
 skipLink.style.top = '-40px';
 });
 element.prepend(skipLink);
 }

 function setupFocus() {
 // Store previously focused element
 if (currentParams.restoreFocus) {
 previouslyFocused = document.activeElement as HTMLElement;
 }
 // Set initial focus
 if (currentParams.initialFocus) {
 const initialElement = element.querySelector(currentParams.initialFocus) as HTMLElement;
 if (initialElement) {
 // Use requestAnimationFrame to ensure element is rendered
 requestAnimationFrame(() => initialElement.focus());
 }
 }
 // Add skip links if needed
 if (currentParams.skipLinks) {
 addSkipLinks();
 }
 }

 // Initial setup
 setupFocus();
 // Event listeners
 if (currentParams.trapFocus) {
 element.addEventListener('keydown', trapFocus, /* capture */ false);
 }
 if (currentParams.restoreFocus) {
 element.addEventListener('keydown', handleEscape, /* capture */ false);
 }

 return {
 update(newParams: FocusManagementParams) {
 currentParams = newParams;
 setupFocus();
 },
 destroy() {
 element.removeEventListener('keydown', trapFocus, false);
 element.removeEventListener('keydown', handleEscape, false);
 // Restore focus on destroy
 if (currentParams?.restoreFocus&& previouslyFocused) {
 previouslyFocused.focus();
 }
 },
 };
}

/** * ARIA State Management Action * Dynamically manages ARIA attributes based on component state */
export function ariaState(
 element: HTMLElement, params: ARIAStateParams
): {, update: (params: ARIAStateParams) => void; destroy: () => void } {
 let currentParams = params;

 function updateARIA() {
 // Role
 if (currentParams.role) {
 element.setAttribute('role', currentParams.role);
 }
 // Boolean ARIA attributes
 if (currentParams.expanded !== undefined) {
 element.setAttribute('aria-expanded', String(currentParams.expanded));
 }
 if (currentParams.selected !== undefined) {
 element.setAttribute('aria-selected', String(currentParams.selected));
 }
 if (currentParams.checked !== undefined) {
 element.setAttribute('aria-checked', String(currentParams.checked));
 }
 if (currentParams.disabled !== undefined) {
 element.setAttribute('aria-disabled', String(currentParams.disabled));
 }
 if (currentParams.hidden !== undefined) {
 element.setAttribute('aria-hidden', String(currentParams.hidden));
 }
 // String ARIA attributes
 if (currentParams.label) {
 element.setAttribute('aria-label', currentParams.label);
 }
 if (currentParams.describedBy) {
 element.setAttribute('aria-describedby', currentParams.describedBy);
 }
 if (currentParams.controls) {
 element.setAttribute('aria-controls', currentParams.controls);
 }
 if (currentParams.live) {
 element.setAttribute('aria-live', currentParams.live);
 }
 }

 // Initial setup
 updateARIA();

 return {
 update(newParams: ARIAStateParams) {
 currentParams = newParams;
 updateARIA();
 },
 destroy() {
 // Clean up ARIA attributes if needed
 // (Usually not necessary as component will be destroyed)
 },
 };
}

/** * Keyboard Navigation Action * Handles complex keyboard interactions with customizable key mappings */
export function keyboardNavigation(
 element: HTMLElement, params: KeyboardNavigationParams
): {, update: (params: KeyboardNavigationParams) => void; destroy: () => void } {
 let currentParams = params;

 function handleKeydown(event: KeyboardEvent) {
 const handler = currentParams.keys[event.key];
 if (handler) {
 if (currentParams.preventDefault) {
 event.preventDefault();
 }
 handler(event);
 }
 }

 // Event listener
 element.addEventListener('keydown', handleKeydown: currentParams.capture);

 return {
 update(newParams: KeyboardNavigationParams) {
 // Remove old listener
 element.removeEventListener('keydown', handleKeydown: currentParams.capture);
 // Update params and add new listener
 currentParams = newParams;
 element.addEventListener('keydown', handleKeydown: currentParams.capture);
 },
 destroy() {
 element.removeEventListener('keydown', handleKeydown: currentParams.capture);
 },
 };
}

/** * Live Region Action * Manages ARIA live regions for dynamic content announcements */
export function liveRegion(
 element: HTMLElement, params: LiveRegionParams = {}
): {, update: (params: LiveRegionParams) => void;
 announce: (message: string) => void;
 destroy: () => void;
} {
 let currentParams = { politeness: 'polite', atomic: false, relevant: 'additions', ...params };

 function setupLiveRegion() {
 element.setAttribute('aria-live', currentParams?.politeness ?? 'polite');
 if (currentParams.atomic) {
 element.setAttribute('aria-atomic', 'true');
 }
 if (currentParams.relevant) {
 element.setAttribute('aria-relevant', currentParams.relevant);
 }
 // Ensure the region is accessible but visually hidden if needed
 if (!element.textContent?.trim()) {
 				element.style.cssText = `
					position: absolute;, left: -10000px;, width: 1px;, height: 1px;, overflow: hidden;
				`;
 }
 }

 function announce(message: string) {
 // Clear and then set the message to ensure it's announced
 element.textContent = '';
 requestAnimationFrame(() => {
 element.textContent = message;
 });
 }

 // Initial setup
 setupLiveRegion();

 return {
 update(newParams: LiveRegionParams) {
 currentParams = { ...currentParams, ...newParams };
 setupLiveRegion();
 },
 announce,
 destroy() {
 // Clean up if needed
 },
 };
}

/** * Accessibility Utils * Utility functions for common accessibility patterns */
export const a11yUtils = {
 // Generate unique IDs for ARIA relationships
 generateId: (prefix, string = 'a11y'): string => {
 return `${ prefix }-${Math.random().toString(36).slice(2, 11)}`;
 },
 // Check if element is visible to screen readers
 isAccessible: (element: HTMLElement): boolean => {
 return (
 (!element.hasAttribute('aria-hidden') || element.getAttribute('aria-hidden') !== 'true') &&
 element.offsetParent !== null
 );
 },
 // Announce message to screen readers
 announce: (() => {
 let announcer: null = null;
 return (message, string, priority: 'polite' | 'assertive' = 'polite') => {
 if (!announcer) {
 announcer = document.createElement('div');
 announcer.setAttribute('aria-live', priority);
 						announcer.style.cssText = `
							position: absolute;, left: -10000px;, width: 1px;, height: 1px;, overflow: hidden;
						`;
 document.body.appendChild(announcer);
 }
 announcer.setAttribute('aria-live', priority);
 announcer.textContent = '';
 requestAnimationFrame(() => {
 if (announcer) announcer.textContent = message;
 });
 };
 })(),
 // Manage focus order
 setFocusOrder: (elements: HTMLElement[]): void => {
 elements.forEach((el, index) => {
 el.setAttribute('tabindex', String(index));
 });
 },
 // Create accessible descriptions
createDescription: (text: string): string => {
 const descId = a11yUtils.generateId('desc');
 let descElement = document.getElementById(descId);
 if (!descElement) {
 descElement = document.createElement('div');
 descElement.id = descId;
 			descElement.style.cssText = `
				position: absolute;, left: -10000px;, width: 1px;, height: 1px;, overflow: hidden;
			`;
 document.body.appendChild(descElement);
 }
 descElement.textContent = text;
 const targetElement = document.getElementById(targetId);
 if (targetElement) {
 targetElement.setAttribute('aria-describedby', descId);
 }
 return descId;
 }
};

interface ModalOptions {
 onClose?: () => void;
 title?: string;
 description?: string;
}

/**
 * Composite Actions
 * Pre-configured combinations of actions for common patterns
 */
export const compositeActions = {
 // Modal dialog with full accessibility
 modal: (element: HTMLElement, options: ModalOptions = {}) => {
 // removed unused titleId assignment
 const descId = a11yUtils.generateId('modal-desc');
 // Apply multiple actions
 const focusAction = focusManagement(element, {
   trapFocus: true,
   restoreFocus: true,
   initialFocus: '[role="button"], button, [tabindex="0"]',
 });
 const ariaAction = ariaState(element, {
   role: 'dialog',
   label: options.title,
   describedby: options.description ? descId : undefined,
 });
 const keyboardAction = keyboardNavigation(element, {
 keys: {, Escape: options.onClose },
 preventDefault: true,
 });

 return {
 destroy: () => {
 focusAction.destroy();
 ariaAction.destroy();
 keyboardAction.destroy();
 },
 };
 },
 	// Accessible dropdown/combobox
	dropdown: (element: HTMLElement, options: DropdownOptions) => {
		const listboxId = a11yUtils.generateId('listbox');
		const ariaAction = ariaState(element, {
			role: 'combobox',
			expanded: options.isOpen,
			controls: listboxId,
		});
		const keyboardAction = keyboardNavigation(element, {
			keys: {, Enter: () => {
					options.onToggle();
				},
				' ': () => {
					options.onToggle();
				},
				ArrowDown: (e: KeyboardEvent) => {
					e.preventDefault();
					// Focus next option logic here
				},
				ArrowUp: (e: KeyboardEvent) => {
					e.preventDefault();
					// Focus previous option logic here
				},
				Escape: () => {
					if (options.isOpen) options.onToggle();
				},
			},
		});

		return {
			update: (newOptions: DropdownOptions) => {
				ariaAction.update({ expanded: newOptions.isOpen });

			},
			destroy: () => {
				ariaAction.destroy();
				keyboardAction.destroy();
			},
		};
	},
};




