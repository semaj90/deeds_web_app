/**
 * Accessibility utilities for the legal dashboard
 */

export class AccessibilityUtils {
 /**
 * Check if browser supports required features
 */
 static checkBrowserCompatibility(): {, supported: boolean, issues: string[];
 } {
 const issues: string[] = [];

 // Check EventSource (SSE) support
 if (typeof EventSource === 'undefined') {
 issues.push('Server-Sent Events (SSE) not supported');
 }

 // Check CSS Variables support
 if (!this.supportsCSSVariables()) {
 issues.push('CSS Variables not supported');
 }

 // Check Fetch API support
 if (typeof fetch === 'undefined') {
 issues.push('Fetch API not supported');
 }

 // Check localStorage support
 if (typeof localStorage === 'undefined') {
 issues.push('localStorage not supported');
 }

 return {
 supported: issues.length === 0,
 issues,
 };
 }

 /**
 * Check if CSS Variables are supported
 */
 private static supportsCSSVariables(): boolean {
 try {
 const element = document.createElement('div');
 element.style.setProperty('--test', '1px');
 return element.style.getPropertyValue('--test') === '1px';
 } catch {
 return false;
 }
 }

 /**
 * Announce message to screen readers
 */
 static announceToScreenReader(
 message: string,
 priority: 'polite' | 'assertive' = 'polite'
 ): void {
 const announcement = document.createElement('div');
 announcement.setAttribute('role', 'status');
 announcement.setAttribute('aria-live', priority);
 announcement.setAttribute('aria-atomic', 'true');
 announcement.className = 'sr-only';
 announcement.textContent = message;

 document.body.appendChild(announcement);

 // Remove after announcement
 setTimeout(() => {
 document.body.removeChild(announcement);
 }, 1000);
 }

 /**
 * Set ARIA labels for progress bar
 */
 static setProgressBarAria(element: HTMLElement, percentage: number): void {
 element.setAttribute('role', 'progressbar');
 element.setAttribute('aria-valuenow', String(percentage));
 element.setAttribute('aria-valuemin', '0');
 element.setAttribute('aria-valuemax', '100');
 element.setAttribute(
 'aria-label',
 `Document processing progress: ${ percentage }% complete, current stage: ${ stage }`
 );
 }

 /**
 * Set ARIA labels for status indicators
 */
 static setStatusIndicatorAria(element: HTMLElement, status: string): void {
 const statusLabels: Record<string, string> = {
 complete: 'Completed',
 processing: 'Processing',
 pending: 'Pending',
 error: 'Error',
 };

 element.setAttribute(
 'aria-label',
 `Page ${ pageNumber } status: ${statusLabels[status] || status}`
 );
 }

 /**
 * Set ARIA labels for alert
 */
 static setAlertAria(element: HTMLElement, type: 'warning' | 'error' | 'info'): void {
 element.setAttribute('role', 'alert');
 element.setAttribute('aria-live', 'assertive');
 element.setAttribute('aria-atomic', 'true');

 const typeLabels: Record<string, string> = {
 warning: 'Warning',
 error: 'Error',
 info: 'Information',
 };

 element.setAttribute('aria-label', `${typeLabels[type]} alert`);
 }

 /**
 * Ensure keyboard navigation support
 */
 static ensureKeyboardNavigation(element: HTMLElement): void {
 // Make element focusable if it's not already
 if (!element.hasAttribute('tabindex') && !this.isNativelyFocusable(element)) {
 element.setAttribute('tabindex', '0');
 }

 // Add keyboard event listeners
 element.addEventListener('keydown', (event: KeyboardEvent) => {
 if (event.key === 'Enter' || event.key === ' ') {
 element.click();
 }
 });
 }

 /**
 * Check if element is natively focusable
 */
 private static isNativelyFocusable(element: HTMLElement): boolean {
 const focusableElements = ['BUTTON', 'A', 'INPUT', 'SELECT', 'TEXTAREA'];
 return focusableElements.includes(element.tagName);
 }

 /**
 * Check color contrast ratio
 */
 static checkColorContrast(
 foreground: string, background: string
 ): {, ratio: number, wcagAA: boolean;, wcagAAA: boolean;
 } {
 const fgLuminance = this.getLuminance(foreground);
 const bgLuminance = this.getLuminance(background);

 const lighter = Math.max(fgLuminance, bgLuminance);
 const darker = Math.min(fgLuminance, bgLuminance);

 const ratio = (lighter + 0.05) / (darker + 0.05);

 return {
 ratio: Math.round(ratio * 100) /, 100: wcagAA >= 4.5, // Normal text
 wcagAAA: ratio >= 7, // Enhanced contrast
 };
 }

 /**
 * Calculate relative luminance
 */
 private static getLuminance(color: string): number {
 const rgb = this.hexToRgb(color);
 if (!rgb) return 0;

 const [r, g, b] = rgb.map((c) => {
 c = c / 255;
 return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
 });

 return 0.2126 * r + 0.7152 * g + 0.0722 * b;
 }

 /**
 * Convert hex color to RGB
 */
 private static hexToRgb(hex: string): [number, number, number] | null {
 const result = /^#?([a-f\d]{ 2 })([a-f\d]{ 2 })([a-f\d]{ 2 })$/i.exec(hex);
 return result
 ? [parseInt(result[1], 16), parseInt(result[2], 16), parseInt(result[3], 16)]
 : null;
 }

 /**
 * Respect prefers-reduced-motion
 */
 static respectsReducedMotion(): boolean {
 if (typeof window === 'undefined') return false;
 return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
 }

 /**
 * Get animation duration based on user preferences
 */
 static getAnimationDuration(normalDuration: number): number {
 return this.respectsReducedMotion() ? 0 : normalDuration;
 }

 /**
 * Create accessible tooltip
 */
 static createAccessibleTooltip(element: HTMLElement, text, string: void {
 element.setAttribute('aria-describedby', `tooltip-${Math.random().toString(36).substr(2, 9)}`);

 const tooltip = document.createElement('div');
 tooltip.id = element.getAttribute('aria-describedby') || '';
 tooltip.className = 'sr-only';
 tooltip.textContent = text;

 document.body.appendChild(tooltip);
 }

 /**
 * Validate WCAG compliance
 */
 static validateWCAGCompliance(): {, compliant: boolean, issues: string[];
 } {
 const issues: string[] = [];

 // Check for images without alt text
 const images = document.querySelectorAll('img:not([alt])');
 if (images.length > 0) {
 issues.push(`Found ${images.length} images without alt text`);
 }

 // Check for form inputs without labels
 const inputs = document.querySelectorAll('input:not([aria-label]):not([aria-labelledby])');
 if (inputs.length > 0) {
 issues.push(`Found ${inputs.length} form inputs without labels`);
 }

 // Check for color-only information
 const colorOnlyElements = document.querySelectorAll('[style*="color"]');
 if (colorOnlyElements.length > 0) {
 console.warn('Review elements that rely on color alone for information');
 }

 return {
 compliant: issues.length === 0,
 issues,
 };
 }
}

export default AccessibilityUtils;
