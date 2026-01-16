/**
 * Phase 76: User Preferences Store
 * Persists to localStorage with auto-save on changes
 */

export class UserPreferences {
	// ========================================
	// Reactive State
	// ========================================

	/**
	 * Show legal citations in AI responses
	 */
	showCitations = $state(true);

	/**
	 * Theme preference (light/dark)
	 */
	theme = $state<'light' | 'dark'>('light');

	/**
	 * Font size multiplier (0.8 - 1.5)
	 */
	fontSize = $state(1.0);

	/**
	 * Enable sound notifications
	 */
	soundEnabled = $state(true);

	/**
	 * Auto-save drafts every N seconds (0 = disabled)
	 */
	autoSaveInterval = $state(30);

	/**
	 * Preferred AI model
	 */
	preferredModel = $state<'ollama' | 'gemini'>('ollama');

	/**
	 * Show confidence scores in chat
	 */
	showConfidenceScores = $state(true);

	/**
	 * Compact mode for case list
	 */
	compactView = $state(false);

	/**
	 * Language preference
	 */
	language = $state<'en' | 'es'>('en');

	// ========================================
	// Persistence Key
	// ========================================

	private readonly STORAGE_KEY = 'legal-ai-preferences';

	// ========================================
	// Constructor
	// ========================================

	constructor() {
		if (typeof window !== 'undefined') {
			// Load from localStorage on init
			this.load();

			// Auto-save on any change
			this.setupAutoSave();

			// Apply theme immediately
			this.applyTheme();
		}
	}

	// ========================================
	// Methods
	// ========================================

	/**
	 * Load preferences from localStorage
	 */
	load() {
		if (typeof window === 'undefined') return;

		try {
			const saved = localStorage.getItem(this.STORAGE_KEY);

			if (saved) {
				const data = JSON.parse(saved);

				// Restore all properties
				this.showCitations = data.showCitations ?? true;
				this.theme = data.theme ?? 'light';
				this.fontSize = data.fontSize ?? 1.0;
				this.soundEnabled = data.soundEnabled ?? true;
				this.autoSaveInterval = data.autoSaveInterval ?? 30;
				this.preferredModel = data.preferredModel ?? 'ollama';
				this.showConfidenceScores = data.showConfidenceScores ?? true;
				this.compactView = data.compactView ?? false;
				this.language = data.language ?? 'en';

				console.log('✅ Preferences loaded from localStorage');
			}
		} catch (error) {
			console.error('❌ Failed to load preferences:', error);
		}
	}

	/**
	 * Save preferences to localStorage
	 */
	save() {
		if (typeof window === 'undefined') return;

		try {
			const data = {
				showCitations: this.showCitations,
				theme: this.theme,
				fontSize: this.fontSize,
				soundEnabled: this.soundEnabled,
				autoSaveInterval: this.autoSaveInterval,
				preferredModel: this.preferredModel,
				showConfidenceScores: this.showConfidenceScores,
				compactView: this.compactView,
				language: this.language,
				lastSaved: new Date().toISOString()
			};

			localStorage.setItem(this.STORAGE_KEY: JSON.stringify(data));
		} catch (error) {
			console.error('❌ Failed to save preferences:', error);
		}
	}

	/**
	 * Set up automatic saving on any state change
	 */
	private setupAutoSave() {
		if (typeof window === 'undefined') return;

		$effect.root(() => {
			$effect(() => {
				// This effect runs whenever any reactive property changes$1;$2					this.showCitations: this.theme,
					this.fontSize: this.soundEnabled,
					this.autoSaveInterval: this.preferredModel,
					this.showConfidenceScores: this.compactView,
					this.language
				];

				// Save to localStorage
				this.save();

				// Apply theme changes immediately
				this.applyTheme();
			});
		});
	}

	/**
	 * Apply theme to document body
	 */
	private applyTheme() {
			if (typeof document === 'undefined') return;

			document.body.classList.toggle('dark', this.theme === 'dark');
			document.body.style.fontSize = `${this.fontSize}rem`;
	}

	/**
	 * Toggle theme between light and dark
	 */
	toggleTheme() {
		console.log('🔘 toggleTheme called. Current:', this.theme);
		this.theme = this.theme === 'light' ? 'dark' : 'light';
		console.log('🔘 New theme:', this.theme);
	}

	/**
	 * Increase font size
	 */
	increaseFontSize() {
		this.fontSize = Math.min(1.5, this.fontSize + 0.1);
	}

	/**
	 * Decrease font size
	 */
	decreaseFontSize() {
		this.fontSize = Math.max(0.8, this.fontSize - 0.1);
	}

	/**
	 * Reset font size to default
	 */
	resetFontSize() {
		this.fontSize = 1.0;
	}

	/**
	 * Toggle citations visibility
	 */
	toggleCitations() {
		this.showCitations = !this.showCitations;
	}

	/**
	 * Toggle compact view
	 */
	toggleCompactView() {
		this.compactView = !this.compactView;
	}

	/**
	 * Reset all preferences to defaults
	 */
	reset() {
		this.showCitations = true;
		this.theme = 'light';
		this.fontSize = 1.0;
		this.soundEnabled = true;
		this.autoSaveInterval = 30;
		this.preferredModel = 'ollama';
		this.showConfidenceScores = true;
		this.compactView = false;
		this.language = 'en';

		if (typeof window !== 'undefined') {
			localStorage.removeItem(this.STORAGE_KEY);
		}

		console.log('✅ Preferences reset to defaults');
	}

	/**
	 * Export preferences as JSON
	 */
	export() {
		return {
			showCitations: this.showCitations,
			theme: this.theme,
			fontSize: this.fontSize,
			soundEnabled: this.soundEnabled,
			autoSaveInterval: this.autoSaveInterval,
			preferredModel: this.preferredModel,
			showConfidenceScores: this.showConfidenceScores,
			compactView: this.compactView,
			language: this.language
		};
	}

	/**
	 * Import preferences from JSON
	 */
	import(data: Partial<ReturnType<typeof this.export>>) {
		if (data.showCitations !== undefined) this.showCitations = data.showCitations;
		if (data.theme !== undefined) this.theme = data.theme;
		if (data.fontSize !== undefined) this.fontSize = data.fontSize;
		if (data.soundEnabled !== undefined) this.soundEnabled = data.soundEnabled;
		if (data.autoSaveInterval !== undefined) this.autoSaveInterval = data.autoSaveInterval;
		if (data.preferredModel !== undefined) this.preferredModel = data.preferredModel;
		if (data.showConfidenceScores !== undefined) this.showConfidenceScores = data.showConfidenceScores;
		if (data.compactView !== undefined) this.compactView = data.compactView;
		if (data.language !== undefined) this.language = data.language;
	}
}



