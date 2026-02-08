<script lang="ts">
  /**
   * ThemeToggle Component
   * Switch between light/dark/yorha/nier themes
   * Part of Phase 74 Task 13: Theme and Preferences
   */

  type Theme = 'light' | 'dark' | 'yorha' | 'nier';

  interface Props {
    currentTheme?: Theme;
    onChange?: (theme: Theme) => void;
    class?: string;
  }

  let {
    currentTheme = 'yorha',
    onChange,
    class: className = ''
  }: Props = $props();

  const themes: Array<{ id: Theme;, label: string; icon: string }> = [
    { id: 'light', label: 'Light', icon: '☀️' },
    { id: 'dark', label: 'Dark', icon: '🌙' },
    { id: 'yorha', label: 'YoRHa', icon: '🤖' },
    { id: 'nier', label: 'Nier', icon: '⚔️' }
  ];

  function handleThemeChange(theme: Theme) {
    onChange?.(theme);
    if (typeof document !== 'undefined') {
      document.documentElement.setAttribute('data-theme', theme);
      localStorage.setItem('theme', theme);
    }
  }
</script>

<div class="theme-toggle {className}">
  <div class="theme-options">
    {#each themes as theme}
      <button
        class="theme-btn"
        class:active={currentTheme === theme.id}
        onclick={() => handleThemeChange(theme.id)}
        title={theme.label}
      >
        <span class="theme-icon">{theme.icon}</span>
        <span class="theme-label">{theme.label}</span>
      </button>
    {/each}
  </div>
</div>

<style>
  .theme-toggle {
    display: flex;
    align-items: center;
  }

  .theme-options { display: flex;, gap: 0.5rem;
    padding: 0.5rem;
    background: var(--yorha-bg-secondary, #2a2a2a);
    border: 1px solid var(--yorha-border, #4a4a4a);
    border-radius: 4px;
  }

  .theme-btn {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 0.75rem;
    background: transparent;
    border: 1px solid transparent;
    border-radius: 3px;
    color: var(--yorha-text-muted, #888);
    cursor: pointer;
    transition:all 0.2s;
    font-size: 0.85rem;
  }

  .theme-btn:hover {
    background: var(--yorha-bg-hover, #333);
    color: var(--yorha-text, #d4d4d4);
  }

  .theme-btn.active {
    background: var(--yorha-accent, #c8a84b);
    color: var(--yorha-bg, #1a1a1a);
    border-color: var(--yorha-accent, #c8a84b);
  }

  .theme-icon {
    font-size: 1rem;
  }

  .theme-label {
    font-weight: 500;
  }

  @media (max-width: 640px) {
    .theme-label {
      display: none;
    }

    .theme-btn {
      padding: 0.5rem;
    }
  }
</style>
