<!-- Root layout for Evidence Management App -->
<script lang="ts">
  import { page } from '$app/stores';
  import { currentUser, isAuthenticated, authActions } from '$lib/stores/authStore';
  import { onMount } from 'svelte';
  import type { Snippet } from 'svelte';

  interface Props {
    children?: Snippet;
  }

  let { children }: Props = $props();

  // Initialize authentication on mount
  onMount(() => {
    authActions.initializeAuth();
  });

  // Derive navigation state
  let isLoginPage = $derived($page.url.pathname === '/login');
  let showNavigation = $derived($isAuthenticated && !isLoginPage);
</script>

<!-- Global styles -->
<style>
  :global(body) {
    margin: 0;
    padding: 0;
    font-family: 'Courier New', monospace;
    background: #1a1a1a;
    color: #ffffff;
  }

  .app-layout {
    min-height: 100vh;
    display: flex;
    flex-direction: column;
  }

  .navbar {
    background: #2a2a2a;
    border-bottom: 2px solid #495057;
    padding: 1rem;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .nav-brand {
    font-size: 1.5rem;
    font-weight: bold;
    color: #00ff00;
  }

  .nav-links {
    display: flex;
    gap: 1rem;
    align-items: center;
  }

  .nav-link {
    color: #ffffff;
    text-decoration: none;
    padding: 0.5rem 1rem;
    border: 2px solid transparent;
    transition: all 0.2s ease;
  }

  .nav-link:hover {
    border-color: #007bff;
    background: rgba(0, 123, 255, 0.1);
  }

  .nav-link.active {
    border-color: #00ff00;
    background: rgba(0, 255, 0, 0.1);
  }

  .user-info {
    color: #ccc;
    font-size: 0.9rem;
  }

  .main-content {
    flex: 1;
    padding: 0;
  }

  .login-container {
    display: flex;
    justify-content: center;
    align-items: center;
    min-height: 100vh;
    padding: 2rem;
  }
</style>

<div class="app-layout">
  {#if showNavigation}
    <!-- Navigation bar for authenticated users -->
    <nav class="navbar">
      <div class="nav-brand">
        🕵️ YoRHa Detective
      </div>

      <div class="nav-links">
        <a href="/" class="nav-link" class:active={$page.url.pathname === '/'}>
          📊 Dashboard
        </a>
        <a href="/cases" class="nav-link" class:active={$page.url.pathname.startsWith('/cases')}>
          📁 Cases
        </a>
        <a href="/evidence" class="nav-link" class:active={$page.url.pathname.startsWith('/evidence')}>
          🔍 Evidence
        </a>
        <a href="/board" class="nav-link" class:active={$page.url.pathname === '/board'}>
          📌 Investigation Board
        </a>
        <a href="/ai-chat" class="nav-link" class:active={$page.url.pathname === '/ai-chat'}>
          🤖 AI Assistant
        </a>
      </div>

      <div class="nav-links">
        {#if $currentUser}
          <div class="user-info">
            👤 {$currentUser.name} ({$currentUser.role})
          </div>
          <button
            class="nes-btn is-error"
            onclick={() => authActions.logout()}
          >
            Logout
          </button>
        {/if}
      </div>
    </nav>
  {/if}

  <!-- Main content area -->
  <main class="main-content">
    {#if !$isAuthenticated && !isLoginPage}
      <!-- Redirect to login if not authenticated -->
      <div class="login-container">
        <div class="nes-container is-dark with-title">
          <p class="title">Access Restricted</p>
          <p class="nes-text">Please log in to access the investigation system.</p>
          <a href="/login" class="nes-btn is-primary">
            🔐 Login
          </a>
        </div>
      </div>
    {:else}
      <!-- Render page content -->
      {#if children}
        {@render children()}
      {/if}
    {/if}
  </main>
</div>