/**
 * Remote Control Keyboard Shortcuts Service
 * Advanced keyboard shortcut system with remote control capabilities
 * Supports global shortcuts, contextual shortcuts, and remote command execution
 */
import { browser } from '$app/environment';
import { writable, type Writable } from 'svelte/store';
import { detectEnvironment } from '$lib/types/enhanced-svelte5-types';

export interface KeyboardShortcut {
    id: string;
	key: string;
    ctrl?: boolean;
    alt?: boolean;
    shift?: boolean;
    meta?: boolean;
	description: string;
    category: 'navigation' | 'ai' | 'cases' | 'evidence' | 'system' | 'remote';
    context?: string[];
	action: () => void | Promise<void>;
    enabled?: boolean;
    remote?: boolean; // Can be triggered remotely
}

export interface RemoteCommand {
    id: string;
	command: string;
    args?: { [key: string]: any };
    source: 'keyboard' | 'api' | 'websocket' | 'voice';
    timestamp: number;
}

export interface ShortcutCategory {
    id: string;
	name: string;
    shortcuts: KeyboardShortcut[];
	enabled: boolean;
}

class KeyboardShortcutsService {
    private shortcuts = new Map<string, KeyboardShortcut>();
    private activeContext: string[] = ['global'];
    private isListening = false;
    private remoteEndpoint: string | null = null;

    // Stores
    public shortcutsStore: Writable<KeyboardShortcut[]> = writable([]);
    public categoriesStore: Writable<ShortcutCategory[]> = writable([]);
    public remoteCommandsStore: Writable<RemoteCommand[]> = writable([]);
    public isConnectedStore: Writable<boolean> = writable(false);

    constructor() {
        this.initializeDefaultShortcuts();
        if (browser) {
            this.startListening();
            this.initializeRemoteConnection();
        }
    }

    private initializeDefaultShortcuts() {
        const defaultShortcuts: KeyboardShortcut[] = [
            // Navigation shortcuts
            { id: 'nav-home', key: 'h', ctrl: true, description: 'Navigate to home', category: 'navigation', action: () => this.navigate('/') },
	{ id: 'nav-cases', key: 'c', ctrl: true, description: 'Navigate to cases', category: 'navigation', action: () => this.navigate('/cases') },
	{ id: 'nav-evidence', key: 'e', ctrl: true, description: 'Navigate to evidence', category: 'navigation', action: () => this.navigate('/evidence') },
	{ id: 'nav-ai', key: 'a', ctrl: true, description: 'Navigate to AI assistant', category: 'navigation', action: () => this.navigate('/ai') },
	// AI shortcuts
            { id: 'ai-chat-toggle', key: 'space', ctrl: true, shift: true, description: 'Toggle AI chat', category: 'ai', remote: true, action: () => this.toggleAIChat() },
	{ id: 'ai-analyze', key: 'r', ctrl: true, description: 'Analyze current document with AI', category: 'ai', context: ['evidence', 'document'], remote: true, action: () => this.analyzeWithAI() },
	{ id: 'ai-summarize', key: 's', ctrl: true, shift: true, description: 'Summarize current content', category: 'ai', remote: true, action: () => this.summarizeContent() },
	// Case management shortcuts
            { id: 'case-new', key: 'n', ctrl: true, description: 'Create new case', category: 'cases', context: ['cases'], action: () => this.createNewCase() },
	{ id: 'case-search', key: 'f', ctrl: true, description: 'Search cases', category: 'cases', action: () => this.openCaseSearch() },
	// Evidence shortcuts
            { id: 'evidence-upload', key: 'u', ctrl: true, description: 'Upload evidence', category: 'evidence', context: ['evidence', 'cases'], action: () => this.uploadEvidence() },
	{ id: 'evidence-tag', key: 't', ctrl: true, description: 'Tag evidence', category: 'evidence', context: ['evidence'], action: () => this.tagEvidence() },
	// System shortcuts
            { id: 'system-command-palette', key: 'p', ctrl: true, shift: true, description: 'Open command palette', category: 'system', action: () => this.openCommandPalette() },
	{ id: 'system-help', key: 'h', shift: true, description: 'Show keyboard shortcuts help', category: 'system', action: () => this.showHelp() },
	{ id: 'system-settings', key: 'comma', ctrl: true, description: 'Open settings', category: 'system', action: () => this.openSettings() },
	// Remote control shortcuts
            { id: 'remote-connect', key: 'r', ctrl: true, alt: true, description: 'Connect to remote control server', category: 'remote', remote: true, action: () => this.connectRemote() },
	{ id: 'remote-disconnect', key: 'd', ctrl: true, alt: true, description: 'Disconnect from remote control', category: 'remote', remote: true, action: () => this.disconnectRemote() },
	{ id: 'remote-status', key: 'i', ctrl: true, alt: true, description: 'Show remote connection status', category: 'remote', remote: true, action: () => this.showRemoteStatus() }
        ];

        // Register all shortcuts
        defaultShortcuts.forEach(shortcut => { this.registerShortcut(shortcut); });
        this.updateStores();
    }

    public registerShortcut(shortcut: KeyboardShortcut) {
        shortcut.enabled = shortcut.enabled !== undefined ? shortcut.enabled : true; // Default to enabled
        this.shortcuts.set(shortcut.id, shortcut);
        this.updateStores();
    }

    public unregisterShortcut(id: string) {
        this.shortcuts.delete(id);
        this.updateStores();
    }

    public setContext(context: string[]) {
        this.activeContext = ['global', ...context];
    }

    public addContext(context: string) {
        if (!this.activeContext.includes(context)) {
            this.activeContext.push(context);
        }
    }

    public removeContext(context: string) {
        this.activeContext = this.activeContext.filter(c => c !== context);
        if (this.activeContext.length === 0) {
            this.activeContext = ['global'];
        }
    }

    private startListening() {
        if (!browser || this.isListening) return;
        document.addEventListener('keydown', this.handleKeydown.bind(this));
        this.isListening = true;
    }

    private handleKeydown(event: KeyboardEvent) {
        // Don't trigger shortcuts when typing in inputs
        if (this.isTypingContext(event.target as Element)) {
            return;
        }
        const matchedShortcut = this.findMatchingShortcut(event);
        if (matchedShortcut) {
            event.preventDefault();
            event.stopPropagation();
            this.executeShortcut(matchedShortcut, 'keyboard');
        }
    }

    private isTypingContext(target: Element | null): boolean {
        if (!target) return false;
        const tagName = target.tagName.toLowerCase();
        const isInput = ['input', 'textarea', 'select'].includes(tagName);
        const isContentEditable = target.hasAttribute('contenteditable');
        return isInput || isContentEditable;
    }

    private findMatchingShortcut(event: KeyboardEvent): KeyboardShortcut | null {
        for (const shortcut of this.shortcuts.values()) {
            if (!shortcut.enabled) continue;
            // Check if shortcut applies to current context
            if (shortcut.context && !shortcut.context.some(ctx => this.activeContext.includes(ctx)) && !this.activeContext.includes('global')) {
                continue;
            }
            // Check key combination
            if (this.matchesKeyCombo(event, shortcut)) {
                return shortcut;
            }
        }
        return null;
    }

    private matchesKeyCombo(event: KeyboardEvent, shortcut: KeyboardShortcut): boolean {
        const key = event.key.toLowerCase();
        const shortcutKey = shortcut.key.toLowerCase();
        // Handle special keys
        const keyMatch = key === shortcutKey || (shortcutKey === 'space' && key === ' ') || (shortcutKey === 'comma' && key === ',');
        const ctrlMatch = !!shortcut.ctrl === (event.ctrlKey || event.metaKey);
        const altMatch = !!shortcut.alt === event.altKey;
        const shiftMatch = !!shortcut.shift === event.shiftKey;
        const metaMatch = !!shortcut.meta === event.metaKey;
        return keyMatch && ctrlMatch && altMatch && shiftMatch && metaMatch;
    }

    private async executeShortcut(shortcut: KeyboardShortcut, source: RemoteCommand['source'] = 'keyboard') {
        try {
            console.log(`🎹 Executing shortcut: ${shortcut.id}(${shortcut.description})`);
            // Log the command for remote tracking
            this.logRemoteCommand({
                id: crypto.randomUUID(),
                command: shortcut.id,
                args: {
	description: shortcut.description, category: shortcut.category },
	source: source,
                timestamp: Date.now()
            });
            await shortcut.action();
        } catch (error: any) {
            console.error(`❌ Shortcut execution failed: ${shortcut.id}`, error);
        }
    }

    // Remote control methods
    private async initializeRemoteConnection() {
        // Try to connect to remote control WebSocket
        try {
            await this.connectToRemoteServer('ws://localhost:8085/keyboard-remote');
        } catch (error: any) {
            console.log('🔌 Remote control server not available, continuing in local mode');
        }
    }

    private async connectToRemoteServer(endpoint: string) {
        this.remoteEndpoint = endpoint;
        try {
            const ws = new WebSocket(endpoint);
            ws.onopen = () => {
                console.log('🔗 Connected to remote control server');
                this.isConnectedStore.set(true);
            };
            ws.onmessage = (event: MessageEvent) => {
                try {
                    const command = JSON.parse(event.data) as RemoteCommand;
                    this.executeRemoteCommand(command);
                } catch (error: any) {
                    console.error('❌ Invalid remote command: ', error);
                }
            };
            ws.onclose = () => {
                console.log('🔌 Disconnected from remote control server');
                this.isConnectedStore.set(false);
            };
            ws.onerror = (error) => {
                console.error('❌ Remote control connection error: ', error);
                this.isConnectedStore.set(false);
            }
        } catch (error: any) {
            console.error('❌ Failed to connect to remote control server: ', error);
            this.isConnectedStore.set(false);
        }
    }

    public async executeRemoteCommand(command: RemoteCommand) {
        const shortcut = this.shortcuts.get(command.command);
        if (!shortcut) {
            console.error(`❌ Unknown remote command: ${command.command}`);
            return;
        }
        if (!shortcut.remote) {
            console.error(`❌ Shortcut not enabled for remote execution: ${command.command}`);
            return;
        }
        this.logRemoteCommand(command);
        await this.executeShortcut(shortcut, command.source);
    }

    private logRemoteCommand(command: RemoteCommand) {
        this.remoteCommandsStore.update(commands => {
            const newCommands = [...commands, command];
            // Keep only last 100 commands
            return newCommands.slice(-100);
        });
    }

    // Action implementations
    private navigate(path: string) {
        if (browser) {
            window.location.href = path;
        }
    }

    private toggleAIChat() {
        // Dispatch custom event to toggle AI chat
        if (browser) {
            document.dispatchEvent(new CustomEvent('toggle-ai-chat'));
        }
    }

    private async analyzeWithAI() {
        // Dispatch custom event for AI analysis
        if (browser) {
            document.dispatchEvent(new CustomEvent('ai-analyze-content'));
        }
    }

    private async summarizeContent() {
        // Dispatch custom event for AI summarization
        if (browser) {
            document.dispatchEvent(new CustomEvent('ai-summarize-content'));
        }
    }

    private createNewCase() {
        this.navigate('/cases/new');
    }

    private openCaseSearch() {
        if (browser) {
            document.dispatchEvent(new CustomEvent('open-case-search'));
        }
    }

    private uploadEvidence() {
        if (browser) {
            document.dispatchEvent(new CustomEvent('upload-evidence'));
        }
    }

    private tagEvidence() {
        if (browser) {
            document.dispatchEvent(new CustomEvent('tag-evidence'));
        }
    }

    private openCommandPalette() {
        if (browser) {
            document.dispatchEvent(new CustomEvent('open-command-palette'));
        }
    }

    private showHelp() {
        if (browser) {
            document.dispatchEvent(new CustomEvent('show-keyboard-help'));
        }
    }

    private openSettings() {
        this.navigate('/settings');
    }

    private async connectRemote() {
        if (this.remoteEndpoint) {
            await this.connectToRemoteServer(this.remoteEndpoint);
        } else {
            // Try default endpoint
            await this.connectToRemoteServer('ws://localhost:8085/keyboard-remote');
        }
    }

    private disconnectRemote() {
        this.isConnectedStore.set(false);
        console.log('🔌 Disconnected from remote control');
    }

    private showRemoteStatus() {
        if (browser) {
            document.dispatchEvent(new CustomEvent('show-remote-status'));
        }
    }

    private updateStores() {
        const shortcuts = Array.from(this.shortcuts.values());
        this.shortcutsStore.set(shortcuts);
        // Group by category
        const categories = this.groupShortcutsByCategory(shortcuts);
        this.categoriesStore.set(categories);
    }

    private groupShortcutsByCategory(shortcuts: KeyboardShortcut[]): ShortcutCategory[] {
        const groups = new Map<string, KeyboardShortcut[]>();
        shortcuts.forEach(shortcut => {
            if (!groups.has(shortcut.category)) {
                groups.set(shortcut.category, []);
            }
            groups.get(shortcut.category)!.push(shortcut);
        });
        return Array.from(groups.entries()).map(([id, shortcuts]) => ({
            id,
            name: this.getCategoryName(id),
            shortcuts: shortcuts.sort((a, b) => a.description.localeCompare(b.description)),
            enabled: shortcuts.some(s => s.enabled)
        }));
    }

    private getCategoryName(category: string): string {
        const names: Record<string, string> = {
            navigation: 'Navigation',
            ai: 'AI Assistant',
            cases: 'Case Management',
            evidence: 'Evidence',
            system: 'System',
            remote: 'Remote Control'
        };
        return names[category] || category;
    }

    // Public API methods
    public getShortcut(id: string): KeyboardShortcut | undefined {
        return this.shortcuts.get(id);
    }

    public enableShortcut(id: string) {
        const shortcut = this.shortcuts.get(id);
        if (shortcut) {
            shortcut.enabled = true;
            this.shortcuts.set(id, shortcut);
            this.updateStores();
        }
    }

    public disableShortcut(id: string) {
        const shortcut = this.shortcuts.get(id);
        if (shortcut) {
            shortcut.enabled = false;
            this.shortcuts.set(id, shortcut);
            this.updateStores();
        }
    }
}

export const keyboardShortcuts = new KeyboardShortcutsService();






