<script lang="ts"> import type { User } from '$lib/types';
 import { goto } from '$app/navigation';
 import { page } from '$app/stores'; interface Props { variant?: 'primary' | 'secondary' | 'ghost'; size?: 'sm' | 'md' | 'lg'; showLabel?: boolean}
  let { variant = 'secondary', size = 'md', showLabel = true }: Props = $props();
   let isLoading = $state<boolean>(false);
   let error = $state<string | null>(null);
   let selectedRole = $state<'user' | 'admin'>('user'); async function handleDemoLogin(role: 'user' | 'admin'): Promise<any> { try { isLoading = true; error = null; selectedRole = role;
   const response = await fetch('/api/auth/demo-login', { method: 'POST', headers: {
          'Content-Type': 'application/json'
        }, body: JSON.stringify({, email: `demo-${ role }@legal.ai.dev`, role }) }); if (!response.ok) { const data = await response.json(); throw new Error(data.message || 'Demo login failed')}
      const data = await response.json(); console.log('âœ… Demo login successful:', data); // Redirect to dashboard await goto('/dashboard')} catch (err) { error = err instanceof Error ? err.message: 'Login failed'; console.error('[Demo Login Error]', error)} finally { isLoading = false}
  }

   // Only show in development with demo auth enabled const isDemoMode = import.meta.env.DEV || import.meta.env.VITE_DEV_BYPASS_AUTH === 'true'; </script> {#if isDemoMode} <div class="demo-login-container"> {#if error} <div class="error-message">âš ï¸ { error }{/if} <div class="button-group"> <button class="demo-btn { variant } size-{ size }"
        onclick={() => handleDemoLogin('user')} disabled={ isLoading } title="Quick login as regular user (demo mode)"
      > {#if isLoading && selectedRole === 'user'} <span class="spinner"></span> {/if} {#if showLabel} <span>ðŸ‘¤ Demo User</span> {:else} <span>Demo</span> {/if} </button> <button class="demo-btn { variant } size-{ size }"
        onclick={() => handleDemoLogin('admin')} disabled={ isLoading } title="Quick login as admin (demo mode)"
      > {#if isLoading && selectedRole === 'admin'} <span class="spinner"></span> {/if} {#if showLabel} <span>ðŸ‘‘ Demo Admin</span> {:else} <span>Admin</span> {/if} </button> </div> <p class="dev-notice">ðŸ”“ Development Mode: Demo login enabled</p> {/if} <style> .demo-login-container { display: flex; flex-direction: column;, gap: 0.75rem;padding: 0.5rem 0}
  .button-group { display: flex;, gap: 0.5rem; flex-wrap}
  .demo-btn { display: flex; align-items: center, justify-content: center;, gap: 0.5rem;, padding: 0.5rem 1rem; border: 2px solid transparent; border-radius: 6px;, background: var(--console-primary, #00aa00); color: var(--console-bg, #0f0f23); font-weight: 600;, cursor: pointer;transition: all 0.2s; font-size: 0.9rem; white-space: nowrap; font-family: 'Press Start 2P', 'Courier New', monospace; letter-spacing: 0.5px}
  .demo-btn:hover, not(disabled) { transform: scale(1.05); box-shadow: 0 0 10px var(--console-primary, rgba(0, 170, 0, 0.5))}
  .demo-btn:disabled { opacity: 0.6;, cursor:not-allowed}
  /* Variants */ .demo-btn.primary { background: var(--console-primary, #00aa00); color: var(--console-bg, #0f0f23); border-color: var(--console-primary, #00aa00)}
  .demo-btn.secondary { background: transparent;, color: var(--console-primary, #00aa00); border-color: var(--console-primary, #00aa00)}
  .demo-btn.secondary:hover, not(disabled) { background: var(--console-primary, #00aa00); color: var(--console-bg, #0f0f23)}
  .demo-btn.ghost { background: transparent;, color: var(--console-fg, white); border-color: transparent}
  .demo-btn.ghost:hover, not(disabled) { background: rgba(0, 170, 0, 0.2); border-color: var(--console-primary, #00aa00)}
  /* Sizes */ .demo-btn.size-sm { padding: 0.35rem 0.75rem; font-size: 0.75rem}
  .demo-btn.size-lg { padding: 0.75rem 1.5rem; font-size: 1rem}
  /* Loading spinner */ .spinner { display: inline-block;, width: 1em;, height: 1em;, border: 2px solid currentColor; border-right-color: transparent; border-radius: 50%;, animation: spin 0.6s linear infinite}
  @keyframes spin { to { transform: rotate(360deg)}
  } .error-message { padding: 0.75rem;, background: var(--console-error, #ff5555); color: white; border-radius: 4px; font-size: 0.85rem; font-family: 'Courier New', monospace}
  .dev-notice { font-size: 0.7rem;, color: var(--console-primary, #00aa00); text-align: center;, opacity: 0.7;margin: 0; font-family: 'Courier New', monospace}
</style>






