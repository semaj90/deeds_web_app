/**
 * Phase 76: User Preferences Store
 * Persists to localStorage with auto-save on changes
 */

export class UserPreferences {
  // Reactive State
  showCitations = $state(true);
  theme = $state<'light' | 'dark'>('dark'); // Default to dark for YoRHa style
  fontSize = $state(1.0);
  soundEnabled = $state(true);
  autoSaveInterval = $state(30);
  preferredModel = $state<'ollama'>('ollama');
  showConfidenceScores = $state(true);
  compactView = $state(false);
  language = $state<'en' | 'es'>('en');

  private readonly STORAGE_KEY = 'legal-ai-preferences';

  constructor() {
    if (typeof window !== 'undefined') {
      this.load();
      this.setupAutoSave();
      this.applyTheme();
    }
  }

  load() {
    if (typeof window === 'undefined') return;
    try {
      const saved = localStorage.getItem(this.STORAGE_KEY);
      if (saved) {
        const data = JSON.parse(saved);
        this.showCitations = data.showCitations ?? true;
        this.theme = data.theme ?? 'dark';
        this.fontSize = data.fontSize ?? 1.0;
        this.soundEnabled = data.soundEnabled ?? true;
        this.autoSaveInterval = data.autoSaveInterval ?? 30;
        this.preferredModel = data.preferredModel ?? 'ollama';
        this.showConfidenceScores = data.showConfidenceScores ?? true;
        this.compactView = data.compactView ?? false;
        this.language = data.language ?? 'en';
      }
    } catch (error) {
      console.error('Failed to load preferences:', error);
    }
  }

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
        lastSaved: new Date().toISOString(),
      };
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(data));
    } catch (error) {
      console.error('Failed to save preferences:', error);
    }
  }

  private setupAutoSave() {
    if (typeof window === 'undefined') return;
    $effect.root(() => {
      $effect(() => {
        // Trigger on any change
        const _ = [
          this.showCitations,
          this.theme,
          this.fontSize,
          this.soundEnabled,
          this.autoSaveInterval,
          this.preferredModel,
          this.showConfidenceScores,
          this.compactView,
          this.language,
        ];
        this.save();
        this.applyTheme();
      });
    });
  }

  private applyTheme() {
    if (typeof document === 'undefined') return;
    document.body.classList.toggle('dark', this.theme === 'dark');
    document.documentElement.style.fontSize = `${this.fontSize}rem`;
  }

  toggleTheme() {
    this.theme = this.theme === 'light' ? 'dark' : 'light';
  }

  increaseFontSize() {
    this.fontSize = Math.min(1.5, this.fontSize + 0.1);
  }

  decreaseFontSize() {
    this.fontSize = Math.max(0.8, this.fontSize - 0.1);
  }

  reset() {
    this.showCitations = true;
    this.theme = 'dark';
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
  }
}

export const userPrefs = new UserPreferences();



