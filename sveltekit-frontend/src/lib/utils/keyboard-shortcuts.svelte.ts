import { browser } from '$app/environment';

/**
 * Global keyboard shortcut manager using Svelte 5 runes.
 * Ties into the user session — auth-gated shortcuts only fire when authenticated.
 */

export interface Shortcut {
	/** Key combination: 'ctrl+k', 'ctrl+shift+p', 'escape', etc. */
	key: string;
	/** Human-readable description */
	description: string;
	/** Handler function */
	handler: (e: KeyboardEvent) => void;
	/** Only fire when user is authenticated (default: false) */
	requiresAuth?: boolean;
	/** Prevent default browser behavior (default: true) */
	preventDefault?: boolean;
	/** Only fire when NOT in an input/textarea (default: true) */
	ignoreInInput?: boolean;
}

interface ParsedKey {
	ctrl: boolean;
	shift: boolean;
	alt: boolean;
	meta: boolean;
	key: string;
}

function parseKey(combo: string): ParsedKey {
	const parts = combo.toLowerCase().split('+').map((p) => p.trim());
	return {
		ctrl: parts.includes('ctrl') || parts.includes('control'),
		shift: parts.includes('shift'),
		alt: parts.includes('alt'),
		meta: parts.includes('meta') || parts.includes('cmd') || parts.includes('super'),
		key: parts.filter((p) => !['ctrl', 'control', 'shift', 'alt', 'meta', 'cmd', 'super'].includes(p))[0] ?? '',
	};
}

function matchesEvent(parsed: ParsedKey, e: KeyboardEvent): boolean {
	if (parsed.ctrl !== (e.ctrlKey || e.metaKey)) return false;
	if (parsed.shift !== e.shiftKey) return false;
	if (parsed.alt !== e.altKey) return false;

	const eventKey = e.key.toLowerCase();
	const targetKey = parsed.key;

	// Match common aliases
	if (targetKey === 'escape' && eventKey === 'escape') return true;
	if (targetKey === 'enter' && eventKey === 'enter') return true;
	if (targetKey === 'space' && (eventKey === ' ' || eventKey === 'space')) return true;
	if (targetKey === 'backspace' && eventKey === 'backspace') return true;
	if (targetKey === 'delete' && eventKey === 'delete') return true;
	if (targetKey === 'tab' && eventKey === 'tab') return true;

	return eventKey === targetKey;
}

function isInputElement(target: EventTarget | null): boolean {
	if (!target || !(target instanceof HTMLElement)) return false;
	const tag = target.tagName.toLowerCase();
	return tag === 'input' || tag === 'textarea' || tag === 'select' || target.isContentEditable;
}

class KeyboardShortcutManager {
	/** All registered shortcuts */
	shortcuts = $state<Shortcut[]>([]);

	/** Whether the shortcut system is enabled */
	enabled = $state(true);

	/** External auth check — set by consumer (e.g. from userStore.isAuthenticated) */
	isAuthenticated = $state(false);

	/** Derived: count of registered shortcuts */
	count = $derived(this.shortcuts.length);

	private parsedCache = new Map<string, ParsedKey>();
	private listening = false;

	constructor() {
		if (browser) {
			this.startListening();
		}
	}

	/**
	 * Register a keyboard shortcut.
	 * Returns an unregister function.
	 */
	register(shortcut: Shortcut): () => void {
		this.shortcuts = [...this.shortcuts, shortcut];

		// Cache the parsed key
		if (!this.parsedCache.has(shortcut.key)) {
			this.parsedCache.set(shortcut.key, parseKey(shortcut.key));
		}

		return () => this.unregister(shortcut.key);
	}

	/**
	 * Unregister a shortcut by key combo.
	 */
	unregister(key: string): void {
		this.shortcuts = this.shortcuts.filter((s) => s.key !== key);
		this.parsedCache.delete(key);
	}

	/**
	 * Unregister all shortcuts.
	 */
	clear(): void {
		this.shortcuts = [];
		this.parsedCache.clear();
	}

	private startListening(): void {
		if (this.listening) return;
		this.listening = true;

		document.addEventListener('keydown', this.handleKeyDown);
	}

	destroy(): void {
		if (!this.listening) return;
		this.listening = false;
		document.removeEventListener('keydown', this.handleKeyDown);
	}

	private handleKeyDown = (e: KeyboardEvent): void => {
		if (!this.enabled) return;

		for (const shortcut of this.shortcuts) {
			const parsed = this.parsedCache.get(shortcut.key);
			if (!parsed) continue;

			if (!matchesEvent(parsed, e)) continue;

			// Skip if in input and shortcut says to ignore
			if ((shortcut.ignoreInInput ?? true) && isInputElement(e.target)) continue;

			// Skip if requires auth but not authenticated
			if (shortcut.requiresAuth && !this.isAuthenticated) continue;

			if (shortcut.preventDefault ?? true) {
				e.preventDefault();
				e.stopPropagation();
			}

			shortcut.handler(e);
			return; // Only fire first matching shortcut
		}
	};
}

/** Global singleton keyboard shortcut manager */
export const keyboardShortcuts = new KeyboardShortcutManager();
