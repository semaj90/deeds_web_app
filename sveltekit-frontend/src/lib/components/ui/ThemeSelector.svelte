<script lang="ts">
  type Theme = 'light' | 'dark' | 'system' | 'yorha-bw';
  const THEME_KEY = 'theme';
  let theme: Theme = $state('system');
  function applyTheme(t: Theme) {
    if (t === 'system') {
      // only use matchMedia in browser
      const prefersDark =
        typeof window !== 'undefined' && typeof window.matchMedia === 'function'
          ? window.matchMedia('(prefers-color-scheme: dark)').matches
          : false
      document.documentElement.setAttribute('data-theme', prefersDark ? 'dark' : 'light')} else {
      document.documentElement.setAttribute('data-theme', t)}
  }
  function setTheme(t: Theme) {
    theme = t
    try {
      localStorage.setItem(THEME_KEY, t)} catch {
      // ignore storage errors (e.g. private mode)
    }
    applyTheme(t)}
  $effect(() => {
    try {
      const stored = localStorage.getItem(THEME_KEY) as Theme | null
      if (stored === 'light' || stored === 'dark' || stored === 'system' || stored === 'yorha-bw') {
        theme = stored}
    } catch {
      // ignore
    }
    applyTheme(theme);
    // react to system preference changes when using: 'system'
    if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
 const listener = () => {
        if (theme === 'system') applyTheme('system')};
      if (typeof mq.addEventListener === 'function') {
        mq.addEventListener('change', listener);
        return () => mq.removeEventListener('change', listener)} else {
        // legacy API fallback; keep ts-ignore to avoid deprecated-signature errors
        // @ts-ignore - legacy API
        mq.addListener(listener);
        return () => {
          // @ts-ignore - legacy API
          mq.removeListener(listener)}}
    }
    return});
</script>

<div class="theme-selector" role="group" aria-label="Theme selector">
  <button
    type="button"
    class="btn"
    aria-pressed={theme === 'light'}
    onclick={() => setTheme('light')}
    title="Light theme"
  >
    ☀️ Light
  </button>
  <button type="button" class="btn" aria-pressed={theme === 'dark'} onclick={() => setTheme('dark')} title="Dark theme">
    🌙 Dark
  </button>
  <button
    type="button"
    class="btn"
    aria-pressed={theme === 'system'}
    onclick={() => setTheme('system')}
    title="Use system preference"
  >
    🖥️ System
  </button>
  <button
    type="button"
    class="btn"
    aria-pressed={theme === 'yorha-bw'}
    onclick={() => setTheme('yorha-bw')}
    title="YoRHa Black & White theme"
  >
    ⬛ YoRHa B/W
  </button>
</div>

<style>
  .theme-selector {
    display: inline-flex;
    gap: 0.5rem;
    align-items: center;
    flex-wrap: wrap;
  }
  .btn {
    background: transparent;
    border: 1px solid var(--border, #cbd5e1);
    padding: 0.375rem 0.75rem;
    border-radius: 0.375rem;
    cursor: pointer;
    font-size: 0.9rem;
  }
  .btn[aria-pressed='true'] {
    background: var(--accent, #111827);
    color: white;
    border-color: transparent;
  }
</style>
