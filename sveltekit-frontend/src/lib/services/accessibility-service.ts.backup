import type { User } from '$lib/types';
import { browser } from '$app/environment';

export interface AccessibilityConfig {
    enableScreenReaderAnnouncements: boolean;
    enableKeyboardNavigation: boolean;
    enableHighContrast: boolean;
    enableReducedMotion: boolean;
    fontSize: 'small' | 'normal' | 'large' | 'extra-large';
    focusManagement: boolean;
}

class AccessibilityService {
    config: AccessibilityConfig = {
        enableScreenReaderAnnouncements: true,
        enableKeyboardNavigation: true,
        enableHighContrast: false,
        enableReducedMotion: false,
        fontSize: 'normal',
        focusManagement: true
    };

    private announceElement: HTMLElement | null = null;
    private focusStack: HTMLElement[] = [];
    private configChangeCallbacks: Array<(config: AccessibilityConfig) => void> = [];

    constructor() {
        if (browser) {
            this.initialize();
        }
    }

    private initialize(): void {
        this.createAnnounceElement();
        this.setupKeyboardNavigation();
        this.detectUserPreferences();
        this.setupFocusManagement();
    }

    private createAnnounceElement(): void {
        this.announceElement = document.createElement('div');
        this.announceElement.setAttribute('aria-live', 'polite');
        this.announceElement.setAttribute('aria-atomic', 'true');
        this.announceElement.className = 'sr-only';
        this.announceElement.style.cssText = `
            position: absolute;
            width: 1px;
            height: 1px;
            padding: 0;
            margin: -1px;
            overflow: hidden;
            clip: rect(0, 0, 0, 0);
            white-space: nowrap;
            border: 0;
        `;
        document.body.appendChild(this.announceElement);
    }

    // Screen reader announcements
    announce(message: string, priority: 'polite' | 'assertive' = 'polite'): void {
        if (!this.config.enableScreenReaderAnnouncements || !this.announceElement) return;

        this.announceElement.setAttribute('aria-live', priority);
        this.announceElement.textContent = message;

        // Clear after announcement to allow re-announcement of same message
        setTimeout(() => {
            if (this.announceElement) {
                this.announceElement.textContent = '';
            }
        }, 1000);
    }

    // Focus management
    pushFocus(element: HTMLElement): void {
        if (!this.config.focusManagement) return;
        if (document.activeElement instanceof HTMLElement) {
            this.focusStack.push(document.activeElement);
        }
        element.focus();
    }

    popFocus(): void {
        if (!this.config.focusManagement || this.focusStack.length === 0) return;
        const previousElement = this.focusStack.pop();
        if (previousElement) {
            previousElement.focus();
        }
    }

    // Keyboard navigation
    private setupKeyboardNavigation(): void {
        if (!this.config.enableKeyboardNavigation) return;
        document.addEventListener('keydown', (event) => {
            this.handleGlobalKeydown(event);
        });
    }

    private handleGlobalKeydown(event: KeyboardEvent): void {
        // Skip navigation (Alt + S)
        if (event.altKey && event.key === 's') {
            event.preventDefault();
            this.skipToMainContent();
            return;
        }

        // Help modal (F1)
        if (event.key === 'F1') {
            event.preventDefault();
            this.showAccessibilityHelp();
            return;
        }

        // Focus trap for modals
        if (event.key === 'Tab') {
            this.handleTabNavigation(event);
        }

        // Escape key handling
        if (event.key === 'Escape') {
            this.handleEscape();
        }
    }

    private skipToMainContent(): void {
        const mainContent = document.querySelector('main, [role="main"], #main-content');
        if (mainContent instanceof HTMLElement) {
            mainContent.focus();
            this.announce('Skipped to main content');
        }
    }

    private handleTabNavigation(event: KeyboardEvent): void {
        const modal = document.querySelector('[role="dialog"]:not([hidden])');
        if (modal instanceof HTMLElement) {
            this.trapFocusInModal(event, modal);
        }
    }

    private trapFocusInModal(event: KeyboardEvent, modal: HTMLElement): void {
        const focusableElements = modal.querySelectorAll(
            'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );

        if (focusableElements.length === 0) return;

        const firstElement = focusableElements[0] as HTMLElement;
        const lastElement = focusableElements[focusableElements.length - 1] as HTMLElement;

        if (event.shiftKey && document.activeElement === firstElement) {
            event.preventDefault();
            lastElement.focus();
        } else if (!event.shiftKey && document.activeElement === lastElement) {
            event.preventDefault();
            firstElement.focus();
        }
    }

    private handleEscape(): void {
        // Close modals
        const modal = document.querySelector('[role="dialog"]:not([hidden])');
        if (modal) {
            const closeButton = modal.querySelector('[data-close], .modal-close, [aria-label*="close"]');
            if (closeButton instanceof HTMLElement) {
                closeButton.click();
            }
        }

        // Close dropdowns
        const openDropdown = document.querySelector('[aria-expanded="true"]');
        if (openDropdown) {
            openDropdown.setAttribute('aria-expanded', 'false');
        }
    }

    private showAccessibilityHelp(): void {
        const helpContent = `
            Help:
            - Alt + S: Skip to main content
            - F1: Show this help
            - Tab/Shift+Tab: Navigate through interactive elements
            - Escape: Close modals and dropdowns
            - Arrow keys: Navigate within components
            - Enter/Space: Activate buttons and links
        `;
        this.announce(helpContent, 'assertive');
    }

    // User preference detection
    private detectUserPreferences(): void {
        // High contrast
        if (window.matchMedia('(prefers-contrast: high)').matches) {
            this.config.enableHighContrast = true;
            document.documentElement.setAttribute('data-high-contrast', 'true');
        }

        // Reduced motion
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
            this.config.enableReducedMotion = true;
            document.documentElement.setAttribute('data-reduced-motion', 'true');
        }

        // Font size preference
        const storedFontSize = localStorage.getItem('accessibility-font-size');
        if (storedFontSize) {
            this.setFontSize(storedFontSize as AccessibilityConfig['fontSize']);
        }
    }

    // Settings
    setFontSize(size: AccessibilityConfig['fontSize']): void {
        this.config.fontSize = size;
        localStorage.setItem('accessibility-font-size', size);

        const sizeMap = {
            small: '0.875rem',
            normal: '1rem',
            large: '1.125rem',
            'extra-large': '1.25rem'
        };

        document.documentElement.style.fontSize = sizeMap[size];
        this.announce(`Font size set to ${size}`);
        this.notifyConfigChange();
    }

    toggleHighContrast(): void {
        this.config.enableHighContrast = !this.config.enableHighContrast;
        document.documentElement.setAttribute(
            'data-high-contrast',
            this.config.enableHighContrast.toString()
        );
        this.announce(
            `High contrast ${this.config.enableHighContrast ? 'enabled' : 'disabled'}`
        );
        this.notifyConfigChange();
    }

    toggleReducedMotion(): void {
        this.config.enableReducedMotion = !this.config.enableReducedMotion;
        document.documentElement.setAttribute(
            'data-reduced-motion',
            this.config.enableReducedMotion.toString()
        );
        this.announce(
            `Reduced motion ${this.config.enableReducedMotion ? 'enabled' : 'disabled'}`
        );
        this.notifyConfigChange();
    }

    // AI-specific announcements
    announceAIOperation(
        operation: string,
        status: 'started' | 'progress' | 'completed' | 'error',
        details?: string
    ): void {
        const messages = {
            started: `AI ${operation} started`,
            progress: `AI ${operation} in progress${details ? `. ${details}` : ''}`,
            completed: `AI ${operation} completed successfully${details ? `. ${details}` : ''}`,
            error: `AI ${operation} encountered an error${details ? `. ${details}` : ''}`
        };

        this.announce(messages[status], status === 'error' ? 'assertive' : 'polite');
    }

    announceRouteChange(routeName: string): void {
        this.announce(`Navigated to ${routeName}`, 'polite');
    }

    announceFormValidation(field: string, message: string): void {
        this.announce(`${field}: ${message}`, 'assertive');
    }

    // Component helpers
    addLandmarkLabels(): void {
        // Add landmark labels if missing
        const nav = document.querySelector('nav:not([aria-label])');
        if (nav) nav.setAttribute('aria-label', 'Main navigation');

        const main = document.querySelector('main:not([aria-label])');
        if (main) main.setAttribute('aria-label', 'Main content');

        const aside = document.querySelector('aside:not([aria-label])');
        if (aside) aside.setAttribute('aria-label', 'Sidebar');
    }

    enhanceButtons(): void {
        // Enhance buttons without proper labels
        const buttons = document.querySelectorAll('button:not([aria-label]):not([aria-labelledby])');
        buttons.forEach((button) => {
            const text = button.textContent?.trim();
            if (!text) {
                const icon = button.querySelector('svg, i, .icon');
                if (icon) {
                    button.setAttribute('aria-label', 'Button');
                }
            }
        });
    }

    enhanceImages(): void {
        // Add alt text to images without it
        const images = document.querySelectorAll('img:not([alt])');
        images.forEach((img) => {
            img.setAttribute('alt', 'Image');
        });
    }

    getConfig(): AccessibilityConfig {
        return { ...this.config };
    }

    updateConfig(newConfig: Partial<AccessibilityConfig>): void {
        this.config = { ...this.config, ...newConfig };
        this.notifyConfigChange();
    }

    setupFocusManagement(): void {
        // This method was already referenced but implementation was missing or implicit
    }

    announceToScreenReader(message: string, priority: 'polite' | 'assertive' = 'polite'): void {
        this.announce(message, priority);
    }

    onConfigChange(callback: (config: AccessibilityConfig) => void): void {
        this.configChangeCallbacks.push(callback);
    }

    private notifyConfigChange(): void {
        this.configChangeCallbacks.forEach((callback) => callback(this.config));
    }
}

export const accessibilityService = new AccessibilityService();

// Utility functions
export function addAriaLabel(element: HTMLElement, label: string): void {
    element.setAttribute('aria-label', label);
}

export function addAriaDescription(element: HTMLElement, description: string): void {
    const descId = `desc-${Math.random().toString(36).substring(2, 9)}`;
    const descElement = document.createElement('div');
    descElement.id = descId;
    descElement.className = 'sr-only';
    descElement.textContent = description;
    element.appendChild(descElement);
    element.setAttribute('aria-describedby', descId);
}

export function makeKeyboardNavigable(element: HTMLElement, onActivate: () => void): void {
    element.setAttribute('tabindex', '0');
    element.setAttribute('role', 'button');
    element.addEventListener('keydown', (event: KeyboardEvent) => {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            onActivate();
        }
    });
}

export function announceToScreenReader(
    message: string,
    priority: 'polite' | 'assertive' = 'polite'
): void {
    accessibilityService.announceToScreenReader(message, priority);
}
