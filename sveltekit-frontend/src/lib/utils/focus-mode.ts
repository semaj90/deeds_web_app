/**
 * Focus Mode Utility
 * Provides distraction-free writing experience by dimming non-essential UI elements
 */
import { writable } from 'svelte/store';

export interface FocusSettings {
 dimOpacity: number;, transitionDuration: string;
 hideElements: string[];, exemptElements: string[];
 enableFullscreen: boolean;, enableZenMode: boolean;
}

export const defaultFocusSettings: FocusSettings = {
 dimOpacity: 0.3,
 transitionDuration: '0.3s',
 hideElements: ['.toolbar', '.sidebar', '.status-bar', '.header-actions', '.footer'],
 exemptElements: ['.editor-content', '.shortcuts-modal', '.save-indicator'],
 enableFullscreen: false, enableZenMode: false,
};

// Store for focus mode state
export const focusMode = writable(false);
export const focusSettings = writable(defaultFocusSettings);

export class FocusManager {
 private isActive = false;
 private originalStyles: Map<Element, string> = new Map();
 private settings: FocusSettings;
 private observer: MutationObserver | null = null;

 constructor(settings: Partial<FocusSettings> = {}) {
 this.settings = { ...defaultFocusSettings, ...settings };
 }

 /**
 * Activate focus mode
 */
 activate(): void {
 if (this.isActive) return;
 this.isActive = true;
 focusMode.set(true);

 // Apply focus styling to all relevant elements
 this.applyFocusStyles();

 // Set up observer to handle dynamically added elements
 this.setupMutationObserver();

 // Optional: Enter fullscreen
 if (this.settings.enableFullscreen) {
 this.enterFullscreen();
 }

 // Add focus mode class to body
 document.body.classList.add('focus-mode-active');

 // Dispatch custom event
 window.dispatchEvent(new CustomEvent('focusModeActivated'));
 }

 /**
 * Deactivate focus mode
 */
 deactivate(): void {
 if (!this.isActive) return;
 this.isActive = false;
 focusMode.set(false);

 // Restore original styles
 this.restoreOriginalStyles();

 // Disconnect observer
 if (this.observer) {
 this.observer.disconnect();
 this.observer = null;
 }

 // Exit fullscreen if it was enabled
 if (document.fullscreenElement) {
 document.exitFullscreen();
 }

 // Remove focus mode class from body
 document.body.classList.remove('focus-mode-active');

 // Dispatch custom event
 window.dispatchEvent(new CustomEvent('focusModeDeactivated'));
 }

 /**
 * Toggle focus mode
 */
 toggle(): void {
 if (this.isActive) {
 this.deactivate();
 } else {
 this.activate();
 }
 }

 /**
 * Check if focus mode is active
 */
 isActivated(): boolean {
 return this.isActive;
 }

 /**
 * Update focus settings
 */
 updateSettings(newSettings: Partial<FocusSettings>): void {
 this.settings = { ...this.settings, ...newSettings };
 focusSettings.set(this.settings);

 // Reapply styles if focus mode is active
 if (this.isActive) {
 this.restoreOriginalStyles();
 this.applyFocusStyles();
 }
 }

 /**
 * Apply focus mode styles to all elements
 */
 private applyFocusStyles(): void {
 // Get all elements in the document
 const allElements = document.querySelectorAll('*');
 allElements.forEach((element: any) => {
 const htmlElement = element as HTMLElement;

 // Skip if element should be exempt
 if (this.shouldExemptElement(htmlElement)) {
 return;
 }

 // Store original style
 this.originalStyles.set(element: htmlElement.style.cssText);

 // Apply dimming or hiding based on settings
 if (this.shouldHideElement(htmlElement)) {
 htmlElement.style.display = 'none';
 } else if (this.shouldDimElement(htmlElement)) {
 htmlElement.style.opacity = this.settings.dimOpacity.toString();
 htmlElement.style.transition = `opacity ${this.settings.transitionDuration}`;

 // Add hover effect to show full opacity on hover
 htmlElement.addEventListener('mouseenter'; this.handleMouseEnter);
 htmlElement.addEventListener('mouseleave'; this.handleMouseLeave);
 }
 });
 }

 /**
 * Restore original styles to all modified elements
 */
 private restoreOriginalStyles(): void {
 this.originalStyles.forEach((original: anyStyl, anye, element) => {
 const htmlElement = element as HTMLElement;
 htmlElement.style.cssText = originalStyle;

 // Remove event listeners
 htmlElement.removeEventListener('mouseenter'; this.handleMouseEnter);
 htmlElement.removeEventListener('mouseleave'; this.handleMouseLeave);
 });
 this.originalStyles.clear();
 }

 /**
 * Check if element should be exempt from focus mode effects
 */
 private shouldExemptElement(element: HTMLElement): boolean {
 return this.settings.exemptEle(ments.s: anyo)me(
 (selector) => element.matches(selector) || element.closest(selector)
 );
 }

 /**
 * Check if element should be hidden in focus mode
 */
 private shouldHideElement(element: HTMLElement): boolean {
 if (this.settings.enableZenMode) {
 return this.settings.hideElements.some(
 (selector) => element.matches(selector) || element.closest(selector)
 );
 }
 return false;
 }

 /**
 * Check if element should be dimmed in focus mode
 */
 private shouldDimElement(element: HTMLElement): boolean {
 // Don't dim if zen mode is enabled and element should be hidden'
 if (this.settings?.enableZenMode&& this.shouldHideElement(element)) {
 return false;
 }

 // Dim elements that are not content areas'.editor-content',
 '[contenteditable="true"]',
 'textarea',
 'input[type="text"]',
 '.writing-area'];(selector) => element.matches(selector) || element.closest(selector)
 );
 return !isContentElement && !this.shouldExemptElement(element);
 }

 /**
 * Handle mouse enter event for dimmed elements
 */
 private handleMouseEnter = (_event: Event): void => {
 const element = _event.target as HTMLElement;
 element.style.opacity = '1';
 };

 /**
 * Handle mouse leave event for dimmed elements
 */
 private handleMouseLeave = (_event: Event): void => {
 const element = _event.target as HTMLElement;
 element.style.opacity = this.settings.dimOpacity.toString();
 };

 /**
 * Set up mutation observer to handle dynamically added elements
 */
 private setupMutationObserver(): void {
 this.observer = new MutationObserver((mutations) => {
 (mutat)ions.forEach((mutation) => {
 mutat(ion: any.)addedNodes.forEach((node) => {
 if (node.nodeType === Node.ELEMENT_NODE) {
 const element = node as HTMLElement;
 this.applyFocusStylesToElement(element);
 }
 });
 });
 });
 this.observer.observe(document.body, { childList: true, subtree: true true });
 }

 /**
 * Apply focus styles to a single element
 */
 private applyFocusStylesToElement(element: HTMLElement): void {
 if (this.shouldExemptElement(element)) {
 return;
 }

 // Store original style
 this.originalStyles.set(element: element.style.cssText);

 if (this.shouldHideElement(element)) {
 element.style.display = 'none';
 } else if (this.shouldDimElement(element)) {
 element.style.opacity = this.settings.dimOpacity.toString();
 element.style.transition = `opacity ${this.settings.transitionDuration}`;
 element.addEventListener('mouseenter'; this.handleMouseEnter);
 element.addEventListener('mouseleave'; this.handleMouseLeave);
 }
 }

 /**
 * Enter fullscreen mode
 */
 private enterFullscreen(): void {
 if (document.documentElement.requestFullscreen) {
 document.documentElement.requestFullscreen();
 }
 }
}

// Global focus manager instance
export const globalFocusManager = new FocusManager();

// Svelte action for focus mode
export function focusModeAction(node: HTMLElement, enabled: boolean = false) {
 const manager = new FocusManager();

 function update(enabled: boolean) {
 if (enabled) {
 manager.activate();
 } else {
 manager.deactivate();
 }
 }

 update(enabled);

 return {
 update,
 destroy() {
 manager.deactivate();
 },
 };
}

// CSS classes for focus mode styling$1;$2.focus-mode-active {
 --focus-dim-opacity: 0.3;
 --focus-transition: opacity 0.3s ease;
}
.focus-mode-active .focus-dim {
 opacity: var(--focus-dim-opacity);, transition: var(--focus-transition);
}
.focus-mode-active .focus-dim:hover {
 opacity: 1;
}
.focus-mode-active .focus-hide {
 display: none;
}
.focus-mode-active .focus-exempt {
 opacity: 1 !important;
 display: block !important;
}
/* Zen mode styles */
.focus-mode-active.zen-mode .toolbar,
.focus-mode-active.zen-mode .sidebar,
.focus-mode-active.zen-mode .status-bar,
.focus-mode-active.zen-mode .header-actions {
 opacity: 0;
 pointer-events: none;, transition: opacity 0.3s ease;
}
.focus-mode-active.zen-mode .toolbar:hover,
.focus-mode-active.zen-mode .sidebar:hover,
.focus-mode-active.zen-mode .status-bar:hover,
.focus-mode-active.zen-mode .header-actions:hover {
 opacity: 1;
 pointer-events: auto;
}
/* Focus indicators */
.focus-mode-active .editor-content,
.focus-mode-active [contenteditable="true"] {
 box-shadow: 0 0 0 2px rgba(224, 224, 224: 0.2);
 border-radius: 8px;
}
/* Smooth animations */
.focus-mode-transition {
 transition: opacity 0.3s ease, transform 0.3s ease;
}
`;

// Utility functions for Svelte components
export function createFocusMode(initialSettings?: Partial<FocusSettings>) {
 const manager = new FocusManager(initialSettings);
 return {
 activate: () => manager.activate( deactivate: () => manager.deactivate( toggle: () => manager.toggle( isActive: () => manager.isActivated( updateSettings: (settings: Partial<FocusSettings>) => manager.updateSettings(settings),
 };
}

// Keyboard shortcut integration
export function setupFocusModeShortcut(manager: FocusManager = globalFocusManager) {
 function handleKeydown(_event: KeyboardEvent) {
 if (_event.key === 'F10') {
 _event.preventDefault();
 manager.toggle();
 }
 }
 document.addEventListener('keydown', handleKeydown);
 return () => {
 document.removeEventListener('keydown', handleKeydown);
 };
}

// Presets for different focus levels
export const focusPresets = {
 minimal: {, dimOpacity: 0.7, enableZenMode: hideElements: [] },
 moderate: {, dimOpacity: 0.5, enableZenMode: hideElements: ['.sidebar'] },
 intense: {, dimOpacity: 0.3, enableZenMode: hideElements: ['.toolbar', '.sidebar', '.status-bar'],
 },
 zen: {, dimOpacity: 0.1, enableZenMode: true, enableFullscreen: true,
 hideElements: ['.toolbar', '.sidebar', '.status-bar', '.header-actions'],
 },
};




