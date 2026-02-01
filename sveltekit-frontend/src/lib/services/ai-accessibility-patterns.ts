/**
 * AI-Specific Accessibility Patterns for Legal AI Application
 * Enhanced accessibility features tailored for AI interactions and complex legal outputs
 */
import { accessibilityService } from './accessibility-service.js';

export interface AIAccessibilityOptions {
    enableVoiceCommands?: boolean;
    progressiveDisclosure?: boolean;
    enhancedFocusIndicators?: boolean;
    aiResultSummaries?: boolean;
    contextualHelp?: boolean;
}

export class AIAccessibilityPatterns {
    private options: Required<AIAccessibilityOptions>;
    private voiceRecognition: any = null;
    private currentAIContext: string | null = null;

    constructor(options: AIAccessibilityOptions = {}) {
        this.options = {
            enableVoiceCommands: options.enableVoiceCommands ?? true,
            progressiveDisclosure: options.progressiveDisclosure ?? true,
            enhancedFocusIndicators: options.enhancedFocusIndicators ?? true,
            aiResultSummaries: options.aiResultSummaries ?? true,
            contextualHelp: options.contextualHelp ?? true
        };
        this.initializeVoiceCommands();
        this.setupEnhancedFocusIndicators();
    }

    /**
     * Initialize voice commands for AI interactions
     */
    private initializeVoiceCommands() {
        // Check if we're in a browser environment
        if (typeof window === 'undefined') {
            return;
        }

        if (!this.options.enableVoiceCommands || (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window))) {
            return;
        }

        const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        this.voiceRecognition = new SR();
        this.voiceRecognition.continuous = false;
        this.voiceRecognition.interimResults = false;
        this.voiceRecognition.lang = 'en-US';

        this.voiceRecognition.onresult = (event: any) => {
            const command = event.results[0][0].transcript.toLowerCase().trim();
            this.processVoiceCommand(command);
        };

        this.voiceRecognition.onerror = (event: any) => {
            console.warn('Voice recognition error: ', event.error);
            (accessibilityService as any).announce('Voice command error. Please try again or use keyboard navigation.');
        };
    }

    /**
     * Process voice commands for AI operations
     */
    private processVoiceCommand(command: string) {
        const commands = {
            'start analysis': () => this.triggerAIAnalysis(),
            'analyze document': () => this.triggerAIAnalysis(),
            'read summary': () => this.readAISummary(),
            'next result': () => this.navigateAIResults('next'),
            'previous result': () => this.navigateAIResults('previous'),
            'expand details': () => this.expandCurrentResult(),
            'collapse details': () => this.collapseCurrentResult(),
            'help': () => this.showContextualHelp(),
            'stop analysis': () => this.stopAIOperation()
        };

        const matchedCommand = Object.keys(commands).find(
            (cmd) => command.includes(cmd) || cmd.includes(command)
        );

        if (matchedCommand) {
            (accessibilityService as any).announce(`Executing: ${matchedCommand}`);
            commands[matchedCommand as keyof typeof commands]();
        } else {
            (accessibilityService as any).announce('Voice command not recognized. Say: "help" for available commands.');
        }
    }

    /**
     * Enhanced focus indicators for AI components
     */
    private setupEnhancedFocusIndicators() {
        if (typeof document === 'undefined' || !this.options.enhancedFocusIndicators) return;

        const style = document.createElement('style');
        style.textContent = `
            .ai-component:focus-visible, .ai-result:focus-visible, .ai-action:focus-visible {
                outline: 3px solid #00bcd4;
                outline-offset: 2px;
                border-radius: 4px;
                box-shadow: 0 0 0 6px rgba(0, 188, 212, 0.2);
                transition: all 0.2s ease;
            }
            .ai-processing:focus-visible {
                outline-color: #ff9800;
                box-shadow: 0 0 0 6px rgba(255, 152, 0, 0.2);
            }
            .ai-error:focus-visible {
                outline-color: #f44336;
                box-shadow: 0 0 0 6px rgba(244, 67, 54, 0.2);
            }
            .ai-success:focus-visible {
                outline-color: #4caf50;
                box-shadow: 0 0 0 6px rgba(76, 175, 80, 0.2);
            }
            /* High contrast mode enhancements */
            @media (prefers-contrast: high) {
                .ai-component:focus-visible {
                    outline-width: 4px;
                    box-shadow: 0 0 0 8px rgba(0, 188, 212, 0.4);
                }
            }
            /* Reduced motion support */
            @media (prefers-reduced-motion: reduce) {
                .ai-component:focus-visible {
                    transition: none;
                }
            }
        `;
        document.head.appendChild(style);
    }

    /**
     * Create progressive disclosure for complex AI outputs
     */
    createProgressiveDisclosure(
        container: HTMLElement,
        data: Record<string, unknown>,
        options: {
	summary: string, levels: Array<{
	label: string, content: unknown, level: number }> }
    ) {
        if (typeof document === 'undefined' || !this.options.progressiveDisclosure) {
            if (typeof document !== 'undefined') {
                container.innerHTML = JSON.stringify(data, null, 2);
            }
            return;
        }

        const disclosure = document.createElement('div');
        disclosure.className = 'ai-progressive-disclosure';
        disclosure.setAttribute('role', 'region');
        disclosure.setAttribute('aria-label', 'AI Analysis Results');

        // Summary level
        const summary = document.createElement('div');
        summary.className = 'ai-summary';
        summary.innerHTML = `
            <h3>Analysis Summary</h3>
            <p>${options.summary}</p>
            <button class="expand-btn nes-btn is-primary" aria-expanded="false" aria-controls="ai-details">
                Show Details
            </button>
        `;

        // Detailed content
        const details = document.createElement('div');
        details.id = 'ai-details';
        details.className = 'ai-details';
        details.style.display = 'none';

        options.levels.forEach((level) => {
            const section = document.createElement('section');
            section.className = `ai-level-${level.level}`;
            section.innerHTML = `
                <h${Math.min(level.level + 3, 6)}>${level.label}</h${Math.min(level.level + 3, 6)}>
                <div class="ai-content" role="region" aria-label="${level.label} details">
                    ${this.formatAIContent(level.content)}
                </div>
            `;
            details.appendChild(section);
        });

        disclosure.appendChild(summary);
        disclosure.appendChild(details);
        container.appendChild(disclosure);

        // Interactive behavior
        const btn = summary.querySelector('button');
        if (btn) {
            btn.onclick = () => {
                const isExpanded = btn.getAttribute('aria-expanded') === 'true';
                btn.setAttribute('aria-expanded', String(!isExpanded));
                btn.textContent = !isExpanded ? 'Hide Details' : 'Show Details';
                details.style.display = !isExpanded ? 'block' : 'none';
            };
        }

        // Announce creation to screen reader
        (accessibilityService as any).announce(`AI analysis complete. ${options.summary}. Use tab to navigate details.`);
    }

    /**
     * Format AI content for accessibility
     */
    private formatAIContent(content: unknown): string {
        if (typeof content === 'string') {
            return `<p>${content}</p>`;
        }
        if (Array.isArray(content)) {
            return `
                <ul role="list">
                    ${content.map(item => `<li>${this.formatAIContent(item)}</li>`).join('')}
                </ul>
            `;
        }
        if (typeof content === 'object' && content !== null) {
            return `
                <dl>
                    ${Object.entries(content).map(([key, value]) => `
                        <dt>${key}:</dt>
                        <dd>${this.formatAIContent(value)}</dd>
                    `).join('')}
                </dl>
            `;
        }
        return String(content);
    }

    /**
     * Create accessible AI result cards with enhanced navigation
     */
    createAccessibleAIResult(container: HTMLElement, result: any): HTMLElement {
        const card = document.createElement('article');
        card.className = 'ai-result-card ai-component';
        card.setAttribute('role', 'article');
        card.setAttribute('tabindex', '0');
        card.setAttribute('aria-label', `AI analysis result: ${(result as any)?.title ?? 'Untitled'}`);

        card.innerHTML = `
            <header class="ai-result-header">
                <h3>${(result as any)?.title ?? 'AI Analysis Result'}</h3>
                <div class="ai-result-meta" aria-label="Result metadata">
                    <span class="confidence" aria-label="Confidence score">
                        Confidence: ${Math.round(((result as any)?.confidence ?? 0) * 100)}%
                    </span>
                    <span class="timestamp" aria-label="Analysis time">
                        ${new Date((result as any)?.timestamp ?? Date.now()).toLocaleString()}
                    </span>
                </div>
            </header>
            <div class="ai-result-content" role="region" aria-label="Analysis content">
                ${this.formatAIContent((result as any)?.content ?? result)}
            </div>
            <footer class="ai-result-actions">
                <button class="action-btn nes-btn is-success" onclick="this.closest('.ai-result-card').dispatchEvent(new CustomEvent('ai-result-accept', { detail: this.closest('.ai-result-card'), bubbles: true }))" aria-label="Accept this analysis result">
                    Accept
                </button>
                <button class="action-btn nes-btn is-warning" onclick="this.closest('.ai-result-card').dispatchEvent(new CustomEvent('ai-result-review', { detail: this.closest('.ai-result-card'), bubbles: true }))" aria-label="Flag this result for review">
                    Review
                </button>
                <button class="action-btn nes-btn is-error" onclick="this.closest('.ai-result-card').dispatchEvent(new CustomEvent('ai-result-reject', { detail: this.closest('.ai-result-card'), bubbles: true }))" aria-label="Reject this analysis result">
                    Reject
                </button>
            </footer>
        `;

        // Add keyboard navigation
        card.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                const firstAction = card.querySelector('.action-btn') as HTMLButtonElement;
                firstAction?.focus();
            }
        });

        container.appendChild(card);
        return card;
    }

    /**
     * Announce AI operation status with context
     */
    announceAIOperation(operation: string, status: 'started' | 'progress' | 'completed' | 'error', details?: string) {
        this.currentAIContext = operation;
        const messages = {
            started: `${operation} started. Please wait for completion.`,
            progress: `${operation} in progress. ${details ?? ''}`,
            completed: `${operation} completed successfully. ${details ?? 'Results are now available.'}`,
            error: `${operation} failed. ${details ?? 'Please try again or contact support.'}`
        };

        (accessibilityService as any).announce(messages[status]);

        // Update live region for continuous feedback
        const liveRegion = document.getElementById('ai-status-live') || this.createAIStatusLiveRegion();
        liveRegion.textContent = messages[status];
    }

    /**
     * Create live region for AI status updates
     */
    private createAIStatusLiveRegion(): HTMLElement {
        const liveRegion = document.createElement('div');
        liveRegion.id = 'ai-status-live';
        liveRegion.setAttribute('aria-live', 'polite');
        liveRegion.setAttribute('aria-atomic', 'true');
        liveRegion.style.position = 'absolute';
        liveRegion.style.left = '-10000px';
        liveRegion.style.width = '1px';
        liveRegion.style.height = '1px';
        liveRegion.style.overflow = 'hidden';
        document.body.appendChild(liveRegion);
        return liveRegion;
    }

    /**
     * Voice command methods
     */
    private triggerAIAnalysis() {
        const analyzeButton = document.querySelector('[data-ai-action="analyze"]') as HTMLButtonElement;
        if (analyzeButton) {
            analyzeButton.click();
        } else {
            (accessibilityService as any).announce('Analysis button not found. Please navigate to the AI section.');
        }
    }

    private readAISummary() {
        const summary = document.querySelector('.ai-summary, .ai-result-summary');
        if (summary) {
            (accessibilityService as any).announce(`Summary: ${summary.textContent}`);
        } else {
            (accessibilityService as any).announce('No summary available to read.');
        }
    }

    private navigateAIResults(direction: 'next' | 'previous') {
        const results = Array.from(document.querySelectorAll('.ai-result-card'));
        if (results.length === 0) {
            (accessibilityService as any).announce('No results found.');
            return;
        }

        let currentIndex = results.findIndex(r => r === document.activeElement || r.contains(document.activeElement));
        let targetIndex;

        if (currentIndex === -1) {
            targetIndex = direction === 'next' ? 0 : results.length - 1;
        } else {
            targetIndex = direction === 'next' ? currentIndex + 1 : currentIndex - 1;
        }

        if (targetIndex >= results.length) targetIndex = 0;
        if (targetIndex < 0) targetIndex = results.length - 1;

        const target = results[targetIndex] as HTMLElement;
        target.focus();
        target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    private expandCurrentResult() {
        const activeCard = document.activeElement?.closest('.ai-progressive-disclosure');
        const btn = activeCard?.querySelector('.expand-btn') as HTMLButtonElement;
        if (btn && btn.getAttribute('aria-expanded') === 'false') {
            btn.click();
            (accessibilityService as any).announce('Details expanded.');
        } else {
            (accessibilityService as any).announce('No expandable details found.');
        }
    }

    private collapseCurrentResult() {
        const activeCard = document.activeElement?.closest('.ai-progressive-disclosure');
        const btn = activeCard?.querySelector('.expand-btn') as HTMLButtonElement;
        if (btn && btn.getAttribute('aria-expanded') === 'true') {
            btn.click();
            (accessibilityService as any).announce('Details collapsed.');
        } else {
            (accessibilityService as any).announce('No collapsible details found.');
        }
    }

    private showContextualHelp() {
        const helpText = `
            Available voice commands:
            "Start analysis" to begin AI processing.
            "Read summary" to hear the analysis summary.
            "Next result" or "Previous result" to navigate between results.
            "Expand details" or "Collapse details" to show/hide detailed information.
            "Stop analysis" to halt the current AI operation.

            You can also use keyboard navigation:
            Tab to move between elements.
            Enter or Space to activate buttons.
            Alt + A to jump to AI settings.
            Alt + S to skip to main content.
        `;
        (accessibilityService as any).announce(helpText);
    }

    private stopAIOperation() {
        if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('ai-operation-stop'));
            (accessibilityService as any).announce('AI operation stopped.');
        }
    }
}





